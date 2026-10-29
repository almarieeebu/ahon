import { monthAffordability } from "./affordability";
import { nextPayday } from "./cashPlan";
import { monthKey, parseAmount, todayIso, uid } from "./money";
import {
  applyRemoveTransaction,
  checkLoanPayment,
  findLiability,
  installmentShortfall,
  payNextInstallment,
  repriceInstallmentRow,
  syncBillStatus,
  unpayInstallmentRow,
} from "./payments";
import { copyBudgetTargets, summarizeMonthBudget } from "./periodBudget";
import { findParticular, resolveParticularRef } from "./refs";
import { nextUnpaid } from "./schedule";
import { accountBalances, byKind, liveAccounts } from "./selectors";
import type {
  Account,
  AppState,
  BudgetLine,
  Transaction,
} from "./types";

export type SimpleDirection = "in" | "out";

export type SimpleChip = {
  id: string;
  label: string;
  particularId: string;
};

export const SPEND_CHIPS: SimpleChip[] = [
  { id: "food", label: "Food", particularId: "p-groceries" },
  // Bills needs an explicit sub-choice (which bill) — no default particular.
  { id: "bills", label: "Bills", particularId: "" },
  { id: "load", label: "Load", particularId: "p-mobile" },
  { id: "transport", label: "Transport", particularId: "p-transport" },
  { id: "utang", label: "Utang", particularId: "p-debt" },
  { id: "other", label: "Other", particularId: "p-misc" },
];

export const INCOME_CHIPS: SimpleChip[] = [
  { id: "paycheck", label: "Paycheck / sweldo", particularId: "p-paycheck" },
];

export const BILL_PARTICULAR_IDS = new Set([
  "p-rent",
  "p-electric",
  "p-water",
  "p-internet",
]);

/** Names offered under the Bills chip: starter bills + housing/utility names. */
export function billParticulars(state: AppState): { id: string; name: string }[] {
  const chipIds = new Set(SPEND_CHIPS.map((chip) => chip.particularId).filter(Boolean));
  return state.particulars.filter((particular) => {
    if (chipIds.has(particular.id)) return false;
    if (BILL_PARTICULAR_IDS.has(particular.id)) return true;
    const category = state.categories.find((c) => c.id === particular.categoryId);
    return (
      category?.kind !== "income" &&
      (category?.tone === "utility" || category?.tone === "housing")
    );
  });
}

export type SimpleLogDraft = {
  /** Client-generated id; repeating a submit with it never duplicates. */
  id?: string;
  direction: SimpleDirection;
  amount: number;
  chipId?: string;
  particularId?: string | null;
  fromId?: string | null;
  toId?: string | null;
  date?: string;
  note?: string;
  /** Utang chip: the loan being paid. Required — never inferred. */
  liabilityId?: string | null;
  /** Explicit link to a planned bill. */
  budgetLineId?: string | null;
  /** Person confirmed paying more than what is still owed. */
  confirmOverpay?: boolean;
};

export type LogSaveFeedback = {
  cashLeft: number;
  sentence: string;
  tone: "ok" | "tight" | "need";
};

export type DailyPrompt =
  | { id: "first-log"; kind: "first-log" }
  | { id: "payday"; kind: "payday" }
  | { id: `bill:${string}`; kind: "bill"; line: BudgetLine }
  | { id: "catchup"; kind: "catchup" }
  | { id: "gastos"; kind: "gastos" };

export type PromptDismissState = {
  day: string;
  ids: string[];
};

export const PROMPT_STORAGE_KEY = "ahon.prompt.dismissed.v1";
export const RITUAL_STORAGE_KEY = "ahon.ritual.seen.v1";

export function defaultCashAccount(state: AppState): Account | undefined {
  return (
    liveAccounts(state).find((account) => account.id === "cash-on-hand") ??
    byKind(state, "cash")[0]
  );
}

export function cashAccounts(state: AppState): Account[] {
  return byKind(state, "cash");
}

export function shouldShowWalletPicker(state: AppState): boolean {
  return cashAccounts(state).length > 1;
}

export function chipsForDirection(direction: SimpleDirection): SimpleChip[] {
  return direction === "in" ? INCOME_CHIPS : SPEND_CHIPS;
}

