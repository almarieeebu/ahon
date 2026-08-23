"use client";

import { useState } from "react";
import { BudgetTabView } from "@/components/BudgetTabView";
import { HomeView } from "@/components/HomeView";
import { MoreView, type MoreFocusTab } from "@/components/MoreView";
import { Ledger } from "@/components/Ledger";
import { SaveView } from "@/components/SaveView";
import { UtangView } from "@/components/UtangView";
import { useFinance } from "@/context/FinanceContext";
import { APP_NAME } from "@/lib/defaults";
import { monthKey, monthLabel } from "@/lib/money";
import type { TabId } from "@/lib/types";

const TABS: { id: TabId; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "ledger", label: "Ledger" },
  { id: "save", label: "Tigum" },
  { id: "utang", label: "Utang" },
  { id: "budget", label: "Budget" },
  { id: "more", label: "More" },
];

export function AppShell() {
  const { ready, savedAt, month, setMonth } = useFinance();
  const [tab, setTab] = useState<TabId>("home");
  const [moreFocus, setMoreFocus] = useState<MoreFocusTab | null>(null);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-ink-muted">
        Opening {APP_NAME}…
      </div>
    );
  }

  const justSaved = savedAt !== null && Date.now() - savedAt < 2500;
  const showMonth = tab === "home" || tab === "ledger";

  function openMore(focus: MoreFocusTab) {
    setMoreFocus(focus);
    setTab("more");
  }

  return (
    <div className="mx-auto min-h-dvh max-w-6xl px-4 pb-28 pt-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-deep">
            {APP_NAME}
            {justSaved ? (
              <span className="ml-2 font-medium normal-case tracking-normal text-ok">
                saved
              </span>
            ) : null}
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {heading(tab)}
          </h1>
        </div>
        {showMonth ? (
          <label className="text-right text-xs text-ink-muted">
            Month
            <input
              type="month"
              value={month}
              max={monthKey()}
              onChange={(e) => setMonth(e.target.value)}
              className="mt-1 block rounded-lg border border-paper-line bg-white px-2 py-1 text-sm text-ink"
            />
            <span className="sr-only">{monthLabel(month)}</span>
          </label>
        ) : null}
      </header>

      <main className="mt-6">
        {tab === "home" ? (
          <HomeView
            onOpenMore={openMore}
            onOpenBudget={() => setTab("budget")}
            onOpenLedger={() => setTab("ledger")}
          />
        ) : null}
        {tab === "ledger" ? (
          <Ledger
            onManageParticulars={() => openMore("particulars")}
            onManageCategories={() => openMore("budget")}
          />
        ) : null}
        {tab === "save" ? <SaveView /> : null}
        {tab === "utang" ? <UtangView /> : null}
        {tab === "budget" ? <BudgetTabView /> : null}
        {tab === "more" ? <MoreView focusTab={moreFocus} /> : null}
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-paper-line bg-paper/95 backdrop-blur">
        <ul className="mx-auto grid max-w-6xl grid-cols-6">
          {TABS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  if (item.id === "more") setMoreFocus(null);
                  setTab(item.id);
                }}
                className={`flex w-full flex-col items-center py-3 text-[11px] font-semibold ${
                  tab === item.id ? "text-gold-deep" : "text-ink-muted"
                }`}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function heading(tab: TabId): string {
  switch (tab) {
    case "home":
      return "Your books";
    case "ledger":
      return "Ledger";
    case "save":
      return "Tigum";
    case "utang":
      return "Utang";
    case "budget":
      return "Period budget";
    case "more":
      return "Setup";
  }
}
