import { emptyAccount } from "./defaults";
import { parseAmount, roundCentavos, todayIso, uid } from "./money";
import { applyBorrow, createWallet } from "./payments";
import { buildMonthlySchedule } from "./schedule";
import type { Account, AppState, LiabilityType } from "./types";

/** Optional details shared by both ways of adding a loan. All may be blank. */
export type LoanDetailsInput = {
  /** Next due date, YYYY-MM-DD. */
  nextDue?: string;
  /** Regular payment amount, e.g. monthly. */
  payment?: string;
  /** Number of payments left; with nextDue + payment builds a schedule. */
  paymentsLeft?: string;
  /** Interest per month in percent. Blank = not known (never stored as 0%). */
  monthlyRatePct?: string;
  liabilityType?: LiabilityType;
};

export type ExistingLoanInput = LoanDetailsInput & {
  name: string;
  /** Amount still owed today. */
  owed: string;
  /** Fixed id so a double submit cannot add the loan twice. */
  id?: string;
};

export type NewBorrowingInput = LoanDetailsInput & {
  name: string;
  amount: string;
  /** Receiving wallet id, or omit and pass newWallet to create one inline. */
  walletId?: string;
  newWallet?: { name: string; balance: string };
  date?: string;
  id?: string;
  txId?: string;
};

export type LoanFieldErrors = Partial<
  Record<
    | "name"
    | "owed"
    | "amount"
    | "wallet"
    | "date"
    | "nextDue"
    | "payment"
    | "paymentsLeft"
    | "monthlyRatePct",
    string
  >
>;

export type LoanResult =
  | { ok: true; state: AppState; loanId: string; walletId?: string }
  | { ok: false; errors: LoanFieldErrors };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

type ParsedDetails = {
  nextDue: string;
  payment: number;
  paymentsLeft: number;
  rate: number | null;
};

function parseDetails(
  input: LoanDetailsInput,
  errors: LoanFieldErrors,
): ParsedDetails {
  const out: ParsedDetails = { nextDue: "", payment: 0, paymentsLeft: 0, rate: null };
  const nextDue = input.nextDue?.trim() ?? "";
  if (nextDue) {
    if (validIsoDate(nextDue)) out.nextDue = nextDue;
    else errors.nextDue = "Enter a valid date, or leave it blank.";
  }
  const payment = input.payment?.trim() ?? "";
  if (payment) {
    const parsed = parseAmount(payment);
    if (parsed.ok) out.payment = parsed.value;
    else errors.payment = parsed.error;
  }
  const left = input.paymentsLeft?.trim() ?? "";
  if (left) {
    const n = Number(left);
    if (Number.isInteger(n) && n >= 1 && n <= 600) out.paymentsLeft = n;
    else errors.paymentsLeft = "Enter a whole number of payments from 1 to 600, or leave it blank.";
  }
  const rate = input.monthlyRatePct?.trim() ?? "";
  if (rate) {
    const n = Number(rate.replace(/%/g, ""));
    if (Number.isFinite(n) && n >= 0 && n <= 100) out.rate = n / 100;
    else errors.monthlyRatePct = "Enter interest as a percent from 0 to 100, or leave it blank if you do not know.";
  }
  return out;
}

/** True when there is enough to build a repayment schedule. */
export function canBuildSchedule(input: LoanDetailsInput): boolean {
  return Boolean(
    input.nextDue?.trim() && input.payment?.trim() && input.paymentsLeft?.trim(),
  );
}

function baseLoan(name: string, details: ParsedDetails, type?: LiabilityType, id?: string): Account {
  const account = emptyAccount("liability", name);
  if (id) account.id = id;
  account.liabilityType = type ?? "other";
  account.mode = "revolving";
  account.plannedPayment = details.payment;
  account.dueDay = details.nextDue ? Number(details.nextDue.slice(8, 10)) : 0;
  if (details.rate == null) {
    account.monthlyRate = 0;
    account.interestKnown = false;
  } else {
    account.monthlyRate = details.rate;
    account.interestKnown = true;
  }
  return account;
}

/**
 * A loan the person already owes: adds the debt as an opening balance.
 * Cash does not change (no transaction is written).
 */
export function applyAddExistingLoan(state: AppState, input: ExistingLoanInput): LoanResult {
  const errors: LoanFieldErrors = {};
  const name = input.name.trim();
  if (!name) errors.name = "Name the loan, like SSS loan or Utang kay Ate.";
  const owed = parseAmount(input.owed);
  if (!owed.ok) errors.owed = owed.error;
  const details = parseDetails(input, errors);
  if (Object.keys(errors).length > 0 || !owed.ok) return { ok: false, errors };
  if (input.id && state.accounts.some((a) => a.id === input.id)) {
    return { ok: true, state, loanId: input.id };
  }
  const account = baseLoan(name, details, input.liabilityType, input.id);
  account.openingBalance = owed.value;
  if (details.nextDue && details.payment > 0 && details.paymentsLeft > 0) {
    account.mode = "installment";
    account.schedule = buildMonthlySchedule(
      details.nextDue,
      details.paymentsLeft,
      details.payment,
    );
  }
  return {
    ok: true,
    loanId: account.id,
    state: { ...state, accounts: [...state.accounts, account] },
  };
}

/**
 * Money borrowed and received now: creates the loan at 0 and records a
 * "borrow" transaction, so the debt and the receiving wallet both go up by
 * the amount. Never counted as income.
 */
export function applyNewBorrowing(state: AppState, input: NewBorrowingInput): LoanResult {
  const errors: LoanFieldErrors = {};
  const name = input.name.trim();
  if (!name) errors.name = "Name the loan, like Salary loan or Utang kay Ate.";
  const amount = parseAmount(input.amount);
  if (!amount.ok) errors.amount = amount.error;
  const date = input.date?.trim() || todayIso();
  if (!validIsoDate(date)) errors.date = "Enter a valid date.";
  const details = parseDetails({ ...input, paymentsLeft: "" }, errors);

  let next = state;
  let walletId = input.walletId ?? "";
  if (input.id && state.accounts.some((a) => a.id === input.id)) {
    return { ok: true, state, loanId: input.id, walletId };
  }
  if (!walletId && input.newWallet) {
    const created = createWallet(next, input.newWallet.name, input.newWallet.balance);
    if ("error" in created) errors.wallet = created.error;
    else {
      next = created.state;
      walletId = created.accountId;
    }
  } else if (!walletId) {
    errors.wallet = "Choose the wallet that received the money.";
  } else if (
    !state.accounts.some((a) => a.id === walletId && a.kind !== "liability" && !a.archived)
  ) {
    errors.wallet = "That wallet is no longer available. Choose another.";
  }
  if (Object.keys(errors).length > 0 || !amount.ok) return { ok: false, errors };

  const account = baseLoan(name, details, input.liabilityType, input.id);
  account.openingBalance = 0;
  next = { ...next, accounts: [...next.accounts, account] };
  const borrowed = applyBorrow(next, {
    liabilityId: account.id,
    amount: roundCentavos(amount.value),
    toId: walletId,
    date,
    note: `Borrowed · ${name}`,
    id: input.txId ?? uid(),
  });
  if (!borrowed) return { ok: false, errors: { amount: "Could not record this loan." } };
  return { ok: true, state: borrowed, loanId: account.id, walletId };
}
