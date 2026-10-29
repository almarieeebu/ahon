import { parseAmount, uid } from "./money";
import { particularLabel } from "./refs";
import type {
  AppState,
  BudgetLine,
  BudgetLineType,
  BudgetPeriod,
  ComputedBudgetLine,
  LegacyReview,
  Particular,
  ParticularTone,
  Transaction,
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

/* ------------------------------------------------------------------------ */
/* Monthly budget: targets are stored on budget rows; actuals are DERIVED   */
/* from transactions (never stored, never typed in again).                  */
/* ------------------------------------------------------------------------ */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Days in a month (1-12), leap years included. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** First and last day of a calendar month ("YYYY-MM"). */
export function monthBounds(monthKey: string): { start: string; end: string } {
  const [y, m] = monthKey.split("-").map(Number);
  return {
    start: `${monthKey}-01`,
    end: `${monthKey}-${pad2(daysInMonth(y, m))}`,
  };
}

/** "YYYY-MM" moved by n months. */
export function addMonthsToKey(monthKey: string, n: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const index = y * 12 + (m - 1) + n;
  return `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`;
}

function monthsBetween(fromKey: string, toKey: string): number {
  const [fy, fm] = fromKey.split("-").map(Number);
  const [ty, tm] = toKey.split("-").map(Number);
  return ty * 12 + tm - (fy * 12 + fm);
}

/**
 * Date moved by n months keeping the day, clamped to the target month's
 * last day (Jan 31 + 1 month = Feb 28 or Feb 29 in a leap year).
 */
export function shiftIsoByMonths(iso: string, n: number): string {
  if (!ISO_DATE.test(iso)) return "";
  const key = addMonthsToKey(iso.slice(0, 7), n);
  const [y, m] = key.split("-").map(Number);
  const day = Math.min(Number(iso.slice(8, 10)), daysInMonth(y, m));
  return `${key}-${pad2(day)}`;
}

/** Long month label, e.g. "October 2026". */
export function monthTitle(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function isFullMonthPeriod(period: Pick<BudgetPeriod, "start" | "end">): boolean {
  if (!ISO_DATE.test(period.start)) return false;
  const bounds = monthBounds(period.start.slice(0, 7));
  return period.start === bounds.start && period.end === bounds.end;
}

/** Budgets (periods) that touch a calendar month, earliest first. */
export function periodsForMonth(
  state: Pick<AppState, "budgetPeriods">,
  monthKey: string,
): BudgetPeriod[] {
  return sortedPeriods(state.budgetPeriods).filter((p) =>
    periodOverlapsMonth(p, monthKey),
  );
}

/** Latest month before `monthKey` that has a budget, or null. */
export function previousBudgetMonth(
  state: Pick<AppState, "budgetPeriods">,
  monthKey: string,
): string | null {
  let best: string | null = null;
  for (const period of state.budgetPeriods) {
    if (!ISO_DATE.test(period.start) || !ISO_DATE.test(period.end)) continue;
    // Latest month this budget touches that is still before monthKey.
    const endKey = period.end.slice(0, 7);
    const candidate = endKey < monthKey ? endKey : addMonthsToKey(monthKey, -1);
    if (candidate < period.start.slice(0, 7)) continue;
    if (!best || candidate > best) best = candidate;
  }
  return best;
}

/** How a row is used; legacy rows are read from their amounts. */
export function lineRole(line: BudgetLine): BudgetLineType | null {
  if (line.lineType) return line.lineType;
  if ((line.income || 0) > 0 && (line.expense || 0) <= 0) return "income";
  if ((line.expense || 0) > 0) return "bill";
  return null;
}

/** Category a transaction counts under: its category id, else its name's. */
export function txCategoryId(
  state: Pick<AppState, "categories" | "particulars">,
  tx: Pick<Transaction, "category" | "particularId">,
): string | null {
  if (tx.category && state.categories.some((c) => c.id === tx.category)) {
    return tx.category;
  }
  const particular = tx.particularId
    ? state.particulars.find((p) => p.id === tx.particularId)
    : undefined;
  if (particular?.categoryId && state.categories.some((c) => c.id === particular.categoryId)) {
    return particular.categoryId;
  }
  return null;
}

export type BudgetCategoryRow = {
  categoryId: string;
  name: string;
  lineIds: string[];
  limit: number;
  spent: number;
  /** limit - spent; negative means over. */
  left: number;
};

export type BudgetBillRow = {
  lineId: string;
  name: string;
  due: string;
  amount: number;
  /** All activity explicitly linked to this bill (any date). */
  paidAmount: number;
  paid: boolean;
  legacy: boolean;
};

export type BudgetIncomeRow = {
  lineId: string;
  name: string;
  amount: number;
  legacy: boolean;
};

export type UnbudgetedRow = {
  categoryId: string | null;
  name: string;
  amount: number;
  count: number;
};

export type DerivedBudget = {
  period: BudgetPeriod;
  fullMonth: boolean;
  categories: BudgetCategoryRow[];
  bills: BudgetBillRow[];
  income: BudgetIncomeRow[];
  unbudgeted: { total: number; rows: UnbudgetedRow[] };
  /** Loan & card repayments in the period that are not a planned bill here. */
  repayments: { total: number; count: number };
  expectedIncome: number;
  incomeReceived: number;
  /** limits + planned bills */
  budget: number;
  /** expenses (category, bill, unbudgeted) + payments made for planned bills */
  spent: number;
  left: number;
  /** spent + repayments: every cash-out counted once */
  cashOut: number;
};

function categoryName(state: Pick<AppState, "categories">, id: string | null): string {
  if (!id) return "No category";
  return state.categories.find((c) => c.id === id)?.name ?? "Removed category";
}

/**
 * Budget for one period, with actuals derived from transactions dated inside
 * it. Pure: editing or deleting a transaction changes the result next time.
 *
 * - expense: counts when incurred, whichever wallet or card paid it. A bill
 *   link (budgetLineId to a bill here) counts it under that bill; otherwise
 *   under its category's limit, or as unbudgeted spending.
 * - payment (loan / card repayment): its own repayments row, never category
 *   spending; a payment linked to a planned bill here counts for that bill.
 * - transfer, adjustment, borrow: excluded (not spending).
 * - legacy `actual` values are never read here.
 */
export function deriveBudget(
  state: Pick<
    AppState,
    "budgetPeriods" | "budgetLines" | "transactions" | "categories" | "particulars"
  >,
  periodId: string,
): DerivedBudget | null {
  const period = state.budgetPeriods.find((p) => p.id === periodId);
  if (!period) return null;
  const lines = sortedBudgetLines(state.budgetLines, period.id);

  const categoryMap = new Map<string, BudgetCategoryRow>();
  const bills: BudgetBillRow[] = [];
  const income: BudgetIncomeRow[] = [];
  for (const line of lines) {
    const role = lineRole(line);
    if (role === "limit" && line.categoryId) {
      const row = categoryMap.get(line.categoryId) ?? {
        categoryId: line.categoryId,
        name: categoryName(state, line.categoryId),
        lineIds: [],
        limit: 0,
        spent: 0,
        left: 0,
      };
      row.lineIds.push(line.id);
      row.limit = money2(row.limit + (line.expense || 0));
      categoryMap.set(line.categoryId, row);
    } else if (role === "bill") {
      bills.push({
        lineId: line.id,
        name: line.particular || "Planned bill",
        due: line.due,
        amount: money2(line.expense || 0),
        paidAmount: 0,
        paid: false,
        legacy: !line.lineType,
      });
    } else if (role === "income") {
      income.push({
        lineId: line.id,
        name: line.particular || "Expected income",
        amount: money2(line.income || 0),
        legacy: !line.lineType,
      });
    }
  }

  const billById = new Map(bills.map((b) => [b.lineId, b]));
  for (const tx of state.transactions) {
    if (!tx.budgetLineId) continue;
    const bill = billById.get(tx.budgetLineId);
    if (!bill || (tx.kind !== "expense" && tx.kind !== "payment")) continue;
    bill.paidAmount = money2(bill.paidAmount + tx.amount);
  }
  for (const bill of bills) {
    // Any explicitly linked activity marks the bill paid.
    bill.paid = bill.paidAmount > 0;
  }

  const unbudgetedMap = new Map<string, UnbudgetedRow>();
  let spent = 0;
  let repayments = 0;
  let repaymentCount = 0;
  let incomeReceived = 0;

  for (const tx of state.transactions) {
    if (!(tx.date >= period.start && tx.date <= period.end)) continue;
    const amount = Number.isFinite(tx.amount) ? tx.amount : 0;
    const linkedBill = tx.budgetLineId ? billById.get(tx.budgetLineId) : undefined;
    if (tx.kind === "income") {
      incomeReceived = money2(incomeReceived + amount);
      continue;
    }
    if (tx.kind === "payment") {
      if (linkedBill) {
        spent = money2(spent + amount);
      } else {
        repayments = money2(repayments + amount);
        repaymentCount += 1;
      }
      continue;
    }
    if (tx.kind !== "expense") continue; // transfer, adjustment, borrow
    spent = money2(spent + amount);
    if (linkedBill) continue;
    const categoryId = txCategoryId(state, tx);
    const limit = categoryId ? categoryMap.get(categoryId) : undefined;
    if (limit) {
      limit.spent = money2(limit.spent + amount);
      continue;
    }
    const key = categoryId ?? "";
    const row = unbudgetedMap.get(key) ?? {
      categoryId,
      name: categoryName(state, categoryId),
      amount: 0,
      count: 0,
    };
    row.amount = money2(row.amount + amount);
    row.count += 1;
    unbudgetedMap.set(key, row);
  }

  const categories = [...categoryMap.values()].map((row) => ({
    ...row,
    left: money2(row.limit - row.spent),
  }));
  const unbudgetedRows = [...unbudgetedMap.values()].sort(
    (a, b) => b.amount - a.amount || a.name.localeCompare(b.name),
  );
  const budget = money2(
    categories.reduce((s, r) => s + r.limit, 0) +
      bills.reduce((s, b) => s + b.amount, 0),
  );
  const expectedIncome = money2(income.reduce((s, r) => s + r.amount, 0));

  return {
    period,
    fullMonth: isFullMonthPeriod(period),
    categories,
    bills,
    income,
    unbudgeted: {
      total: money2(unbudgetedRows.reduce((s, r) => s + r.amount, 0)),
      rows: unbudgetedRows,
    },
    repayments: { total: repayments, count: repaymentCount },
    expectedIncome,
    incomeReceived,
    budget,
    spent,
    left: money2(budget - spent),
    cashOut: money2(spent + repayments),
  };
}

/* ---------------------------- create budget ----------------------------- */

export type BudgetLimitInput = { categoryId: string; amount: string | number };
export type BudgetBillInput = { name: string; amount: string | number; due: string };

export type NewBudgetInput = {
  /** Client id for the new budget; repeating a submit never duplicates. */
  id?: string;
  monthKey: string;
  limits: BudgetLimitInput[];
  expectedIncome?: string | number | null;
  bills?: BudgetBillInput[];
  /** Advanced options only: custom dates instead of the calendar month. */
  custom?: { start: string; end: string } | null;
};

export type NewBudgetErrors = {
  form?: string;
  limits?: Record<number, { category?: string; amount?: string }>;
  expectedIncome?: string;
  bills?: Record<number, { name?: string; amount?: string; due?: string }>;
  custom?: string;
};

function isBlank(v: string | number | null | undefined): boolean {
  return v == null || String(v).trim() === "";
}

function amountOf(v: string | number): number | null {
  const parsed = parseAmount(v);
  return parsed.ok ? parsed.value : null;
}

export function validateNewBudget(
  state: Pick<AppState, "budgetPeriods" | "categories">,
  input: NewBudgetInput,
): NewBudgetErrors {
  const errors: NewBudgetErrors = {};
  if (!/^\d{4}-\d{2}$/.test(input.monthKey)) errors.form = "Choose a month.";

  const limitErrors: NonNullable<NewBudgetErrors["limits"]> = {};
  const seen = new Set<string>();
  let filled = 0;
  input.limits.forEach((row, i) => {
    if (!row.categoryId && isBlank(row.amount) && input.limits.length > 1) return;
    filled += 1;
    const e: { category?: string; amount?: string } = {};
    if (!row.categoryId || !state.categories.some((c) => c.id === row.categoryId)) {
      e.category = "Choose a category.";
    } else if (seen.has(row.categoryId)) {
      e.category = "This category is already in the budget.";
    } else {
      seen.add(row.categoryId);
    }
    const parsed = parseAmount(row.amount);
    if (!parsed.ok) e.amount = parsed.error;
    if (e.category || e.amount) limitErrors[i] = e;
  });
  if (filled === 0) limitErrors[0] = { category: "Choose a category.", amount: "Enter a spending limit." };
  if (Object.keys(limitErrors).length) errors.limits = limitErrors;

  if (!isBlank(input.expectedIncome)) {
    const parsed = parseAmount(input.expectedIncome as string | number);
    if (!parsed.ok) errors.expectedIncome = parsed.error;
  }

  const range = input.custom ?? monthBounds(input.monthKey);
  if (input.custom) {
    if (!ISO_DATE.test(input.custom.start) || !ISO_DATE.test(input.custom.end)) {
      errors.custom = "Choose a start and end date.";
    } else if (input.custom.end < input.custom.start) {
      errors.custom = "The end date must be on or after the start date.";
    }
  }

  const billErrors: NonNullable<NewBudgetErrors["bills"]> = {};
  (input.bills ?? []).forEach((bill, i) => {
    if (!bill.name.trim() && isBlank(bill.amount) && !bill.due) return; // empty row
    const e: { name?: string; amount?: string; due?: string } = {};
    if (!bill.name.trim()) e.name = "Name the bill.";
    const parsed = parseAmount(bill.amount);
    if (!parsed.ok) e.amount = parsed.error;
    if (!ISO_DATE.test(bill.due)) e.due = "Choose a due date.";
    else if (!errors.custom && (bill.due < range.start || bill.due > range.end)) {
      e.due = "Pick a date inside this budget.";
    }
    if (e.name || e.amount || e.due) billErrors[i] = e;
  });
  if (Object.keys(billErrors).length) errors.bills = billErrors;

  if (!input.custom && !errors.form) {
    const bounds = monthBounds(input.monthKey);
    const taken = state.budgetPeriods.some(
      (p) => p.start === bounds.start && p.end === bounds.end,
    );
    if (taken) {
      errors.form = `${monthTitle(input.monthKey)} already has a budget.`;
    }
  }
  return errors;
}

export function hasBudgetErrors(errors: NewBudgetErrors): boolean {
  return Boolean(
    errors.form ||
      errors.expectedIncome ||
      errors.custom ||
      (errors.limits && Object.keys(errors.limits).length) ||
      (errors.bills && Object.keys(errors.bills).length),
  );
}

export function newBudgetRow(
  periodId: string,
  order: number,
  patch: Partial<BudgetLine> & { lineType: BudgetLineType },
): BudgetLine {
  return { ...emptyBudgetLine(periodId, order), ...patch };
}

/**
 * Create a budget: calendar month by default (month end and leap years
 * handled), custom dates only when given. Idempotent by `input.id`.
 */
export function createBudget(
  state: AppState,
  input: NewBudgetInput,
): { ok: true; state: AppState; periodId: string } | { ok: false; errors: NewBudgetErrors } {
  if (input.id && state.budgetPeriods.some((p) => p.id === input.id)) {
    return { ok: true, state, periodId: input.id };
  }
  const errors = validateNewBudget(state, input);
  if (hasBudgetErrors(errors)) return { ok: false, errors };

  const range = input.custom ?? monthBounds(input.monthKey);
  const period: BudgetPeriod = { id: input.id ?? uid(), start: range.start, end: range.end };
  const rows: BudgetLine[] = [];
  let order = 0;

  for (const limit of input.limits) {
    const amount = amountOf(limit.amount);
    if (!limit.categoryId || amount == null) continue;
    rows.push(
      newBudgetRow(period.id, order++, {
        lineType: "limit",
        categoryId: limit.categoryId,
        particular: categoryName(state, limit.categoryId),
        expense: amount,
      }),
    );
  }
  if (!isBlank(input.expectedIncome)) {
    const amount = amountOf(input.expectedIncome as string | number);
    if (amount != null) {
      rows.push(
        newBudgetRow(period.id, order++, {
          lineType: "income",
          particular: "Expected income",
          income: amount,
        }),
      );
    }
  }
  for (const bill of input.bills ?? []) {
    const amount = amountOf(bill.amount);
    if (!bill.name.trim() || amount == null || !ISO_DATE.test(bill.due)) continue;
    rows.push(
      newBudgetRow(period.id, order++, {
        lineType: "bill",
        particular: bill.name.trim(),
        expense: amount,
        due: bill.due,
      }),
    );
  }

  return {
    ok: true,
    periodId: period.id,
    state: {
      ...state,
      budgetPeriods: [...state.budgetPeriods, period],
      budgetLines: [...state.budgetLines, ...rows],
    },
  };
}

/* ----------------------------- copy budget ------------------------------ */

/**
 * Copy targets from one month's budget to another: limits, expected income,
 * and bills (name, amount, due day moved to the new month). Never copies
 * transactions, paid status, or earlier manual amounts. Returns null (no
 * change) when the target month already has a budget, so repeating it never
 * creates a duplicate.
 */
export function copyBudgetTargets(
  state: AppState,
  fromKey: string,
  toKey: string,
  makeId: () => string = uid,
): AppState | null {
  if (!fromKey || !toKey || fromKey === toKey) return null;
  if (periodsForMonth(state, toKey).length > 0) return null;
  const sources = periodsForMonth(state, fromKey);
  if (sources.length === 0) return null;
  const shift = monthsBetween(fromKey, toKey);

  const budgetPeriods = [...state.budgetPeriods];
  const budgetLines = [...state.budgetLines];
  for (const source of sources) {
    const range = isFullMonthPeriod(source)
      ? monthBounds(addMonthsToKey(source.start.slice(0, 7), shift))
      : {
          start: shiftIsoByMonths(source.start, shift),
          end: shiftIsoByMonths(source.end, shift),
        };
    if (!range.start || !range.end) continue;
    const period: BudgetPeriod = { id: makeId(), ...range };
    budgetPeriods.push(period);
    for (const row of sortedBudgetLines(state.budgetLines, source.id)) {
      const role = lineRole(row);
      if (!role) continue;
      const copy: BudgetLine = {
        id: makeId(),
        periodId: period.id,
        due: row.due ? shiftIsoByMonths(row.due, shift) : "",
        particular: row.particular,
        particularId: row.particularId,
        income: row.income,
        expense: row.expense,
        actual: null,
        status: "unpaid",
        order: row.order,
      };
      if (row.lineType) copy.lineType = row.lineType;
      if (row.categoryId) copy.categoryId = row.categoryId;
      budgetLines.push(copy);
    }
  }
  return { ...state, budgetPeriods, budgetLines };
}

/* --------------------------- legacy actuals ----------------------------- */

export type LegacyActualStatus = "reconciled" | "mismatch" | "unlinked";

export type LegacyActualItem = {
  lineId: string;
  periodId: string;
  name: string;
  due: string;
  /** The stored legacy amount, unchanged. */
  actual: number;
  linkedTotal: number;
  linkedCount: number;
  status: LegacyActualStatus;
  review: LegacyReview | null;
};

/**
 * Classify stored legacy `actual` values. Pure and idempotent: it reads the
 * state and returns a report; it never edits, deletes, or converts anything.
 *
 * - reconciled: transactions explicitly linked to the row (budgetLineId)
 *   add up to the stored amount, so activity already explains it.
 * - mismatch: linked transactions exist but add up to something else.
 * - unlinked: no linked transaction. Never matched by amount, date or name.
 */
export function reconcileLegacyActuals(
  state: Pick<AppState, "budgetLines" | "transactions">,
  periodId?: string,
): LegacyActualItem[] {
  const linked = new Map<string, { total: number; count: number }>();
  for (const tx of state.transactions) {
    if (!tx.budgetLineId) continue;
    if (tx.kind === "adjustment" || tx.kind === "transfer" || tx.kind === "borrow") continue;
    const hit = linked.get(tx.budgetLineId) ?? { total: 0, count: 0 };
    hit.total = money2(hit.total + tx.amount);
    hit.count += 1;
    linked.set(tx.budgetLineId, hit);
  }
  const out: LegacyActualItem[] = [];
  for (const line of sortedBudgetLines(state.budgetLines, periodId)) {
    if (line.actual == null || !Number.isFinite(line.actual)) continue;
    const link = linked.get(line.id) ?? { total: 0, count: 0 };
    const status: LegacyActualStatus =
      link.count === 0
        ? "unlinked"
        : Math.abs(link.total - line.actual) < 0.005
          ? "reconciled"
          : "mismatch";
    out.push({
      lineId: line.id,
      periodId: line.periodId,
      name: line.particular || "Unnamed entry",
      due: line.due,
      actual: line.actual,
      linkedTotal: link.total,
      linkedCount: link.count,
      status,
      review: line.legacyReview ?? null,
    });
  }
  return out;
}

/** Earlier manual amounts that activity does not explain (to review). */
export function legacyEntriesToReview(
  state: Pick<AppState, "budgetLines" | "transactions">,
  periodId?: string,
): LegacyActualItem[] {
  return reconcileLegacyActuals(state, periodId).filter((i) => i.status !== "reconciled");
}

/**
 * Record the person's review ("kept" as a note, or "hidden"; null to undo).
 * Only the review flag changes; the stored amount stays as it was.
 */
export function setLegacyReview(
  state: AppState,
  lineId: string,
  review: LegacyReview | null,
): AppState {
  const line = state.budgetLines.find((l) => l.id === lineId);
  if (!line || line.actual == null) return state;
  if ((line.legacyReview ?? null) === review) return state;
  return {
    ...state,
    budgetLines: state.budgetLines.map((l) => {
      if (l.id !== lineId) return l;
      if (review) return { ...l, legacyReview: review };
      const rest = { ...l };
      delete rest.legacyReview;
      return rest;
    }),
  };
}

/** Insert or replace one budget row exactly as given. */
export function saveBudgetRow(state: AppState, line: BudgetLine): AppState {
  const exists = state.budgetLines.some((l) => l.id === line.id);
  return {
    ...state,
    budgetLines: exists
      ? state.budgetLines.map((l) => (l.id === line.id ? line : l))
      : [...state.budgetLines, line],
  };
}

export function nextRowOrder(state: Pick<AppState, "budgetLines">, periodId: string): number {
  return (
    state.budgetLines
      .filter((l) => l.periodId === periodId)
      .reduce((m, l) => Math.max(m, l.order), -1) + 1
  );
}
