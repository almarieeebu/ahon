import { uid } from "./money";
import { particularLabel } from "./refs";
import type {
  AppState,
  BudgetLine,
  BudgetPeriod,
  ComputedBudgetLine,
  Particular,
  ParticularTone,
} from "./types";

export function money2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function periodLabel(start: string, end: string): string {
  return `${shortDue(start, true)} - ${shortDue(end, true)}`;
}

export function shortDue(iso: string, upper = false): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const label = new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return upper ? label.toUpperCase() : label;
}

export function toneForParticular(
  name: string,
  particulars: Particular[],
  categories: { id: string; tone?: ParticularTone; name: string }[] = [],
): ParticularTone {
  const hit = particulars.find(
    (p) => p.name.toLowerCase() === name.trim().toLowerCase(),
  );
  if (hit?.categoryId) {
    const cat = categories.find((c) => c.id === hit.categoryId);
    if (cat?.tone) return cat.tone;
  }
  const n = name.toLowerCase();
  if (/paycheck|salary|payroll|income/.test(n)) return "paycheck";
  if (/housing|rent|amort/.test(n)) return "housing";
  if (/loan|gloan|tala|cc |visa|rewards|spay|sss|mama/.test(n)) return "loan";
  if (/electric|water|internet|meralco/.test(n)) return "utility";
  if (/milk|food|baon|grocery/.test(n)) return "food";
  if (/allowance/.test(n)) return "allowance";
  if (/waway|cath/.test(n)) return "personal";
  return "default";
}

