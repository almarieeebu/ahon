import type { Account } from "./types";

export type PayoffPoint = {
  month: number;
  remaining: number;
  interest: number;
};

function minPay(balance: number, planned: number): number {
  if (balance <= 0) return 0;
  if (planned > 0) return Math.min(planned, Math.max(500, 0.05 * balance));
  return Math.max(500, 0.05 * balance);
}

export function projectPayoff(
  debts: Array<Account & { balance: number }>,
  monthlyBudget: number,
  maxMonths = 60,
): { months: number; interest: number; series: PayoffPoint[]; focusId: string } {
  const books = debts
    .filter((d) => d.kind === "liability" && d.mode !== "installment")
    .map((d) => ({ ...d, bal: Math.max(0, d.balance) }))
    .filter((d) => d.bal > 0.01);

  if (books.length === 0) {
    return {
      months: 0,
      interest: 0,
      series: [{ month: 0, remaining: 0, interest: 0 }],
      focusId: "",
    };
  }

  const focusId = [...books].sort((a, b) => {
    if (b.monthlyRate !== a.monthlyRate) return b.monthlyRate - a.monthlyRate;
    return b.bal - a.bal;
  })[0].id;

  const byId = new Map(books.map((d) => [d.id, d]));
  let interest = 0;
  const series: PayoffPoint[] = [
    {
      month: 0,
      remaining: books.reduce((s, d) => s + d.bal, 0),
      interest: 0,
    },
  ];

  let months = 0;
  while (months < maxMonths) {
    const alive = [...byId.values()].filter((d) => d.bal > 0.01);
    if (alive.length === 0) break;
    months += 1;

    for (const d of alive) {
      const i = d.bal * d.monthlyRate;
      interest += i;
      d.bal += i;
    }

    let remaining = monthlyBudget;
    const still = [...byId.values()].filter((d) => d.bal > 0.01);
    still.sort((a, b) => {
      if (a.id === focusId) return -1;
      if (b.id === focusId) return 1;
      return b.monthlyRate - a.monthlyRate;
    });

    for (const d of still) {
      const pay = Math.min(minPay(d.bal, d.plannedPayment), d.bal, remaining);
      d.bal -= pay;
      remaining -= pay;
    }

    const order = [...byId.values()]
      .filter((d) => d.bal > 0.01)
      .sort((a, b) => {
        if (a.id === focusId) return -1;
        if (b.id === focusId) return 1;
        return b.monthlyRate - a.monthlyRate;
      });

    for (const d of order) {
      if (remaining <= 0) break;
      const pay = Math.min(remaining, d.bal);
      d.bal -= pay;
      remaining -= pay;
    }

    series.push({
      month: months,
      remaining: [...byId.values()].reduce(
        (s, d) => s + Math.max(0, d.bal),
        0,
      ),
      interest,
    });
  }

  return { months, interest, series, focusId };
}
