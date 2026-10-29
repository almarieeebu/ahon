/** Tab ids are internal; labels: ledger = Activity, budget = Budget, utang = Loans. */
export type TabId = "home" | "ledger" | "save" | "utang" | "budget" | "more";

export type AccountKind = "cash" | "savings" | "liability";

export type LiabilityType = "credit-card" | "housing" | "personal" | "other";

export type LiabilityMode = "revolving" | "installment";

export type InstallmentStatus = "paid" | "unpaid";

export interface Installment {
  id: string;
  due: string;
  amount: number;
  status: InstallmentStatus;
  balanceAfter: number | null;
  /**
   * Total paid toward this installment so far. Set when payments are recorded
   * by amount (partial payments). A row is "paid" only once this covers
   * `amount`. Missing on legacy rows: a paid row then counts as fully paid.
   */
  paidAmount?: number;
}

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  liabilityType?: LiabilityType;
  mode?: LiabilityMode;
  openingBalance: number;
  monthlyRate: number;
  dueDay: number;
  plannedPayment: number;
  goal: number;
  archived: boolean;
  schedule?: Installment[];
  /**
   * False when the person did not know the starting balance (cash/savings),
   * so openingBalance 0 is a placeholder, not a verified zero.
   * Missing (legacy records) means known.
   */
  balanceKnown?: boolean;
  /**
   * Liabilities only. False when the person did not know the interest rate,
   * so monthlyRate 0 is a placeholder, not a verified 0%. Missing (legacy
   * records) means known.
   */
  interestKnown?: boolean;
}

export type ParticularTone =
  | "paycheck"
  | "housing"
  | "loan"
  | "utility"
  | "food"
  | "personal"
  | "allowance"
  | "default";

export interface Category {
  id: string;
  name: string;
  planned: number;
  dueDay: number;
  /** Log envelope type — income vs expense categories. */
  kind: "income" | "expense";
  /** Visual group for Budget sheet / Particular coloring. */
  tone: ParticularTone;
}

export interface Particular {
  id: string;
  name: string;
  /** FK to Budget Setup Category.id */
  categoryId: string | null;
}

export interface BudgetPeriod {
  id: string;
  start: string;
  end: string;
}

export type BudgetLineStatus = "paid" | "unpaid" | "";

/**
 * What a budget row is for. Missing on rows created before monthly budgets
 * (legacy rows): those are read as a planned bill (expense > 0) or expected
 * income (income > 0).
 * - limit: spending limit for one Category (categoryId), amount in `expense`.
 * - bill: one planned bill (name in `particular`, amount in `expense`, `due`).
 * - income: expected income (amount in `income`).
 */
export type BudgetLineType = "limit" | "bill" | "income";

/** Review choice for an earlier manual amount (legacy `actual`). */
export type LegacyReview = "kept" | "hidden";

export interface BudgetLine {
  id: string;
  periodId: string;
  due: string;
  /** Denormalized display name; keep in sync with particularId when set. */
  particular: string;
  /** FK to Particular.id when linked to the catalog. */
  particularId: string | null;
  income: number;
  expense: number;
  /**
   * Legacy hand-entered amount. Kept as stored; never written by new code and
   * never added to transaction-derived spending (see reconcileLegacyActuals).
   */
  actual: number | null;
  status: BudgetLineStatus;
  order: number;
  lineType?: BudgetLineType;
  /** FK to Category.id for a `limit` row. */
  categoryId?: string | null;
  /** Person's review of a legacy `actual` that no activity explains. */
  legacyReview?: LegacyReview | null;
}

/**
 * - payment: money paid toward a liability (toId = the loan, explicit id).
 * - borrow: loan proceeds received now (fromId = the loan, toId = wallet or
 *   null when untracked). Raises both the debt and the wallet; NOT income.
 */
export type TxKind =
  | "income"
  | "expense"
  | "transfer"
  | "payment"
  | "adjustment"
  | "borrow";

export interface Transaction {
  id: string;
  date: string;
  kind: TxKind;
  amount: number;
  /** FK to Category.id (preferred) or legacy purpose label. */
  category: string;
  /** Denormalized particular name. */
  particular: string;
  /** FK to Particular.id when linked. */
  particularId: string | null;
  fromId: string | null;
  toId: string | null;
  note: string;
  installmentId?: string;
  /** Explicit link to a planned bill (BudgetLine.id). Never inferred. */
  budgetLineId?: string | null;
}

export interface Settings {
  monthlyIncome: number;
  /** Minimum cash to leave untouched when assessing what is safe to use. */
  emergencyReserve: number;
  /** Regular paydays as days of the month, e.g. [15, 30]. */
  paydayDays: number[];
  /** False only while a new user is completing the guided first setup. */
  setupComplete: boolean;
  openedOn: string;
}

export interface AppState {
  version: 5;
  settings: Settings;
  accounts: Account[];
  categories: Category[];
  particulars: Particular[];
  budgetPeriods: BudgetPeriod[];
  budgetLines: BudgetLine[];
  transactions: Transaction[];
}

export interface MonthFlow {
  key: string;
  income: number;
  expense: number;
  saved: number;
  paid: number;
  byCategory: Record<string, number>;
  paidByLiability: Record<string, number>;
  chargedByLiability: Record<string, number>;
}

export interface ComputedBudgetLine extends BudgetLine {
  budgetBalance: number;
  remBalance: number;
  tone: ParticularTone;
}