export function moreParticulars(
  state: AppState,
  direction: SimpleDirection,
): { id: string; name: string }[] {
  const chips = chipsForDirection(direction);
  const used = new Set(chips.map((chip) => chip.particularId).filter(Boolean));
  if (direction === "out") {
    for (const bill of billParticulars(state)) used.add(bill.id);
  }
  const wantKind = direction === "in" ? "income" : "expense";
  return state.particulars.filter((particular) => {
    if (used.has(particular.id)) return false;
    const category = state.categories.find((item) => item.id === particular.categoryId);
    const kind = category?.kind ?? "expense";
    return kind === wantKind;
  });
}

export function unpaidPlanLines(state: AppState, month: string): BudgetLine[] {
  return summarizeMonthBudget(state, month).lines.filter(
    (line) =>
      // Category spending limits are not bills to pay.
      line.lineType !== "limit" &&
      line.status !== "paid" &&
      ((line.income || 0) > 0 || (line.expense || 0) > 0),
  );
}

export function monthHasPlan(state: AppState, month: string): boolean {
  return unpaidPlanLines(state, month).length > 0 ||
    summarizeMonthBudget(state, month).lines.some(
      (line) => (line.income || 0) > 0 || (line.expense || 0) > 0,
    );
}

export function monthsWithPlannedLines(state: AppState): string[] {
  const keys = new Set<string>();
  for (const period of state.budgetPeriods) {
    let cursor = period.start.slice(0, 7);
    const endKey = period.end.slice(0, 7);
    while (cursor && cursor <= endKey) {
      keys.add(cursor);
      const [year, month] = cursor.split("-").map(Number);
      cursor =
        month === 12
          ? `${year + 1}-01`
          : `${year}-${String(month + 1).padStart(2, "0")}`;
    }
  }
  for (const line of state.budgetLines) {
    if ((line.income || 0) <= 0 && (line.expense || 0) <= 0) continue;
    if (line.due) keys.add(line.due.slice(0, 7));
  }
  return [...keys].filter(Boolean).sort();
}

export function previousMonthWithPlan(
  state: AppState,
  toKey: string,
): string | null {
  const months = monthsWithPlannedLines(state).filter((key) => key < toKey);
  return months[months.length - 1] ?? null;
}

/**
 * Unpaid planned bills (non-debt expense lines) for a month. The person picks
 * one explicitly to link an expense; nothing is auto-selected.
 */
export function billLinesForMonth(state: AppState, month: string): BudgetLine[] {
  return unpaidPlanLines(state, month).filter(
    (line) => (line.expense || 0) > 0 && !isDebtLine(state, line),
  );
}

function isDebtLine(state: AppState, line: BudgetLine): boolean {
  const particular = findParticular(state.particulars, {
    id: line.particularId,
    name: line.particular,
  });
  if (particular?.id === "p-debt" || particular?.categoryId === "cat-debt") {
    return true;
  }
  const category = state.categories.find(
    (item) => item.id === (particular?.categoryId ?? ""),
  );
  return category?.tone === "loan" || category?.id === "cat-debt";
}

/**
 * Loan for a planned debt line: only an exact, unique name match counts.
 * Never falls back to the first loan.
 */
function matchingLiability(state: AppState, line: BudgetLine): Account | undefined {
  const name = (line.particular || "").trim().toLowerCase();
  if (!name) return undefined;
  const hits = byKind(state, "liability").filter(
    (debt) => debt.name.trim().toLowerCase() === name,
  );
  return hits.length === 1 ? hits[0] : undefined;
}

export type SimpleDraftErrors = Partial<
  Record<"amount" | "category" | "wallet" | "loan" | "bill" | "date", string>
>;

