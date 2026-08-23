import { monthAffordability } from "./affordability";
import { todayIso } from "./money";
import { projectPayoff } from "./payoff";
import { money2, summarizeMonthOverview } from "./periodBudget";
import {
  accountBalances,
  byKind,
  deriveMonth,
  liabilityLeft,
  sumKind,
} from "./selectors";
import type { Account, AppState, BudgetLine } from "./types";

export type AlertSeverity = "critical" | "warn" | "info";
export type AlertAction = "utang" | "budget" | "ledger";

export type AlertKind =
  | "overdue_credit_card"
  | "overdue_installment"
  | "upcoming_housing"
  | "upcoming_bill"
  | "debt_due_soon"
  | "cash_shortage"
  | "negative_cash_flow"
  | "extra_cash_debt"
  | "debt_priority";

export type FinanceAlert = {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  detail: string;
  amount?: number;
  action?: AlertAction;
};

const SOON_DAYS = 14;
const DUE_SOON_DAYS = 7;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(`${aIso}T12:00:00`);
  const b = new Date(`${bIso}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** Calendar date for a due-day inside monthKey (clamped to month length). */
export function dueDateInMonth(monthKey: string, dueDay: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const day = Math.min(Math.max(dueDay || last, 1), last);
  return `${monthKey}-${pad2(day)}`;
}

function monthKeysAround(today: string): string[] {
  const [y, m] = today.slice(0, 7).split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${pad2(m - 1)}`;
  const cur = `${y}-${pad2(m)}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${pad2(m + 1)}`;
  return [prev, cur, next];
}

/** Next occurrence of dueDay on or after today (within ~2 months). */
export function nextDueDate(dueDay: number, today = todayIso()): string | null {
  if (!dueDay) return null;
  for (const mk of monthKeysAround(today)) {
    const d = dueDateInMonth(mk, dueDay);
    if (d >= today) return d;
  }
  const [y, m] = today.slice(0, 7).split("-").map(Number);
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  return dueDateInMonth(`${nextY}-${pad2(nextM)}`, dueDay);
}

function paidTowardDebt(
  state: AppState,
  accountId: string,
  monthKey: string,
): number {
  return deriveMonth(state, monthKey).paidByLiability[accountId] ?? 0;
}

function revolvingMinMet(
  state: AppState,
  account: Account,
  monthKey: string,
): boolean {
  const planned = account.plannedPayment || 0;
  if (planned <= 0) return true;
  return paidTowardDebt(state, account.id, monthKey) + 0.01 >= planned;
}

export type OverdueFlag = {
  accountId: string;
  label: string;
  amount: number;
  due: string;
  reason: "overdue_cc" | "overdue_installment";
};

/** Flags used by Utang badges and alert engine. */
export function overdueFlags(
  state: AppState,
  today = todayIso(),
): OverdueFlag[] {
  const monthKey = today.slice(0, 7);
  const flags: OverdueFlag[] = [];

  for (const a of byKind(state, "liability")) {
    if (a.mode === "installment" && a.schedule?.length) {
      for (const row of a.schedule) {
        if (row.status === "paid") continue;
        if (row.due >= today) continue;
        flags.push({
          accountId: a.id,
          label: a.name,
          amount: row.amount,
          due: row.due,
          reason: "overdue_installment",
        });
      }
      continue;
    }

    if ((a.plannedPayment || 0) <= 0 || !a.dueDay) continue;
    const due = dueDateInMonth(monthKey, a.dueDay);
    if (due >= today) continue;
    if (revolvingMinMet(state, a, monthKey)) continue;
    flags.push({
      accountId: a.id,
      label: a.name,
      amount: a.plannedPayment,
      due,
      reason:
        a.liabilityType === "credit-card" ? "overdue_cc" : "overdue_installment",
    });
  }

  return flags;
}

function billLinesUpcoming(
  state: AppState,
  today: string,
): Array<{ line: BudgetLine; days: number }> {
  const out: Array<{ line: BudgetLine; days: number }> = [];
  for (const line of state.budgetLines) {
    if (!line.due || (line.expense || 0) <= 0) continue;
    if (line.status === "paid") continue;
    const days = daysBetween(today, line.due);
    if (days < 0 || days > SOON_DAYS) continue;
    out.push({ line, days });
  }
  return out.sort((a, b) => a.days - b.days);
}

/**
 * All proposal §2 / §15 red-flag alerts for the Home Critical Alerts panel.
 */
