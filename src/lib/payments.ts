import { emptyAccount } from "./defaults";
import { MAX_AMOUNT, parseAmount, roundCentavos, todayIso, uid } from "./money";
import { installmentPaidSoFar, nextUnpaid, scheduleRemaining } from "./schedule";
import { accountBalances, byKind, liabilityLeft } from "./selectors";
import type { Account, AppState, Installment, Transaction } from "./types";

/** Live liability by explicit id — never falls back to another loan. */
export function findLiability(
  state: AppState,
  liabilityId: string | null | undefined,
): Account | undefined {
  if (!liabilityId) return undefined;
  return byKind(state, "liability").find((a) => a.id === liabilityId);
}

/** What is still owed on one loan right now. */
export function liabilityRemaining(state: AppState, liabilityId: string): number {
  const account = state.accounts.find((a) => a.id === liabilityId);
  if (!account || account.kind !== "liability") return 0;
  const balances = accountBalances(state);
  return roundCentavos(liabilityLeft(account, balances[liabilityId] ?? 0));
}

export type LoanPaymentCheck = {
  /** Blocking problem; when set the payment must not be saved. */
  error: string | null;
  /** "no-loans" lets the UI offer Add loan instead of a picker. */
  reason: "ok" | "no-loans" | "no-loan-chosen" | "unknown-loan" | "overpay";
  remaining: number;
  /** Amount above what is still owed (0 when not an overpayment). */
  excess: number;
};

/**
 * Validate a loan payment target + amount. Requires an explicit loan id and,
 * when the amount is more than what is left, an explicit confirmation.
 */
export function checkLoanPayment(
  state: AppState,
  input: { liabilityId?: string | null; amount: number; confirmOverpay?: boolean },
): LoanPaymentCheck {
  const loans = byKind(state, "liability");
  if (loans.length === 0) {
    return {
      error: "You have no loans yet. Add a loan first, then record the payment.",
      reason: "no-loans",
      remaining: 0,
      excess: 0,
    };
  }
  if (!input.liabilityId) {
    return {
      error: "Choose which loan this payment is for.",
      reason: "no-loan-chosen",
      remaining: 0,
      excess: 0,
    };
  }
  const loan = findLiability(state, input.liabilityId);
  if (!loan) {
    return {
      error: "That loan is no longer active. Choose another loan.",
      reason: "unknown-loan",
      remaining: 0,
      excess: 0,
    };
  }
  const remaining = liabilityRemaining(state, loan.id);
  const excess = roundCentavos(Math.max(0, input.amount - remaining));
  if (excess > 0 && !input.confirmOverpay) {
    return {
      error: `This is more than the ${remaining.toFixed(2)} still owed on ${loan.name}. Confirm to record it anyway.`,
      reason: "overpay",
      remaining,
      excess,
    };
  }
  return { error: null, reason: "ok", remaining, excess };
}

/**
 * Shift recorded balance-after values on paid rows from `fromIndex` onward,
 * so remaining balance stays consistent after an edit/removal mid-schedule.
 */
function shiftPaidBalances(
  schedule: Installment[],
  fromIndex: number,
  delta: number,
): Installment[] {
  if (!delta) return schedule;
  return schedule.map((row, i) =>
    i >= fromIndex && row.status === "paid" && row.balanceAfter != null
      ? { ...row, balanceAfter: Math.max(0, roundCentavos(row.balanceAfter + delta)) }
      : row,
  );
}

const FULL_EPSILON = 0.005;

function isCovered(paid: number, amount: number): boolean {
  return paid >= amount - FULL_EPSILON;
}

/**
 * Take `removed` back from one installment (its payment was deleted or moved).
 * Partial-payment rows keep what is still paid; legacy rows (no paidAmount)
 * go back to unpaid. Later paid rows get the amount back on their balance.
 */
export function unpayInstallmentRow(
  accounts: Account[],
  accountId: string,
  installmentId: string,
  removed: number,
): Account[] {
  return accounts.map((a) => {
    if (a.id !== accountId || !a.schedule) return a;
    const index = a.schedule.findIndex((r) => r.id === installmentId);
    if (index < 0) return a;
    const row = a.schedule[index];
    if (row.paidAmount == null) {
      if (row.status !== "paid") return a;
      const schedule = shiftPaidBalances(
        a.schedule.map((r, i) =>
          i === index ? { ...r, status: "unpaid" as const, balanceAfter: null } : r,
        ),
        index + 1,
        removed,
      );
      return { ...a, schedule };
    }
    const left = roundCentavos(Math.max(0, row.paidAmount - removed));
    const paidAmount = left > 0 ? left : undefined;
    if (row.status !== "paid") {
      return {
        ...a,
        schedule: shiftPaidBalances(
          a.schedule.map((r, i) => (i === index ? { ...r, paidAmount } : r)),
          index + 1,
          removed,
        ),
      };
    }
    if (isCovered(left, row.amount)) {
      // Still fully paid (it had been overpaid): only the balance moves.
      return {
        ...a,
        schedule: shiftPaidBalances(
          a.schedule.map((r, i) => (i === index ? { ...r, paidAmount } : r)),
          index,
          removed,
        ),
      };
    }
    const schedule = shiftPaidBalances(
      a.schedule.map((r, i) =>
        i === index
          ? { ...r, status: "unpaid" as const, balanceAfter: null, paidAmount }
          : r,
      ),
      index + 1,
      removed,
    );
    return { ...a, schedule };
  });
}