/** Field-level problems with a draft; empty object means it can be saved. */
export function simpleDraftErrors(
  state: AppState,
  draft: SimpleLogDraft,
): SimpleDraftErrors {
  const errors: SimpleDraftErrors = {};
  const amount = parseAmount(draft.amount);
  if (!amount.ok) errors.amount = amount.error;

  if (draft.date != null && !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) {
    errors.date = "Choose a valid date.";
  }

  const chip = chipsForDirection(draft.direction).find((c) => c.id === draft.chipId);
  if (!draft.particularId && !chip && !draft.budgetLineId) {
    errors.category =
      draft.direction === "in" ? "Choose where the money came from." : "Choose a category.";
  }
  if (
    draft.direction === "out" &&
    chip?.id === "bills" &&
    !draft.particularId &&
    !draft.budgetLineId
  ) {
    errors.category = "Choose which bill this was.";
  }

  if (draft.budgetLineId) {
    const line = state.budgetLines.find((l) => l.id === draft.budgetLineId);
    if (!line) errors.bill = "That planned bill no longer exists.";
  }

  const isUtang = draft.direction === "out" && chip?.id === "utang" && !draft.particularId;
  if (isUtang) {
    const check = checkLoanPayment(state, {
      liabilityId: draft.liabilityId ?? null,
      amount: amount.ok ? amount.value : 0,
      confirmOverpay: draft.confirmOverpay,
    });
    if (check.error) errors.loan = check.error;
  }

  const wallets = cashAccounts(state);
  const walletId = draft.direction === "in" ? draft.toId : draft.fromId;
  if (walletId && !wallets.some((w) => w.id === walletId)) {
    errors.wallet = "Choose a wallet.";
  } else if (!walletId && !defaultCashAccount(state) && !isUtang) {
    errors.wallet = "Add a wallet first.";
  }
  return errors;
}

function resolveChipParticular(
  state: AppState,
  draft: SimpleLogDraft,
): { particularId: string | null; particular: string; category: string } {
  const fallbackCategory = draft.direction === "in" ? "cat-salary" : "cat-others";
  const line = draft.budgetLineId
    ? state.budgetLines.find((l) => l.id === draft.budgetLineId)
    : undefined;
  if (draft.particularId || (line && !draft.particularId)) {
    const ref = resolveParticularRef(
      state.particulars,
      draft.particularId ?? line?.particularId,
      draft.particularId ? "" : (line?.particular ?? ""),
    );
    const particular = state.particulars.find((item) => item.id === ref.particularId);
    return {
      particularId: ref.particularId,
      particular: ref.particular,
      category: particular?.categoryId ?? fallbackCategory,
    };
  }

  const chip = chipsForDirection(draft.direction).find((item) => item.id === draft.chipId);
  const ref = resolveParticularRef(
    state.particulars,
    chip?.particularId || null,
    chip?.label ?? "",
  );
  const particular = state.particulars.find((item) => item.id === ref.particularId);
  return {
    particularId: ref.particularId,
    particular: ref.particular || chip?.label || "",
    category: particular?.categoryId ?? fallbackCategory,
  };
}

export function buildSimpleTransaction(
  state: AppState,
  draft: SimpleLogDraft,
): Omit<Transaction, "id"> | null {
  if (Object.keys(simpleDraftErrors(state, draft)).length > 0) return null;
  const parsed = parseAmount(draft.amount);
  if (!parsed.ok) return null;
  const amount = parsed.value;

  const cash = defaultCashAccount(state);
  const date = draft.date ?? todayIso();
  const tags = resolveChipParticular(state, draft);
  const note = draft.note?.trim() ?? "";
  const budgetLineId = draft.budgetLineId ?? null;

  if (draft.direction === "in") {
    return {
      date,
      kind: "income",
      amount,
      category: tags.category || "cat-salary",
      particular: tags.particular,
      particularId: tags.particularId,
      fromId: null,
      toId: draft.toId || (cash?.id ?? null),
      note,
      budgetLineId,
    };
  }

  const fromCash = draft.fromId || (cash?.id ?? null);
  const chip = SPEND_CHIPS.find((item) => item.id === draft.chipId);
  if (chip?.id === "utang" && !draft.particularId) {
    // Explicit loan only (validated above); no first-loan fallback.
    return {
      date,
      kind: "payment",
      amount,
      category: "debt",
      particular: tags.particular,
      particularId: tags.particularId,
      fromId: fromCash,
      toId: draft.liabilityId ?? null,
      note,
      budgetLineId,
    };
  }

  if (!fromCash) return null;
  return {
    date,
    kind: "expense",
    amount,
    category: tags.category || "cat-others",
    particular: tags.particular,
    particularId: tags.particularId,
    fromId: fromCash,
    toId: null,
    note,
    budgetLineId,
  };
}