export function sortedBudgetLines(
  lines: BudgetLine[],
  periodId?: string,
): BudgetLine[] {
  return [...lines]
    .filter((l) => (periodId ? l.periodId === periodId : true))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function sortedPeriods(periods: BudgetPeriod[]): BudgetPeriod[] {
  return [...periods].sort((a, b) => a.start.localeCompare(b.start));
}

/** Running budget + actual rem balances across all periods in order. */
export function computeBudgetSheet(
  state: Pick<
    AppState,
    "budgetPeriods" | "budgetLines" | "particulars" | "categories"
  >,
  year?: number,
  monthKey?: string,
): Array<{
  period: BudgetPeriod;
  label: string;
  lines: ComputedBudgetLine[];
  closingBudget: number;
  closingActual: number;
}> {
  const periods = sortedPeriods(state.budgetPeriods);
  let budgetBal = 0;
  let actualBal = 0;
  const blocks = [];

  for (const period of periods) {
    const rows = sortedBudgetLines(state.budgetLines, period.id);
    const computed: ComputedBudgetLine[] = [];
    for (const row of rows) {
      budgetBal = money2(budgetBal + (row.income || 0) - (row.expense || 0));
      if (row.actual != null) {
        if ((row.income || 0) > 0 && (row.expense || 0) <= 0) {
          actualBal = money2(actualBal + row.actual);
        } else if ((row.expense || 0) > 0 && (row.income || 0) <= 0) {
          actualBal = money2(actualBal - row.actual);
        } else if ((row.income || 0) > 0) {
          actualBal = money2(actualBal + row.actual);
        } else {
          actualBal = money2(actualBal - row.actual);
        }
      }
      computed.push({
        ...row,
        budgetBalance: budgetBal,
        remBalance: actualBal,
        tone: toneForParticular(
          particularLabel(state.particulars, row.particularId, row.particular) ||
            row.particular,
          state.particulars,
          state.categories,
        ),
      });
    }
    blocks.push({
      period,
      label: periodLabel(period.start, period.end),
      lines: computed,
      closingBudget: budgetBal,
      closingActual: actualBal,
    });
  }

  if (year == null && monthKey == null) return blocks;
  return blocks.filter((b) => {
    if (year != null) {
      const startY = Number(b.period.start.slice(0, 4));
      const endY = Number(b.period.end.slice(0, 4));
      if (startY !== year && endY !== year) return false;
    }
    if (monthKey != null) {
      return periodOverlapsMonth(b.period, monthKey);
    }
    return true;
  });
}

export function periodOverlapsMonth(
  period: BudgetPeriod,
  monthKey: string,
): boolean {
  const monthStart = `${monthKey}-01`;
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const monthEnd = `${monthKey}-${String(last).padStart(2, "0")}`;
  return period.start <= monthEnd && period.end >= monthStart;
}

export function availableBudgetMonths(
  periods: BudgetPeriod[],
  lines: BudgetLine[] = [],
): string[] {
  const keys = new Set<string>();
  for (const p of periods) {
    keys.add(p.start.slice(0, 7));
    keys.add(p.end.slice(0, 7));
    // include every month spanned by the period
    let cursor = p.start.slice(0, 7);
    const endKey = p.end.slice(0, 7);
    while (cursor <= endKey) {
      keys.add(cursor);
      const [y, m] = cursor.split("-").map(Number);
      const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
      cursor = next;
    }
  }
  for (const line of lines) {
    if (line.due) keys.add(line.due.slice(0, 7));
  }
  const now = new Date();
  keys.add(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  return [...keys].filter(Boolean).sort((a, b) => b.localeCompare(a));
}

export function monthChipLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

export function summarizeMonthBudget(
  state: Pick<
    AppState,
    "budgetPeriods" | "budgetLines" | "particulars" | "categories"
  >,
  monthKey: string,
): {
  income: number;
  expense: number;
  actualIn: number;
  actualOut: number;
  unpaid: number;
  paid: number;
  closingBudget: number | null;
  closingActual: number | null;
  lines: ComputedBudgetLine[];
} {
  const blocks = computeBudgetSheet(state, undefined, monthKey);
  let income = 0;
  let expense = 0;
  let actualIn = 0;
  let actualOut = 0;
  let unpaid = 0;
  let paid = 0;
  const lines: ComputedBudgetLine[] = [];
  for (const block of blocks) {
    for (const row of block.lines) {
      lines.push(row);
      income += row.income || 0;
      expense += row.expense || 0;
      if (row.actual != null) {
        if ((row.income || 0) > 0 && (row.expense || 0) <= 0) {
          actualIn += row.actual;
        } else {
          actualOut += row.actual;
        }
      }
      if (row.status === "unpaid") unpaid += 1;
      if (row.status === "paid") paid += 1;
    }
  }
  const last = blocks[blocks.length - 1];
  return {
    income: money2(income),
    expense: money2(expense),
    actualIn: money2(actualIn),
    actualOut: money2(actualOut),
    unpaid,
    paid,
    closingBudget: last ? last.closingBudget : null,
    closingActual: last ? last.closingActual : null,
    lines,
  };
}

export function availableBudgetYears(
  periods: BudgetPeriod[],
): number[] {
  const years = new Set<number>();
  for (const p of periods) {
    years.add(Number(p.start.slice(0, 4)));
    years.add(Number(p.end.slice(0, 4)));
  }
  const now = new Date().getFullYear();
  years.add(now);
  return [...years].filter((y) => Number.isFinite(y)).sort((a, b) => b - a);
}

export type ParticularYearTotal = {
  name: string;
  tone: ParticularTone;
  income: number;
  expense: number;
  actualIn: number;
  actualOut: number;
  count: number;
  ledgerCount: number;
};

export type OverviewSummary = {
  income: number;
  expense: number;
  actualIn: number;
  actualOut: number;
  unpaid: number;
  paid: number;
  byParticular: ParticularYearTotal[];
};

type OverviewFilter =
  | { scope: "year"; year: number }
  | { scope: "month"; monthKey: string };

function txMatchesFilter(date: string, filter: OverviewFilter): boolean {
  if (filter.scope === "year") return date.startsWith(String(filter.year));
  return date.slice(0, 7) === filter.monthKey;
}

/** Budget from period sheet; actual from ledger — filtered by year or month. */
export function summarizeOverview(
  state: Pick<
    AppState,
    | "budgetPeriods"
    | "budgetLines"
    | "particulars"
    | "transactions"
    | "categories"
  >,
  filter: OverviewFilter,
): OverviewSummary {
  const blocks =
    filter.scope === "year"
      ? computeBudgetSheet(state, filter.year)
      : computeBudgetSheet(state, undefined, filter.monthKey);

  let income = 0;
  let expense = 0;
  let unpaid = 0;
  let paid = 0;
  const map = new Map<string, ParticularYearTotal>();

  function ensure(
    key: string,
    name: string,
    tone: ParticularTone,
  ): ParticularYearTotal {
    let row = map.get(key);
    if (!row) {
      row = {
        name,
        tone,
        income: 0,
        expense: 0,
        actualIn: 0,
        actualOut: 0,
        count: 0,
        ledgerCount: 0,
      };
      map.set(key, row);
    }
    return row;
  }

  for (const block of blocks) {
    for (const row of block.lines) {
      const name =
        particularLabel(state.particulars, row.particularId, row.particular) ||
        "—";
      const key = row.particularId || name.toLowerCase();
      income += row.income || 0;
      expense += row.expense || 0;
      if (row.status === "unpaid") unpaid += 1;
      if (row.status === "paid") paid += 1;

      const bucket = ensure(key, name, row.tone);
      bucket.income = money2(bucket.income + (row.income || 0));
      bucket.expense = money2(bucket.expense + (row.expense || 0));
      bucket.count += 1;
    }
  }

  let actualIn = 0;
  let actualOut = 0;

  for (const tx of state.transactions) {
    if (!txMatchesFilter(tx.date, filter)) continue;
    const name =
      particularLabel(state.particulars, tx.particularId, tx.particular) ||
      "—";
    const key = tx.particularId || name.toLowerCase();
    const tone = toneForParticular(
      name === "—" ? "" : name,
      state.particulars,
      state.categories,
    );
    const bucket = ensure(key, name, tone);

    if (tx.kind === "income") {
      actualIn += tx.amount;
      bucket.actualIn = money2(bucket.actualIn + tx.amount);
      bucket.ledgerCount += 1;
    } else if (
      tx.kind === "expense" ||
      tx.kind === "payment" ||
      tx.kind === "transfer"
    ) {
      actualOut += tx.amount;
      bucket.actualOut = money2(bucket.actualOut + tx.amount);
      bucket.ledgerCount += 1;
    }
  }

  const byParticular = [...map.values()].sort((a, b) => {
    const aTotal = a.expense + a.income + a.actualIn + a.actualOut;
    const bTotal = b.expense + b.income + b.actualIn + b.actualOut;
    return bTotal - aTotal || a.name.localeCompare(b.name);
  });

  return {
    income: money2(income),
    expense: money2(expense),
    actualIn: money2(actualIn),
    actualOut: money2(actualOut),
    unpaid,
    paid,
    byParticular,
  };
}

/** Budget totals from period sheet; actual totals from ledger transactions. */
export function summarizeYearBudget(
  state: Pick<
    AppState,
    | "budgetPeriods"
    | "budgetLines"
    | "particulars"
    | "transactions"
    | "categories"
  >,
  year: number,
): OverviewSummary {
  return summarizeOverview(state, { scope: "year", year });
}

export function summarizeMonthOverview(
  state: Pick<
    AppState,
    | "budgetPeriods"
    | "budgetLines"
    | "particulars"
    | "transactions"
    | "categories"
  >,
  monthKey: string,
): OverviewSummary {
  return summarizeOverview(state, { scope: "month", monthKey });
}

export function emptyBudgetLine(
  periodId: string,
  order: number,
): BudgetLine {
  return {
    id: uid(),
    periodId,
    due: "",
    particular: "",
    particularId: null,
    income: 0,
    expense: 0,
    actual: null,
    status: "unpaid",
    order,
  };
}