/** Re-base an installment after its payment amount was edited. */
export function repriceInstallmentRow(
  accounts: Account[],
  accountId: string,
  installmentId: string,
  oldAmount: number,
  newAmount: number,
): Account[] {
  const delta = roundCentavos(oldAmount - newAmount);
  if (!delta) return accounts;
  const account = accounts.find((a) => a.id === accountId);
  const row = account?.schedule?.find((r) => r.id === installmentId);
  if (!account?.schedule || !row) return accounts;
  if (row.paidAmount == null) {
    if (row.status !== "paid") return accounts;
    return accounts.map((a) => {
      if (a.id !== accountId || !a.schedule) return a;
      const index = a.schedule.findIndex((r) => r.id === installmentId);
      return { ...a, schedule: shiftPaidBalances(a.schedule, index, delta) };
    });
  }
  // Partial-aware rows: take the old amount off, then apply the new one.
  const without = unpayInstallmentRow(accounts, accountId, installmentId, oldAmount);
  return applyToInstallment(without, accountId, installmentId, newAmount);
}

/**
 * Apply `amount` to one installment: adds to what is paid on it, marks it
 * paid only once the scheduled amount is covered, and records the balance
 * left after it. Anything above the scheduled amount still lowers the
 * balance (it is kept on this row so a delete can reverse it exactly).
 */
function applyToInstallment(
  accounts: Account[],
  accountId: string,
  installmentId: string,
  amount: number,
): Account[] {
  return accounts.map((a) => {
    if (a.id !== accountId || !a.schedule) return a;
    const index = a.schedule.findIndex((r) => r.id === installmentId);
    if (index < 0) return a;
    const row = a.schedule[index];
    const before = scheduleRemaining(a.openingBalance, a.schedule);
    const after = Math.max(0, roundCentavos(before - amount));
    if (row.status === "paid") {
      // Adding to an already paid row (e.g. an edit raised the amount).
      return {
        ...a,
        schedule: shiftPaidBalances(
          a.schedule.map((r, i) =>
            i === index
              ? { ...r, paidAmount: roundCentavos(installmentPaidSoFar(r) + amount) }
              : r,
          ),
          index,
          -amount,
        ),
      };
    }
    const paidAmount = roundCentavos((row.paidAmount ?? 0) + amount);
    const full = isCovered(paidAmount, row.amount);
    // Later rows already marked paid (out-of-order history) also owe less.
    return {
      ...a,
      schedule: shiftPaidBalances(
        a.schedule.map((r, i) =>
          i === index
            ? {
                ...r,
                paidAmount,
                status: full ? ("paid" as const) : ("unpaid" as const),
                balanceAfter: full ? after : null,
              }
            : r,
        ),
        index + 1,
        -amount,
      ),
    };
  });
}

/**
 * Apply a payment of `amount` to the next unpaid installment of a schedule
 * loan. A smaller amount is a partial payment (row stays unpaid, its paid
 * amount grows); the row is marked paid only once fully covered.
 * Returns null when the loan has no unpaid installment.
 */
export function payNextInstallment(
  accounts: Account[],
  loan: Account,
  amount: number,
): { accounts: Account[]; installmentId: string; due: string; fullyPaid: boolean } | null {
  const next = nextUnpaid(loan.schedule);
  if (!next) return null;
  const nextAccounts = applyToInstallment(accounts, loan.id, next.id, amount);
  const row = nextAccounts
    .find((a) => a.id === loan.id)
    ?.schedule?.find((r) => r.id === next.id);
  return {
    installmentId: next.id,
    due: next.due,
    fullyPaid: row?.status === "paid",
    accounts: nextAccounts,
  };
}

/** What is still due on one installment after partial payments. */
export function installmentShortfall(row: Installment): number {
  if (row.status === "paid") return 0;
  return roundCentavos(Math.max(0, row.amount - (row.paidAmount ?? 0)));
}

/**
 * Record a payment toward one explicit loan. Wallet/revolving balances are
 * derived from the transaction; schedule loans also apply it to the next
 * unpaid installment (partial payments allowed). Overpaying needs
 * `confirmOverpay`. Returns null when the payment cannot be saved.
 * Passing an `id` that already exists is a no-op (double submit / retry).
 */
