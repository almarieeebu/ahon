import { money2 } from "./periodBudget";
import { deriveMonth, byKind } from "./selectors";
import type { AppState, BudgetLine, Category } from "./types";

export type CashNeedKind = "bill" | "debt";

export type CashNeed = {
  id: string;
  name: string;
  amount: number;
  due: string;
  kind: CashNeedKind;
  overdue: boolean;
};

export type BeforePaydayPlan = {
  today: string;
  end: string;
  usesPayday: boolean;
  cash: number;
  bills: number;
  debtMinimums: number;
  reserve: number;
  totalNeeded: number;
  safeToUse: number;
  shortfall: number;
  needs: CashNeed[];
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function dateForMonthDay(monthKey: string, dueDay: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const day = Math.min(Math.max(dueDay, 1), lastDay);
  return `${monthKey}-${pad2(day)}`;
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-");
}

/** Finds the first configured payday on or after today. */
export function nextPayday(
  paydayDays: number[],
  today: string,
): string | null {
  const days = [...new Set(paydayDays)]
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 31)
    .sort((a, b) => a - b);
  if (days.length === 0) return null;

  const [year, month] = today.slice(0, 7).split("-").map(Number);
  for (let offset = 0; offset < 4; offset += 1) {
    const rawMonth = month + offset;
    const candidateYear = year + Math.floor((rawMonth - 1) / 12);
    const candidateMonth = ((rawMonth - 1) % 12) + 1;
    const monthKey = `${candidateYear}-${pad2(candidateMonth)}`;
    for (const day of days) {
      const candidate = dateForMonthDay(monthKey, day);
      if (candidate >= today) return candidate;
    }
  }
  return null;
}

function categoryForLine(state: AppState, line: BudgetLine): string | null {
  const particular = state.particulars.find((p) => p.id === line.particularId);
  if (particular?.categoryId) return particular.categoryId;
  const normalized = line.particular.trim().toLowerCase();
  return (
    state.categories.find((category) => category.name.trim().toLowerCase() === normalized)
      ?.id ?? null
  );
}

function billNeeds(
  state: AppState,
  today: string,
  end: string,
): CashNeed[] {
  const needs: CashNeed[] = [];
  const representedCategories = new Set<string>();

  for (const line of state.budgetLines) {
    if (!line.due || line.status === "paid" || line.expense <= 0) continue;
    if (line.due < today || line.due > end) continue;
    const categoryId = categoryForLine(state, line);
    if (categoryId) representedCategories.add(categoryId);
    needs.push({
      id: `bill:${line.id}`,
      name: line.particular || "Budget bill",
      amount: line.expense,
      due: line.due,
      kind: "bill",
      overdue: false,
    });
  }

  for (const category of state.categories) {
    if (!isDueExpenseCategory(category) || representedCategories.has(category.id)) {
      continue;
    }
    const due = nextDueForCategory(category, today);
    if (!due || due > end) continue;
    needs.push({
      id: `category:${category.id}:${due}`,
      name: category.name,
      amount: category.planned,
      due,
      kind: "bill",
      overdue: false,
    });
  }

  return needs;
}

function isDueExpenseCategory(category: Category): boolean {
  return (
    category.kind === "expense" &&
    category.planned > 0 &&
    category.dueDay > 0
  );
}

function nextDueForCategory(category: Category, today: string): string | null {
  const [year, month] = today.slice(0, 7).split("-").map(Number);
  for (let offset = 0; offset < 3; offset += 1) {
    const rawMonth = month + offset;
    const candidateYear = year + Math.floor((rawMonth - 1) / 12);
    const candidateMonth = ((rawMonth - 1) % 12) + 1;
    const candidate = dateForMonthDay(
      `${candidateYear}-${pad2(candidateMonth)}`,
      category.dueDay,
    );
    if (candidate >= today) return candidate;
  }
  return null;
}

function debtNeeds(
  state: AppState,
  today: string,
  end: string,
): CashNeed[] {
  const needs: CashNeed[] = [];
  const currentMonth = today.slice(0, 7);
  const flow = deriveMonth(state, currentMonth);

  for (const account of byKind(state, "liability")) {
    if (account.mode === "installment" && account.schedule?.length) {
      for (const installment of account.schedule) {
        if (installment.status === "paid" || installment.due > end) continue;
        needs.push({
          id: `debt:${account.id}:${installment.id}`,
          name: account.name,
          amount: installment.amount,
          due: installment.due,
          kind: "debt",
          overdue: installment.due < today,
        });
      }
      continue;
    }

    if (account.plannedPayment <= 0 || account.dueDay <= 0) continue;
    const due = dateForMonthDay(currentMonth, account.dueDay);
    const alreadyPaid = (flow.paidByLiability[account.id] ?? 0) + 0.01 >= account.plannedPayment;
    if (alreadyPaid || due > end) continue;
    needs.push({
      id: `debt:${account.id}:${due}`,
      name: account.name,
      amount: account.plannedPayment,
      due,
      kind: "debt",
      overdue: due < today,
    });
  }

  return needs;
}

/**
 * Conservative cash check through the next configured payday. If no regular
 * payday is set, it protects the next 14 days and labels that fallback in UI.
 */
export function moneyNeededBeforePayday(
  state: AppState,
  cash: number,
  today: string,
): BeforePaydayPlan {
  const payday = nextPayday(state.settings.paydayDays, today);
  const end = payday ?? addDays(today, 14);
  const needs = [...billNeeds(state, today, end), ...debtNeeds(state, today, end)]
    .sort((a, b) => a.due.localeCompare(b.due) || b.amount - a.amount);
  const bills = money2(
    needs.filter((need) => need.kind === "bill").reduce((sum, need) => sum + need.amount, 0),
  );
  const debtMinimums = money2(
    needs.filter((need) => need.kind === "debt").reduce((sum, need) => sum + need.amount, 0),
  );
  const reserve = money2(Math.max(0, state.settings.emergencyReserve || 0));
  const totalNeeded = money2(bills + debtMinimums + reserve);
  const safeToUse = money2(Math.max(0, cash - totalNeeded));

  return {
    today,
    end,
    usesPayday: payday != null,
    cash: money2(cash),
    bills,
    debtMinimums,
    reserve,
    totalNeeded,
    safeToUse,
    shortfall: money2(Math.max(0, totalNeeded - cash)),
    needs,
  };
}
