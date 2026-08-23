import { scheduleRemaining } from "./schedule";
import type {
  Account,
  AppState,
  Category,
  MonthFlow,
  Transaction,
} from "./types";

export function liabilityLeft(
  account: Account,
  ledgerBalance: number,
): number {
  if (account.kind !== "liability") return ledgerBalance;
  if (account.mode === "installment") {
    return scheduleRemaining(account.openingBalance, account.schedule);
  }
  return Math.max(0, ledgerBalance);
}

export function liveAccounts(state: AppState): Account[] {
  return state.accounts.filter((a) => !a.archived);
}

export function byKind(state: AppState, kind: Account["kind"]): Account[] {
  return liveAccounts(state).filter((a) => a.kind === kind);
}

export function sortedTx(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => {
    if (a.date === b.date) return a.id.localeCompare(b.id);
    return a.date.localeCompare(b.date);
  });
}

export function monthOf(tx: Transaction): string {
  return tx.date.slice(0, 7);
}

export function accountBalances(state: AppState): Record<string, number> {
  const lookup = new Map(state.accounts.map((a) => [a.id, a]));
  const bal: Record<string, number> = {};
  for (const a of state.accounts) {
    bal[a.id] = a.openingBalance;
  }

  for (const tx of sortedTx(state.transactions)) {
    if (tx.kind === "income" && tx.toId) {
      bal[tx.toId] = (bal[tx.toId] ?? 0) + tx.amount;
    } else if (tx.kind === "expense" && tx.fromId) {
      const from = lookup.get(tx.fromId);
      if (from?.kind === "liability") {
        bal[tx.fromId] = (bal[tx.fromId] ?? 0) + tx.amount;
      } else {
        bal[tx.fromId] = (bal[tx.fromId] ?? 0) - tx.amount;
      }
    } else if (tx.kind === "transfer" && tx.fromId && tx.toId) {
      bal[tx.fromId] = (bal[tx.fromId] ?? 0) - tx.amount;
      bal[tx.toId] = (bal[tx.toId] ?? 0) + tx.amount;
    } else if (tx.kind === "payment" && tx.fromId && tx.toId) {
      bal[tx.fromId] = (bal[tx.fromId] ?? 0) - tx.amount;
      const to = lookup.get(tx.toId);
      if (to?.mode !== "installment") {
        bal[tx.toId] = Math.max(0, (bal[tx.toId] ?? 0) - tx.amount);
      }
    }
  }

  for (const a of state.accounts) {
    if (a.kind === "liability" && a.mode === "installment") {
      bal[a.id] = scheduleRemaining(a.openingBalance, a.schedule);
    }
  }

  return bal;
}

export function sumKind(
  state: AppState,
  balances: Record<string, number>,
  kind: Account["kind"],
): number {
  return byKind(state, kind).reduce((s, a) => {
    const value =
      a.kind === "liability"
        ? liabilityLeft(a, balances[a.id] ?? 0)
        : (balances[a.id] ?? 0);
    return s + value;
  }, 0);
}

export function netWorth(
  state: AppState,
  balances: Record<string, number>,
): number {
  return (
    sumKind(state, balances, "cash") +
    sumKind(state, balances, "savings") -
    sumKind(state, balances, "liability")
  );
}

export function deriveMonth(state: AppState, key: string): MonthFlow {
  const byCategory: Record<string, number> = {};
  const paidByLiability: Record<string, number> = {};
  const chargedByLiability: Record<string, number> = {};
  let income = 0;
  let expense = 0;
  let saved = 0;
  let paid = 0;

  const lookup = new Map(state.accounts.map((a) => [a.id, a]));

  for (const tx of state.transactions) {
    if (monthOf(tx) !== key) continue;
    if (tx.kind === "income") {
      income += tx.amount;
      byCategory[tx.category] = (byCategory[tx.category] ?? 0) + tx.amount;
    } else if (tx.kind === "expense") {
      expense += tx.amount;
      byCategory[tx.category] = (byCategory[tx.category] ?? 0) + tx.amount;
      const from = tx.fromId ? lookup.get(tx.fromId) : undefined;
      if (from?.kind === "liability" && tx.fromId) {
        chargedByLiability[tx.fromId] =
          (chargedByLiability[tx.fromId] ?? 0) + tx.amount;
      }
    } else if (tx.kind === "transfer") {
      const to = tx.toId ? lookup.get(tx.toId) : undefined;
      if (to?.kind === "savings") {
        saved += tx.amount;
        byCategory.savings = (byCategory.savings ?? 0) + tx.amount;
      }
    } else if (tx.kind === "payment" && tx.toId) {
      paid += tx.amount;
      paidByLiability[tx.toId] = (paidByLiability[tx.toId] ?? 0) + tx.amount;
      byCategory.debt = (byCategory.debt ?? 0) + tx.amount;
    }
  }

  return {
    key,
    income,
    expense,
    saved,
    paid,
    byCategory,
    paidByLiability,
    chargedByLiability,
  };
}

export function kindLabel(kind: Transaction["kind"]): string {
  switch (kind) {
    case "income":
      return "Income";
    case "expense":
      return "Expense";
    case "transfer":
      return "Tigum / transfer";
    case "payment":
      return "Utang payment";
  }
}

export function accountName(state: AppState, id: string | null): string {
  if (!id) return "—";
  return state.accounts.find((a) => a.id === id)?.name ?? "Account";
}

export function budgetTotal(
  state: AppState,
  kind?: Category["kind"],
): number {
  return state.categories
    .filter((c) => (kind ? (c.kind ?? "expense") === kind : true))
    .reduce((s, c) => s + c.planned, 0);
}