export function applyLoanPayment(
  state: AppState,
  input: {
    liabilityId: string;
    amount: number;
    fromId: string | null;
    date?: string;
    note?: string;
    id?: string;
    confirmOverpay?: boolean;
  },
): AppState | null {
  if (input.id && state.transactions.some((t) => t.id === input.id)) return state;
  const amount = parseAmount(input.amount);
  if (!amount.ok) return null;
  const check = checkLoanPayment(state, {
    liabilityId: input.liabilityId,
    amount: amount.value,
    confirmOverpay: input.confirmOverpay,
  });
  if (check.error) return null;
  const loan = findLiability(state, input.liabilityId);
  if (!loan) return null;
  if (input.fromId) {
    const source = state.accounts.find(
      (a) => a.id === input.fromId && a.kind !== "liability" && !a.archived,
    );
    if (!source) return null;
  }
  let accounts = state.accounts;
  let installmentId: string | undefined;
  let note = input.note?.trim() ?? "";
  if (loan.mode === "installment" && loan.schedule?.length) {
    const paid = payNextInstallment(accounts, loan, amount.value);
    if (paid) {
      accounts = paid.accounts;
      installmentId = paid.installmentId;
      if (!note) note = `${loan.name} · ${paid.due}`;
    }
  }
  if (!note && input.fromId == null) note = "Paid from untracked source";
  const tx: Transaction = {
    id: input.id ?? uid(),
    date: input.date ?? todayIso(),
    kind: "payment",
    amount: amount.value,
    category: "debt",
    particular: "",
    particularId: null,
    fromId: input.fromId,
    toId: loan.id,
    note,
    ...(installmentId ? { installmentId } : {}),
  };
  return { ...state, accounts, transactions: [...state.transactions, tx] };
}

/** Planned bill is paid while at least one transaction links to it. */
export function syncBillStatus(
  state: AppState,
  budgetLineIds: (string | null | undefined)[],
): AppState {
  const ids = new Set(budgetLineIds.filter((id): id is string => Boolean(id)));
  if (ids.size === 0) return state;
  return {
    ...state,
    budgetLines: state.budgetLines.map((line) => {
      if (!ids.has(line.id)) return line;
      const linked = state.transactions.some((t) => t.budgetLineId === line.id);
      if (linked) return line.status === "paid" ? line : { ...line, status: "paid" };
      // Only undo what a link set; keep hand-entered legacy actuals untouched
      // unless they were written by the removed payment (payBudgetLine).
      return { ...line, status: "unpaid" };
    }),
  };
}

/**
 * Remove a transaction and reverse everything it changed: wallet and
 * revolving-loan balances are derived from transactions, so dropping the row
 * reverses them; schedule status and planned-bill status are reset here.
 */
export function applyRemoveTransaction(state: AppState, id: string): AppState {
  const tx = state.transactions.find((t) => t.id === id);
  if (!tx) return state;
  let accounts = state.accounts;
  if (tx.installmentId && tx.toId) {
    accounts = unpayInstallmentRow(accounts, tx.toId, tx.installmentId, tx.amount);
  }
  let budgetLines = state.budgetLines;
  if (tx.budgetLineId) {
    budgetLines = budgetLines.map((line) =>
      line.id === tx.budgetLineId && line.actual === tx.amount
        ? { ...line, actual: null }
        : line,
    );
  }
  const next: AppState = {
    ...state,
    accounts,
    budgetLines,
    transactions: state.transactions.filter((t) => t.id !== id),
  };
  return syncBillStatus(next, [tx.budgetLineId]);
}

/** Wallet created inline. Empty balance => balance incomplete, not ₱0. */
export function createWallet(
  state: AppState,
  name: string,
  balanceInput: string,
): { state: AppState; accountId: string } | { error: string } {
  const label = name.trim();
  if (!label) return { error: "Name the wallet, like Cash or GCash." };
  const account = emptyAccount("cash", label);
  if (balanceInput.trim() === "") {
    account.openingBalance = 0;
    account.balanceKnown = false;
  } else {
    const raw = balanceInput.trim().replace(/[₱,\s]/g, "");
    const n = Number(raw);
    if (!Number.isFinite(n) || Math.abs(n) > MAX_AMOUNT || raw === "") {
      return { error: "Starting balance must be a number, or leave it blank." };
    }
    account.openingBalance = roundCentavos(n);
    account.balanceKnown = true;
  }
  return {
    accountId: account.id,
    state: { ...state, accounts: [...state.accounts, account] },
  };
}

/**
 * Loan proceeds received now: debt and the receiving wallet both go up.
 * Recorded as kind "borrow", never as income.
 */
export function applyBorrow(
  state: AppState,
  input: {
    liabilityId: string;
    amount: number;
    toId: string | null;
    date?: string;
    note?: string;
    id?: string;
  },
): AppState | null {
  const loan = findLiability(state, input.liabilityId);
  if (!loan) return null;
  const amount = parseAmount(input.amount);
  if (!amount.ok) return null;
  if (input.id && state.transactions.some((t) => t.id === input.id)) return state;
  const wallet = input.toId
    ? state.accounts.find((a) => a.id === input.toId && a.kind !== "liability")
    : undefined;
  if (input.toId && !wallet) return null;
  const tx: Transaction = {
    id: input.id ?? uid(),
    date: input.date ?? todayIso(),
    kind: "borrow",
    amount: amount.value,
    category: "loan-proceeds",
    particular: "",
    particularId: null,
    fromId: loan.id,
    toId: wallet?.id ?? null,
    note: input.note?.trim() ?? "",
  };
  return { ...state, transactions: [...state.transactions, tx] };
}