export function applySimpleLog(state: AppState, draft: SimpleLogDraft): AppState | null {
  // Idempotent: a repeated submit with the same id never adds a second row.
  if (draft.id && state.transactions.some((row) => row.id === draft.id)) {
    return state;
  }
  const payload = buildSimpleTransaction(state, draft);
  if (!payload) return null;
  const ref = resolveParticularRef(
    state.particulars,
    payload.particularId,
    payload.particular,
  );
  let accounts = state.accounts;
  let installmentId: string | undefined;
  if (payload.kind === "payment" && payload.toId) {
    const loan = findLiability(state, payload.toId);
    if (loan?.mode === "installment" && loan.schedule?.length) {
      const paid = payNextInstallment(accounts, loan, payload.amount);
      if (paid) {
        accounts = paid.accounts;
        installmentId = paid.installmentId;
      }
    }
  }
  const next: AppState = {
    ...state,
    accounts,
    transactions: [
      ...state.transactions,
      {
        ...payload,
        ...ref,
        id: draft.id ?? uid(),
        ...(installmentId ? { installmentId } : {}),
      },
    ],
  };
  return syncBillStatus(next, [payload.budgetLineId]);
}

export function applyUpdateTransaction(
  state: AppState,
  tx: Transaction,
): AppState | null {
  const current = state.transactions.find((row) => row.id === tx.id);
  if (!current) return null;
  const ref = resolveParticularRef(
    state.particulars,
    tx.particularId,
    tx.particular,
  );
  let nextTx: Transaction = { ...tx, ...ref };
  let accounts = state.accounts;

  // Keep installment schedules consistent with the edited payment.
  if (current.installmentId && current.toId) {
    const sameLoan = nextTx.kind === "payment" && nextTx.toId === current.toId;
    if (!sameLoan) {
      accounts = unpayInstallmentRow(
        accounts,
        current.toId,
        current.installmentId,
        current.amount,
      );
      nextTx = { ...nextTx, installmentId: undefined };
    } else if (nextTx.amount !== current.amount) {
      accounts = repriceInstallmentRow(
        accounts,
        current.toId,
        current.installmentId,
        current.amount,
        nextTx.amount,
      );
    }
  }
  if (nextTx.kind === "payment" && nextTx.toId && !nextTx.installmentId) {
    const loan = accounts.find((a) => a.id === nextTx.toId);
    if (loan?.kind === "liability" && loan.mode === "installment" && loan.schedule?.length) {
      const paid = payNextInstallment(accounts, loan, nextTx.amount);
      if (paid) {
        accounts = paid.accounts;
        nextTx = { ...nextTx, installmentId: paid.installmentId };
      }
    }
  }

  const next: AppState = {
    ...state,
    accounts,
    transactions: state.transactions.map((row) =>
      row.id === tx.id ? nextTx : row,
    ),
  };
  return syncBillStatus(next, [current.budgetLineId, nextTx.budgetLineId]);
}

export function applySimpleUpdate(
  state: AppState,
  id: string,
  draft: SimpleLogDraft,
): AppState | null {
  const current = state.transactions.find((row) => row.id === id);
  if (!current || current.kind === "adjustment" || current.kind === "borrow") {
    return null;
  }
  // Validate against books without this row so its own amount does not
  // count against the remaining loan balance.
  const without = applyRemoveTransaction(state, id);
  const payload = buildSimpleTransaction(without, {
    ...draft,
    budgetLineId:
      draft.budgetLineId !== undefined ? draft.budgetLineId : current.budgetLineId,
  });
  if (!payload) return null;
  const ref = resolveParticularRef(
    state.particulars,
    payload.particularId,
    payload.particular,
  );
  return applyUpdateTransaction(state, {
    ...current,
    ...payload,
    ...ref,
    id,
    date: draft.date ?? current.date,
    note: draft.note !== undefined ? draft.note.trim() : current.note,
    installmentId: current.installmentId,
  });
}

export function chipIdForParticular(
  direction: SimpleDirection,
  particularId: string | null | undefined,
  state?: AppState,
): string {
  const chips = chipsForDirection(direction);
  const hit = chips.find((chip) => chip.particularId && chip.particularId === particularId);
  if (hit) return hit.id;
  if (
    direction === "out" &&
    state &&
    particularId &&
    billParticulars(state).some((p) => p.id === particularId)
  ) {
    return "bills";
  }
  return "";
}

