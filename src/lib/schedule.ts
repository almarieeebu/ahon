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

export function scheduleRemaining(
  openingBalance: number,
  schedule: Installment[] | undefined,
): number {
  if (!schedule || schedule.length === 0) return openingBalance;
  const paid = schedule.filter((row) => row.status === "paid");
  const last = paid[paid.length - 1];
  if (last && last.balanceAfter != null) return Math.max(0, last.balanceAfter);
  if (paid.length === 0) return openingBalance;
  return schedule
    .filter((row) => row.status !== "paid")
    .reduce((sum, row) => sum + row.amount, 0);
}

export function nextUnpaid(schedule: Installment[] | undefined): Installment | undefined {
  return schedule?.find((row) => row.status !== "paid");
}

export function lastPaid(schedule: Installment[] | undefined): Installment | undefined {
  return [...(schedule ?? [])].reverse().find((row) => row.status === "paid");
}
