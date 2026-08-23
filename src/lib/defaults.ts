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

/** Blank books — no sample accounts, categories, or budget. */
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
