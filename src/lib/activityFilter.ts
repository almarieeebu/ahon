import type { Account, Transaction } from "@/lib/types";

/** Kind chips on the Activity tab. */
export type KindFilterId = "all" | "spending" | "income" | "loans";

export const KIND_FILTERS: Record<KindFilterId, { label: string; kinds: Transaction["kind"][] }> = {
  all: { label: "All", kinds: [] },
  spending: { label: "Spending", kinds: ["expense"] },
  income: { label: "Money in", kinds: ["income"] },
  loans: { label: "Loans & transfers", kinds: ["payment", "borrow", "transfer", "adjustment"] },
};

/**
 * Which dates to show:
 * - month: the month picked in the header (default)
 * - day: one date (`from`), any month
 * - range: `from`–`to` inclusive, any months; an empty end is open
 */
export type DateFilter =
  | { mode: "month" }
  | { mode: "day"; from: string }
  | { mode: "range"; from: string; to: string };

export interface ActivityFilter {
  kind: KindFilterId;
  date: DateFilter;
  /** Account id, or "" for all accounts. */
  accountId: string;
}

export const DEFAULT_ACTIVITY_FILTER: ActivityFilter = {
  kind: "all",
  date: { mode: "month" },
  accountId: "",
};

export function matchesKind(tx: Transaction, kind: KindFilterId): boolean {
  return kind === "all" || KIND_FILTERS[kind].kinds.includes(tx.kind);
}

/** True when `tx` falls in the date filter; `month` is "YYYY-MM". */
export function matchesDate(tx: Transaction, date: DateFilter, month: string): boolean {
  switch (date.mode) {
    case "month":
      return tx.date.slice(0, 7) === month;
    case "day":
      return date.from ? tx.date === date.from : tx.date.slice(0, 7) === month;
    case "range": {
      let { from, to } = date;
      if (!from && !to) return tx.date.slice(0, 7) === month;
      if (from && to && from > to) [from, to] = [to, from];
      return (!from || tx.date >= from) && (!to || tx.date <= to);
    }
  }
}

export function matchesAccount(tx: Transaction, accountId: string): boolean {
  return !accountId || tx.fromId === accountId || tx.toId === accountId;
}

/** Rows matching every filter, in the input order. */
export function filterActivity(
  transactions: Transaction[],
  filter: ActivityFilter,
  month: string,
): Transaction[] {
  return transactions.filter(
    (tx) =>
      matchesDate(tx, filter.date, month) &&
      matchesAccount(tx, filter.accountId) &&
      matchesKind(tx, filter.kind),
  );
}

/** True when the date filter narrows past the header month. */
export function isCustomDate(date: DateFilter): boolean {
  if (date.mode === "day") return Boolean(date.from);
  if (date.mode === "range") return Boolean(date.from || date.to);
  return false;
}

export type Flow = "in" | "out" | "neutral";

/**
 * Direction of money for display and totals. Moves between your own wallets
 * (transfers, tigum) are neutral, unless an account is picked: then money
 * into it counts as in and money out of it as out.
 */
export function txFlow(tx: Transaction, accountId = ""): Flow {
  if (tx.kind === "transfer") {
    if (accountId && tx.toId === accountId && tx.fromId !== accountId) return "in";
    if (accountId && tx.fromId === accountId && tx.toId !== accountId) return "out";
    return "neutral";
  }
  if (tx.kind === "income") return "in";
  if (tx.kind === "borrow" && tx.toId) return "in";
  if (tx.kind === "adjustment" && tx.toId && !tx.fromId) return "in";
  return "out";
}

export function activityTotals(
  rows: Transaction[],
  accountId = "",
): { count: number; moneyIn: number; moneyOut: number } {
  let moneyIn = 0;
  let moneyOut = 0;
  for (const tx of rows) {
    const flow = txFlow(tx, accountId);
    if (flow === "in") moneyIn += tx.amount;
    else if (flow === "out") moneyOut += tx.amount;
  }
  return { count: rows.length, moneyIn, moneyOut };
}

/**
 * Short "which account" label for a row: "from Cash" for spending,
 * "to UB" for money in, "UB → Cash" for moves and loan rows.
 */
export function accountFlowLabel(
  tx: Transaction,
  nameOf: (id: string) => string,
): string {
  const from = tx.fromId ? nameOf(tx.fromId) : "";
  const to = tx.toId ? nameOf(tx.toId) : "";
  switch (tx.kind) {
    case "expense":
      return from ? `from ${from}` : "";
    case "income":
      return to ? `to ${to}` : "";
    case "payment":
      return `${from || "Untracked"} → ${to || "loan"}`;
    default:
      if (from && to) return `${from} → ${to}`;
      if (from) return `from ${from}`;
      if (to) return `to ${to}`;
      return "";
  }
}

/** Accounts grouped for the account picker. Archived accounts are left out. */
export function accountGroups(
  accounts: Account[],
): { label: string; accounts: Account[] }[] {
  const live = accounts.filter((a) => !a.archived);
  return [
    { label: "Cash & banks", accounts: live.filter((a) => a.kind === "cash") },
    { label: "Tigum", accounts: live.filter((a) => a.kind === "savings") },
    { label: "Loans", accounts: live.filter((a) => a.kind === "liability") },
  ].filter((g) => g.accounts.length > 0);
}

/** Read a saved filter, falling back to defaults for anything malformed. */
export function parseActivityFilter(raw: string | null): ActivityFilter {
  if (!raw) return DEFAULT_ACTIVITY_FILTER;
  try {
    const v = JSON.parse(raw) as Partial<ActivityFilter> & { date?: Partial<DateFilter> & { from?: unknown; to?: unknown } };
    const kind = v.kind && v.kind in KIND_FILTERS ? v.kind : "all";
    const accountId = typeof v.accountId === "string" ? v.accountId : "";
    const str = (x: unknown) => (typeof x === "string" ? x : "");
    let date: DateFilter = { mode: "month" };
    if (v.date?.mode === "day") date = { mode: "day", from: str(v.date.from) };
    else if (v.date?.mode === "range")
      date = { mode: "range", from: str(v.date.from), to: str(v.date.to) };
    return { kind, accountId, date };
  } catch {
    return DEFAULT_ACTIVITY_FILTER;
  }
}