export function buildFinanceAlerts(
  state: AppState,
  opts?: { monthKey?: string; today?: string },
): FinanceAlert[] {
  const today = opts?.today ?? todayIso();
  const monthKey = opts?.monthKey ?? today.slice(0, 7);
  const balances = accountBalances(state);
  const cash = sumKind(state, balances, "cash");
  const afford = monthAffordability(state, monthKey, cash);
  const overview = summarizeMonthOverview(state, monthKey);
  const alerts: FinanceAlert[] = [];
  const overdue = overdueFlags(state, today);

  for (const flag of overdue) {
    const isCc = flag.reason === "overdue_cc";
    const account = state.accounts.find((a) => a.id === flag.accountId);
    const cc =
      isCc || account?.liabilityType === "credit-card";
    alerts.push({
      id: `overdue:${flag.accountId}:${flag.due}`,
      kind: cc ? "overdue_credit_card" : "overdue_installment",
      severity: "critical",
      title: cc
        ? `Overdue credit card — ${flag.label}`
        : `Overdue payment — ${flag.label}`,
      detail: `Was due ${flag.due}. Pay as soon as you can.`,
      amount: flag.amount,
      action: "utang",
    });
  }

  // Upcoming housing amortization (next 14 days, not yet overdue)
  for (const a of byKind(state, "liability")) {
    if (a.liabilityType !== "housing") continue;
    if (a.mode === "installment" && a.schedule?.length) {
      for (const row of a.schedule) {
        if (row.status === "paid") continue;
        const days = daysBetween(today, row.due);
        if (days < 0 || days > SOON_DAYS) continue;
        alerts.push({
          id: `housing:${a.id}:${row.id}`,
          kind: "upcoming_housing",
          severity: days <= DUE_SOON_DAYS ? "critical" : "warn",
          title: `Housing amortization — ${a.name}`,
          detail:
            days === 0
              ? "Due today."
              : `Due in ${days} day${days === 1 ? "" : "s"} (${row.due}).`,
          amount: row.amount,
          action: "utang",
        });
      }
    } else if (a.dueDay && (a.plannedPayment || 0) > 0) {
      const due = nextDueDate(a.dueDay, today);
      if (!due) continue;
      const days = daysBetween(today, due);
      if (days < 0 || days > SOON_DAYS) continue;
      if (days === 0 && revolvingMinMet(state, a, monthKey)) continue;
      alerts.push({
        id: `housing-rev:${a.id}:${due}`,
        kind: "upcoming_housing",
        severity: days <= DUE_SOON_DAYS ? "critical" : "warn",
        title: `Housing amortization — ${a.name}`,
        detail:
          days === 0
            ? "Due today."
            : `Due in ${days} day${days === 1 ? "" : "s"} (${due}).`,
        amount: a.plannedPayment,
        action: "utang",
      });
    }
  }

  // Upcoming bills (budget lines)
  for (const { line, days } of billLinesUpcoming(state, today)) {
    alerts.push({
      id: `bill:${line.id}`,
      kind: "upcoming_bill",
      severity: days <= 3 ? "warn" : "info",
      title: `Upcoming bill — ${line.particular || "Budget line"}`,
      detail:
        days === 0
          ? "Due today."
          : `Due in ${days} day${days === 1 ? "" : "s"} (${line.due}).`,
      amount: line.expense,
      action: "budget",
    });
  }

  // Category due days (setup) as soft bill reminders if no matching budget line
  for (const cat of state.categories) {
    if ((cat.kind ?? "expense") !== "expense" || !cat.dueDay || cat.planned <= 0)
      continue;
    const due = nextDueDate(cat.dueDay, today);
    if (!due) continue;
    const days = daysBetween(today, due);
    if (days < 0 || days > SOON_DAYS) continue;
    const already = alerts.some(
      (al) =>
        al.kind === "upcoming_bill" &&
        al.title.toLowerCase().includes(cat.name.toLowerCase()),
    );
    if (already) continue;
    alerts.push({
      id: `cat-bill:${cat.id}:${due}`,
      kind: "upcoming_bill",
      severity: "info",
      title: `Upcoming — ${cat.name}`,
      detail: `Category due day ${cat.dueDay} · ${due}`,
      amount: cat.planned,
      action: "budget",
    });
  }

  // Other debt due soon (non-housing, not already overdue)
  const overdueIds = new Set(overdue.map((o) => o.accountId));
  for (const a of byKind(state, "liability")) {
    if (a.liabilityType === "housing") continue;
    if (overdueIds.has(a.id)) continue;

    if (a.mode === "installment" && a.schedule?.length) {
      for (const row of a.schedule) {
        if (row.status === "paid") continue;
        const days = daysBetween(today, row.due);
        if (days < 0 || days > DUE_SOON_DAYS) continue;
        alerts.push({
          id: `due-soon:${a.id}:${row.id}`,
          kind: "debt_due_soon",
          severity: "warn",
          title: `Debt due soon — ${a.name}`,
          detail: `Due in ${days} day${days === 1 ? "" : "s"} (${row.due}).`,
          amount: row.amount,
          action: "utang",
        });
      }
    } else if (a.dueDay && (a.plannedPayment || 0) > 0) {
      const due = nextDueDate(a.dueDay, today);
      if (!due) continue;
      const days = daysBetween(today, due);
      if (days < 0 || days > DUE_SOON_DAYS) continue;
      if (revolvingMinMet(state, a, monthKey)) continue;
      alerts.push({
        id: `due-soon-rev:${a.id}:${due}`,
        kind: "debt_due_soon",
        severity: "warn",
        title: `Debt due soon — ${a.name}`,
        detail: `Due in ${days} day${days === 1 ? "" : "s"} (${due}).`,
        amount: a.plannedPayment,
        action: "utang",
      });
    }
  }

  if (afford.gap < 0) {
    alerts.push({
      id: "negative-cash-flow",
      kind: "negative_cash_flow",
      severity: "critical",
      title: "Negative monthly cash flow",
      detail: `Obligations exceed income by ₱${money2(Math.abs(afford.gap)).toFixed(2)} this month.`,
      amount: Math.abs(afford.gap),
      action: "budget",
    });
  } else if (overview.income > 0 && overview.expense > overview.income) {
    alerts.push({
      id: "negative-budget-flow",
      kind: "negative_cash_flow",
      severity: "critical",
      title: "Negative monthly cash flow",
      detail: "Budget out is higher than budget in for this month.",
      amount: money2(overview.expense - overview.income),
      action: "budget",
    });
  }

  if (afford.cashAfter < 0) {
    alerts.push({
      id: "cash-shortage",
      kind: "cash_shortage",
      severity: "critical",
      title: "Projected cash shortage",
      detail: `After this month’s income and obligations, cash would be short by ₱${money2(Math.abs(afford.cashAfter)).toFixed(2)}.`,
      amount: Math.abs(afford.cashAfter),
      action: "ledger",
    });
  }

  const revolving = byKind(state, "liability")
    .filter((a) => a.mode !== "installment")
    .map((a) => ({
      ...a,
      balance: liabilityLeft(a, balances[a.id] ?? 0),
    }))
    .filter((a) => a.balance > 0.01);

  const mins = revolving.reduce((s, a) => s + (a.plannedPayment || 0), 0);
  const surplus = money2(Math.max(0, afford.gap, afford.cashAfter));
  if (surplus > 0 && revolving.length > 0 && afford.verdict !== "no") {
    const focus = projectPayoff(revolving, Math.max(mins, surplus)).focusId;
    const focusAcc = revolving.find((a) => a.id === focus);
    alerts.push({
      id: "extra-cash",
      kind: "extra_cash_debt",
      severity: "info",
      title: "Extra cash for debt repayment",
      detail: focusAcc
        ? `About ₱${surplus.toFixed(2)} room after obligations — put extra toward ${focusAcc.name} (highest rate / balance).`
        : `About ₱${surplus.toFixed(2)} may be available after obligations.`,
      amount: surplus,
      action: "utang",
    });
    if (focusAcc) {
      alerts.push({
        id: `priority:${focusAcc.id}`,
        kind: "debt_priority",
        severity: "info",
        title: `Pay this debt next — ${focusAcc.name}`,
        detail: "Avalanche focus: highest interest (then largest balance).",
        amount: focusAcc.balance,
        action: "utang",
      });
    }
  } else if (revolving.length > 1) {
    const focus = projectPayoff(revolving, Math.max(mins, 1)).focusId;
    const focusAcc = revolving.find((a) => a.id === focus);
    if (focusAcc) {
      alerts.push({
        id: `priority:${focusAcc.id}`,
        kind: "debt_priority",
        severity: "warn",
        title: `Priority debt — ${focusAcc.name}`,
        detail: "When you can pay extra, attack this balance first (highest rate).",
        amount: focusAcc.balance,
        action: "utang",
      });
    }
  }

  // Deduplicate by id; critical first
  const seen = new Set<string>();
  const severityRank = { critical: 0, warn: 1, info: 2 };
  return alerts
    .filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    })
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}

export function accountIsOverdue(
  state: AppState,
  accountId: string,
  today = todayIso(),
): boolean {
  return overdueFlags(state, today).some((f) => f.accountId === accountId);
}
