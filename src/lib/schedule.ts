import { uid } from "./money";
import type { Installment } from "./types";

export function lastDayIso(year: number, monthIndex: number): string {
  const d = new Date(year, monthIndex + 1, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function buildMonthEndSchedule(
  startYm: string,
  count: number,
  amount: number,
): Installment[] {
  const [year, month] = startYm.split("-").map(Number);
  const rows: Installment[] = [];
  for (let i = 0; i < count; i += 1) {
    const due = lastDayIso(year, month - 1 + i);
    rows.push({
      id: uid(),
      due,
      amount,
      status: "unpaid",
      balanceAfter: null,
    });
  }
  return rows;
}

export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Amount still owed on a schedule loan: the balance after the last fully paid
 * row (or the opening balance), minus partial payments recorded on later
 * rows that are not fully paid yet.
 */
export function scheduleRemaining(
  openingBalance: number,
  schedule: Installment[] | undefined,
): number {
  if (!schedule || schedule.length === 0) return openingBalance;
  // Partial payments on rows before the last paid row are already inside
  // that row's balance-after; only later partials still need subtracting.
  let lastPaidIndex = -1;
  schedule.forEach((row, i) => {
    if (row.status === "paid") lastPaidIndex = i;
  });
  const partial = schedule
    .filter((row, i) => i > lastPaidIndex && row.status !== "paid")
    .reduce((sum, row) => sum + (row.paidAmount ?? 0), 0);
  const paid = schedule.filter((row) => row.status === "paid");
  const last = paid[paid.length - 1];
  let base: number;
  if (last && last.balanceAfter != null) base = Math.max(0, last.balanceAfter);
  else if (paid.length === 0) base = openingBalance;
  else {
    base = schedule
      .filter((row) => row.status !== "paid")
      .reduce((sum, row) => sum + row.amount, 0);
  }
  return Math.max(0, Math.round((base - partial) * 100) / 100);
}

/** What has been paid toward one installment (legacy paid rows = full amount). */
export function installmentPaidSoFar(row: Installment): number {
  if (row.paidAmount != null) return row.paidAmount;
  return row.status === "paid" ? row.amount : 0;
}

/** Sum of scheduled payments not yet made (unpaid rows less partial payments). */
export function scheduledRepaymentsLeft(schedule: Installment[] | undefined): number {
  const total = (schedule ?? [])
    .filter((row) => row.status !== "paid")
    .reduce((sum, row) => sum + Math.max(0, row.amount - (row.paidAmount ?? 0)), 0);
  return Math.round(total * 100) / 100;
}

/** Days in a month (monthIndex 0-11); handles leap years. */
function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Monthly schedule starting on `firstDue` (YYYY-MM-DD), keeping the same day
 * of month and clamping to the month end (e.g. 31 -> Feb 28/29).
 */
export function buildMonthlySchedule(
  firstDue: string,
  count: number,
  amount: number,
): Installment[] {
  const [year, month, day] = firstDue.split("-").map(Number);
  const rows: Installment[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(year, month - 1 + i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const dd = Math.min(day, daysInMonth(y, m));
    rows.push({
      id: uid(),
      due: `${y}-${String(m + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`,
      amount,
      status: "unpaid",
      balanceAfter: null,
    });
  }
  return rows;
}

export function nextUnpaid(schedule: Installment[] | undefined): Installment | undefined {
  return schedule?.find((row) => row.status !== "paid");
}

export function lastPaid(schedule: Installment[] | undefined): Installment | undefined {
  return [...(schedule ?? [])].reverse().find((row) => row.status === "paid");
}
