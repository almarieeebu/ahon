import { todayIso, uid } from "./money";
import type { Account, AppState, Category, Particular } from "./types";

export const APP_NAME = "Ahon";
export const APP_TAGLINE = "Rise with every peso.";

export function emptyCategory(
  name: string,
  kind: Category["kind"] = "expense",
  tone: Category["tone"] = "default",
): Category {
  return {
    id: uid(),
    name,
    planned: 0,
    dueDay: 0,
    kind,
    tone,
  };
}

export function emptyParticular(
  name: string,
  categoryId: string | null = null,
): Particular {
  return { id: uid(), name, categoryId };
}

export function emptyAccount(
  kind: Account["kind"],
  name: string,
): Account {
  return {
    id: uid(),
    name,
    kind,
    liabilityType: kind === "liability" ? "other" : undefined,
    mode: kind === "liability" ? "revolving" : undefined,
    openingBalance: 0,
    monthlyRate: kind === "liability" ? 0.03 : 0,
    dueDay: kind === "liability" ? 15 : 0,
    plannedPayment: 0,
    goal: kind === "savings" ? 0 : 0,
    archived: false,
    schedule: undefined,
  };
}

/** Truly empty books (rare). Prefer presetState for new users. */
export function emptyState(): AppState {
  return {
    version: 5,
    settings: {
      monthlyIncome: 0,
      openedOn: todayIso(),
    },
    accounts: [],
    categories: [],
    particulars: [],
    budgetPeriods: [],
    budgetLines: [],
    transactions: [],
  };
}

/** Common starter categories, particulars, and cash — no personal sample debts. */
export function presetState(): AppState {
  const categories: Category[] = [
    {
      id: "cat-salary",
      name: "Salary / paycheck",
      planned: 0,
      dueDay: 0,
      kind: "income",
      tone: "paycheck",
    },
    {
      id: "cat-side",
      name: "Side income",
      planned: 0,
      dueDay: 0,
      kind: "income",
      tone: "paycheck",
    },
    {
      id: "cat-rent",
      name: "Rent / housing",
      planned: 0,
      dueDay: 1,
      kind: "expense",
      tone: "housing",
    },
    {
      id: "cat-electric",
      name: "Electricity",
      planned: 0,
      dueDay: 28,
      kind: "expense",
      tone: "utility",
    },
    {
      id: "cat-water",
      name: "Water",
      planned: 0,
      dueDay: 15,
      kind: "expense",
      tone: "utility",
    },
    {
      id: "cat-internet",
      name: "Internet",
      planned: 0,
      dueDay: 10,
      kind: "expense",
      tone: "utility",
    },
    {
      id: "cat-food",
      name: "Food / groceries",
      planned: 0,
      dueDay: 0,
      kind: "expense",
      tone: "food",
    },
    {
      id: "cat-transport",
      name: "Transport",
      planned: 0,
      dueDay: 0,
      kind: "expense",
      tone: "default",
    },
    {
      id: "cat-debt",
      name: "Debt payment",
      planned: 0,
      dueDay: 0,
      kind: "expense",
      tone: "loan",
    },
    {
      id: "cat-savings",
      name: "Savings / tigum",
      planned: 0,
      dueDay: 0,
      kind: "expense",
      tone: "allowance",
    },
    {
      id: "cat-personal",
      name: "Personal",
      planned: 0,
      dueDay: 0,
      kind: "expense",
      tone: "personal",
    },
    {
      id: "cat-others",
      name: "Others",
      planned: 0,
      dueDay: 0,
      kind: "expense",
      tone: "default",
    },
  ];

  const particulars: Particular[] = [
    { id: "p-paycheck", name: "PAYCHECK", categoryId: "cat-salary" },
    { id: "p-rent", name: "RENT", categoryId: "cat-rent" },
    { id: "p-electric", name: "ELECTRICITY", categoryId: "cat-electric" },
    { id: "p-water", name: "WATER", categoryId: "cat-water" },
    { id: "p-internet", name: "INTERNET", categoryId: "cat-internet" },
    { id: "p-groceries", name: "GROCERIES", categoryId: "cat-food" },
    { id: "p-transport", name: "TRANSPORT", categoryId: "cat-transport" },
    { id: "p-debt", name: "DEBT PAYMENT", categoryId: "cat-debt" },
    { id: "p-tigum", name: "TIGUM", categoryId: "cat-savings" },
    { id: "p-personal", name: "PERSONAL", categoryId: "cat-personal" },
  ];

  const accounts: Account[] = [
    {
      id: "cash-on-hand",
      name: "Cash on hand",
      kind: "cash",
      openingBalance: 0,
      monthlyRate: 0,
      dueDay: 0,
      plannedPayment: 0,
      goal: 0,
      archived: false,
    },
    {
      id: "tigum-emergency",
      name: "Emergency Fund",
      kind: "savings",
      openingBalance: 0,
      monthlyRate: 0,
      dueDay: 0,
      plannedPayment: 0,
      goal: 50_000,
      archived: false,
    },
  ];

  return {
    version: 5,
    settings: {
      monthlyIncome: 0,
      openedOn: todayIso(),
    },
    accounts,
    categories,
    particulars,
    budgetPeriods: [],
    budgetLines: [],
    transactions: [],
  };
}
