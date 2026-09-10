"use client";

import { useFinance } from "@/context/FinanceContext";
import type { MoreFocusTab } from "@/components/MoreView";

const STEPS: {
  n: number;
  title: string;
  body: string;
  focus: MoreFocusTab | "budget-tab" | "ledger";
  cta: string;
}[] = [
  {
    n: 1,
    title: "Usual month",
    body: "Enter take-home pay, cash now, and the bills you always pay. Skip any amount you do not know yet.",
    focus: "budget",
    cta: "Money plan",
  },
  {
    n: 2,
    title: "Log when money moves",
    body: "Payday, a bill, or gastos — amount and what it was for. That is enough.",
    focus: "ledger",
    cta: "Open Log",
  },
  {
    n: 3,
    title: "Later, if you want",
    body: "Tigum pots, extra wallets, and extra names live in Menu. You do not need them to start.",
    focus: "accounts",
    cta: "Open Menu",
  },
];

export function isFreshBooks(state: {
  accounts: unknown[];
  categories: unknown[];
  particulars: unknown[];
  budgetPeriods: unknown[];
  transactions: unknown[];
}): boolean {
  return (
    state.accounts.length === 0 &&
    state.categories.length === 0 &&
    state.particulars.length === 0 &&
    state.budgetPeriods.length === 0 &&
    state.transactions.length === 0
  );
}

type Props = {
  onOpenMore: (focus: MoreFocusTab) => void;
  onOpenBudget: () => void;
  onOpenLedger: () => void;
};

export function GettingStarted({
  onOpenMore,
  onOpenBudget,
  onOpenLedger,
}: Props) {
  const { syncMode } = useFinance();

  function runStep(step: (typeof STEPS)[number]) {
    if (step.focus === "ledger") {
      onOpenLedger();
      return;
    }
    if (step.focus === "budget-tab") {
      onOpenBudget();
      return;
    }
    onOpenMore(step.focus);
  }

  return (
    <div className="rounded-2xl border border-paper-line bg-white/80 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-deep">
        Getting started
      </p>
      <h2 className="font-display text-xl font-semibold tracking-tight">
        Start with your usual month
      </h2>
      <p className="mt-2 text-sm text-ink-muted">
        You do not need to learn accounts or categories first.{" "}
        {syncMode === "cloud"
          ? "Everything syncs after you save."
          : "Data stays on this device until you sign in."}
      </p>

      <ol className="mt-5 space-y-3">
        {STEPS.map((step) => (
          <li
            key={step.n}
            className="flex flex-col gap-2 rounded-xl border border-paper-line bg-paper/50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">
                <span className="mr-2 text-ink-muted">{step.n}.</span>
                {step.title}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">{step.body}</p>
            </div>
            <button
              type="button"
              onClick={() => runStep(step)}
              className="shrink-0 self-start rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-paper sm:self-center"
            >
              {step.cta}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
