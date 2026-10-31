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
    // No preset rate or due day: unknown until the person enters them.
    monthlyRate: 0,
    dueDay: 0,
    plannedPayment: 0,
    goal: kind === "savings" ? 0 : 0,
    archived: false,
    schedule: undefined,
    ...(kind === "liability" ? { interestKnown: false } : {}),
  };
}

/** Truly empty books (rare). Prefer presetState for new users. */
export function emptyState(): AppState {
  return {
    version: 5,
    settings: {
      monthlyIncome: 0,
      emergencyReserve: 0,
      paydayDays: [],
      setupComplete: false,
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
      id: "cat-mobile",
      name: "Mobile / load",
      planned: 0,
      dueDay: 15,
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
      id: "cat-health",
      name: "Health / medicine",
      planned: 0,
      dueDay: 0,
      kind: "expense",
      tone: "personal",
    },
    {
      id: "cat-school-family",
      name: "School / family support",
      planned: 0,
      dueDay: 0,
      kind: "expense",
      tone: "personal",
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
      name: "Personal / household",
      planned: 0,
      dueDay: 0,
      kind: "expense",
      tone: "personal",
    },
    {
      id: "cat-bank-fees",
      name: "Bank & transfer fees",
      planned: 0,
      dueDay: 0,
      kind: "expense",
      tone: "default",
    },
    {
      id: "cat-others",
      name: "Miscellaneous / unexpected",
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
    { id: "p-mobile", name: "MOBILE / LOAD", categoryId: "cat-mobile" },
    { id: "p-groceries", name: "GROCERIES", categoryId: "cat-food" },
    { id: "p-transport", name: "TRANSPORT", categoryId: "cat-transport" },
    { id: "p-health", name: "HEALTH / MEDICINE", categoryId: "cat-health" },
    {
      id: "p-school-family",
      name: "SCHOOL / FAMILY SUPPORT",
      categoryId: "cat-school-family",
    },
    { id: "p-debt", name: "DEBT PAYMENT", categoryId: "cat-debt" },
    { id: "p-tigum", name: "TIGUM", categoryId: "cat-savings" },
    { id: "p-personal", name: "PERSONAL", categoryId: "cat-personal" },
    { id: "p-bank-fees", name: "BANK / TRANSFER FEES", categoryId: "cat-bank-fees" },
    {
      id: "p-misc",
      name: "MISCELLANEOUS",
      categoryId: "cat-others",
    },
  ];

  const accounts: Account[] = [
    {
      id: "cash-on-hand",
      name: "Cash on hand",
      kind: "cash",
      openingBalance: 0,
      // Not entered yet: show "balance incomplete", never a verified ₱0.
      balanceKnown: false,
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
      emergencyReserve: 0,
      paydayDays: [],
      setupComplete: false,
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
