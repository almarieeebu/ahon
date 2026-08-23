import { money2, summarizeMonthOverview } from "./periodBudget";
import { byKind } from "./selectors";
import type { Account, AppState } from "./types";

export type AffordVerdict = "yes" | "tight" | "no";

export type DebtDueItem = {
  id: string;
  name: string;
  amount: number;
  kind: "housing" | "credit-card" | "loan" | "other";
  label: string;
};

export type MonthAffordability = {
  monthKey: string;
  income: number;
  /** Living / budget-out plan (debt stripped when possible). */
  essentialExpenses: number;
  /** Minimum debt dues this month. */
  debtPayments: number;
  obligations: number;
  gap: number;
  cash: number;
  cashAfter: number;
  verdict: AffordVerdict;
  survivalMode: boolean;
  debtDues: DebtDueItem[];
  incomeSource: "budget" | "settings" | "none";
  obligationsSource: "budget" | "planned" | "none";
};

function debtKind(account: Account): DebtDueItem["kind"] {
  if (account.liabilityType === "housing") return "housing";
  if (account.liabilityType === "credit-card") return "credit-card";
  if (account.liabilityType === "personal") return "loan";
  return "other";
}

/** Minimum debt dues due in this calendar month (installments + planned mins). */
export function debtDuesForMonth(
  state: AppState,
  monthKey: string,
): DebtDueItem[] {
  const items: DebtDueItem[] = [];
  for (const a of byKind(state, "liability")) {
    if (a.mode === "installment" && a.schedule?.length) {
      for (const row of a.schedule) {
        if (row.status !== "unpaid") continue;
        if (!row.due.startsWith(monthKey)) continue;
        items.push({
          id: `${a.id}:${row.id}`,
          name: a.name,
          amount: row.amount,
          kind: debtKind(a),
          label: `Due ${row.due}`,
        });
      }
      continue;
    }
    if ((a.plannedPayment || 0) > 0) {
      items.push({
        id: a.id,
        name: a.name,
        amount: a.plannedPayment,
        kind: debtKind(a),
        label: a.dueDay ? `Due day ${a.dueDay}` : "Planned min",
      });
    }
  }
  return items.sort((x, y) => y.amount - x.amount);
}

/**
 * Critical product question: can income cover this month’s obligations?
 * Prefers Budget sheet totals; falls back to settings income + planned debt dues.
 */
export function monthAffordability(
  state: AppState,
  monthKey: string,
  cash: number,
): MonthAffordability {
  const overview = summarizeMonthOverview(state, monthKey);
  const debtDues = debtDuesForMonth(state, monthKey);
  const debtPayments = money2(debtDues.reduce((s, d) => s + d.amount, 0));

  let income = 0;
  let incomeSource: MonthAffordability["incomeSource"] = "none";
  if (overview.income > 0) {
    income = overview.income;
    incomeSource = "budget";
  } else if (state.settings.monthlyIncome > 0) {
    income = state.settings.monthlyIncome;
    incomeSource = "settings";
  }

  let essentialExpenses = 0;
  let obligationsSource: MonthAffordability["obligationsSource"] = "none";

  if (overview.expense > 0) {
    // Budget out may already include debt lines — strip overlapping dues for display
    essentialExpenses = money2(Math.max(0, overview.expense - debtPayments));
    obligationsSource = "budget";
  } else if (debtPayments > 0) {
    essentialExpenses = 0;
    obligationsSource = "planned";
  }

  const obligations = money2(essentialExpenses + debtPayments);
  income = money2(income);
  const gap = money2(income - obligations);
  const cashAfter = money2(cash + income - obligations);

  let verdict: AffordVerdict = "yes";
  if (income <= 0 && obligations <= 0) {
    verdict = "yes";
  } else if (gap < 0) {
    verdict = "no";
  } else if (gap < income * 0.1 || (cash >= 0 && cashAfter < income * 0.05)) {
    verdict = "tight";
  }

  return {
    monthKey,
    income,
    essentialExpenses,
    debtPayments,
    obligations,
    gap,
    cash,
    cashAfter,
    verdict,
    survivalMode: verdict === "no",
    debtDues,
    incomeSource,
    obligationsSource,
  };
}

/** Survival Mode pay-first order from the product proposal. */
export const SURVIVAL_PRIORITY = [
  "Food and basic living needs",
  "Housing",
  "Utilities",
  "Transportation and healthcare",
  "Minimum debt obligations",
  "Other secured or essential liabilities",
  "Unsecured credit card debt",
  "Pause non-essential spending",
] as const;