function paymentFromLine(
  state: AppState,
  line: BudgetLine,
  amount: number,
  date: string,
  cashId: string | null,
  liabilityId?: string | null,
): { accounts: Account[]; transaction: Transaction } | null {
  const debt = liabilityId
    ? findLiability(state, liabilityId)
    : matchingLiability(state, line);
  if (!debt) return null;
  const ref = resolveParticularRef(
    state.particulars,
    line.particularId,
    line.particular,
  );

  if (debt.mode === "installment" && debt.schedule?.length) {
    const next = nextUnpaid(debt.schedule);
    // Pay what is still due on that installment (after partial payments).
    const due = next ? installmentShortfall(next) : 0;
    const paid = next && due > 0 ? payNextInstallment(state.accounts, debt, due) : null;
    if (next && paid) {
      return {
        accounts: paid.accounts,
        transaction: {
          id: uid(),
          date,
          kind: "payment",
          amount: due,
          category: "debt",
          particular: ref.particular,
          particularId: ref.particularId,
          fromId: cashId,
          toId: debt.id,
          note: `${debt.name} · ${next.due}`,
          installmentId: next.id,
          budgetLineId: line.id,
        },
      };
    }
  }

  return {
    accounts: state.accounts,
    transaction: {
      id: uid(),
      date,
      kind: "payment",
      amount,
      category: "debt",
      particular: ref.particular,
      particularId: ref.particularId,
      fromId: cashId,
      toId: debt.id,
      note: "",
      budgetLineId: line.id,
    },
  };
}

/**
 * "I paid this" on a planned line. A debt line only reduces a loan when the
 * loan is given explicitly (liabilityId) or its name matches exactly and
 * uniquely; otherwise it is recorded as debt-category spending linked to the
 * line, never applied to some other loan.
 */
export function payBudgetLine(
  state: AppState,
  lineId: string,
  today = todayIso(),
  liabilityId?: string | null,
): AppState | null {
  const line = state.budgetLines.find((item) => item.id === lineId);
  if (!line || line.status === "paid") return null;
  if (liabilityId && !findLiability(state, liabilityId)) return null;

  const amount = Math.round(
    ((line.income || 0) > 0 && (line.expense || 0) <= 0
      ? line.income
      : line.expense || line.income || 0) * 100,
  ) / 100;
  if (amount <= 0) return null;

  const cash = defaultCashAccount(state);
  const cashId = cash?.id ?? null;
  const isIncome = (line.income || 0) > 0 && (line.expense || 0) <= 0;
  let accounts = state.accounts;
  let transaction: Transaction;

  if (isIncome) {
    const ref = resolveParticularRef(
      state.particulars,
      line.particularId,
      line.particular,
    );
    transaction = {
      id: uid(),
      date: today,
      kind: "income",
      amount,
      category:
        state.particulars.find((item) => item.id === ref.particularId)?.categoryId ??
        "cat-salary",
      particular: ref.particular,
      particularId: ref.particularId,
      fromId: null,
      toId: cashId,
      note: "",
      budgetLineId: line.id,
    };
  } else if (isDebtLine(state, line)) {
    const paid = paymentFromLine(state, line, amount, today, cashId, liabilityId);
    if (!paid) {
      const ref = resolveParticularRef(
        state.particulars,
        line.particularId,
        line.particular,
      );
      if (!cashId) return null;
      transaction = {
        id: uid(),
        date: today,
        kind: "expense",
        amount,
        category: "cat-debt",
        particular: ref.particular,
        particularId: ref.particularId,
        fromId: cashId,
        toId: null,
        note: "",
        budgetLineId: line.id,
      };
    } else {
      accounts = paid.accounts;
      transaction = paid.transaction;
    }
  } else {
    if (!cashId) return null;
    const ref = resolveParticularRef(
      state.particulars,
      line.particularId,
      line.particular,
    );
    transaction = {
      id: uid(),
      date: today,
      kind: "expense",
      amount,
      category:
        state.particulars.find((item) => item.id === ref.particularId)?.categoryId ??
        "cat-others",
      particular: ref.particular,
      particularId: ref.particularId,
      fromId: cashId,
      toId: null,
      note: "",
      budgetLineId: line.id,
    };
  }

  return {
    ...state,
    accounts,
    budgetLines: state.budgetLines.map((item) =>
      // The linked transaction is the record; no manual actual is written.
      item.id === lineId ? { ...item, status: "paid" } : item,
    ),
    transactions: [...state.transactions, transaction],
  };
}

/** Copy a month's budget targets (see copyBudgetTargets). */
export function copyBudgetMonth(
  state: AppState,
  fromKey: string,
  toKey: string,
): AppState | null {
  return copyBudgetTargets(state, fromKey, toKey);
}

