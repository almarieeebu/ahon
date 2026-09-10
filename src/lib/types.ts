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
  actual: number | null;
  status: BudgetLineStatus;
  order: number;
}

export type TxKind = "income" | "expense" | "transfer" | "payment" | "adjustment";

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