export function logSaveFeedback(
  state: AppState,
  today = todayIso(),
): LogSaveFeedback {
  const cash = accountBalances(state);
  const cashLeft = byKind(state, "cash").reduce(
    (sum, account) => sum + (cash[account.id] ?? 0),
    0,
  );
  const afford = monthAffordability(state, today.slice(0, 7), cashLeft);
  const payday = nextPayday(state.settings.paydayDays, today);
  const paydayLabel = payday
    ? new Date(`${payday}T12:00:00`).toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
      })
    : "";

  if (afford.verdict === "no") {
    return {
      cashLeft,
      tone: "need",
      sentence: "Need more this month to cover bills and utang.",
    };
  }
  if (afford.verdict === "tight") {
    return {
      cashLeft,
      tone: "tight",
      sentence: paydayLabel
        ? `Tight until ${paydayLabel} — little room after bills and utang.`
        : "Tight month — little room after bills and utang.",
    };
  }
  return {
    cashLeft,
    tone: "ok",
    sentence: paydayLabel
      ? `Still okay until ${paydayLabel}.`
      : "Still okay this month.",
  };
}

export function monthStatusSentence(
  state: AppState,
  month = monthKey(),
  today = todayIso(),
): LogSaveFeedback {
  const cashLeft = byKind(state, "cash").reduce(
    (sum, account) => sum + (accountBalances(state)[account.id] ?? 0),
    0,
  );
  const afford = monthAffordability(state, month, cashLeft);
  if (afford.income <= 0 && afford.obligations <= 0) {
    return {
      cashLeft,
      tone: "ok",
      sentence: "Add your usual bills or log money to see if you are okay this month.",
    };
  }
  return logSaveFeedback(state, today);
}

function dayNumber(iso: string): number {
  return Number(iso.slice(-2));
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`);
  const b = new Date(`${to}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function pickDailyPrompt(
  state: AppState,
  opts?: {
    today?: string;
    hour?: number;
    dismissedIds?: string[];
  },
): DailyPrompt | null {
  const today = opts?.today ?? todayIso();
  const hour = opts?.hour ?? new Date().getHours();
  const dismissed = new Set(opts?.dismissedIds ?? []);
  const month = today.slice(0, 7);
  const txs = state.transactions.filter((tx) => tx.kind !== "adjustment");

  if (txs.length === 0 && !dismissed.has("first-log")) {
    return { id: "first-log", kind: "first-log" };
  }

  const paydayDays = state.settings.paydayDays;
  const isPayday = paydayDays.includes(dayNumber(today));
  const incomeToday = txs.some((tx) => tx.kind === "income" && tx.date === today);
  if (isPayday && !incomeToday && !dismissed.has("payday")) {
    return { id: "payday", kind: "payday" };
  }

  const dueBills = unpaidPlanLines(state, month)
    .filter((line) => (line.expense || 0) > 0 && line.due && line.due <= today)
    .sort((a, b) => a.due.localeCompare(b.due));
  const dueBill = dueBills.find((line) => !dismissed.has(`bill:${line.id}`));
  if (dueBill) {
    return { id: `bill:${dueBill.id}`, kind: "bill", line: dueBill };
  }

  const lastSpend = [...txs]
    .filter((tx) => tx.kind === "expense" || tx.kind === "payment")
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (
    lastSpend &&
    daysBetween(lastSpend.date, today) >= 3 &&
    !dismissed.has("catchup")
  ) {
    return { id: "catchup", kind: "catchup" };
  }

  const spentToday = txs.some(
    (tx) =>
      (tx.kind === "expense" || tx.kind === "payment") && tx.date === today,
  );
  if (hour >= 17 && !spentToday && !dismissed.has("gastos")) {
    return { id: "gastos", kind: "gastos" };
  }

  return null;
}

export function loadPromptDismissals(today = todayIso()): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PROMPT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PromptDismissState;
    if (parsed.day !== today) return [];
    return Array.isArray(parsed.ids) ? parsed.ids : [];
  } catch {
    return [];
  }
}

export function dismissPrompt(id: string, today = todayIso()): string[] {
  const ids = [...new Set([...loadPromptDismissals(today), id])];
  if (typeof window === "undefined") return ids;
  try {
    const payload: PromptDismissState = { day: today, ids };
    window.localStorage.setItem(PROMPT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
  return ids;
}

export function hasSeenRitual(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(RITUAL_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function markRitualSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RITUAL_STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function lineActionLabel(line: BudgetLine): string {
  if ((line.income || 0) > 0 && (line.expense || 0) <= 0) return "I got paid";
  return "I paid this";
}
