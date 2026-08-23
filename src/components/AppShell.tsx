"use client";

import { useCallback, useEffect, useState } from "react";
import { BudgetTabView } from "@/components/BudgetTabView";
import { HomeView } from "@/components/HomeView";
import { ManualModal, PageHelpModal } from "@/components/HelpModals";
import { MoreView, type MoreFocusTab } from "@/components/MoreView";
import { Ledger } from "@/components/Ledger";
import { SaveView } from "@/components/SaveView";
import { UtangView } from "@/components/UtangView";
import { WelcomeTour } from "@/components/WelcomeTour";
import { useFinance } from "@/context/FinanceContext";
import { APP_NAME } from "@/lib/defaults";
import { monthKey, monthLabel } from "@/lib/money";
import type { TabId } from "@/lib/types";

const PRIMARY_TABS: { id: TabId; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "ledger", label: "Ledger" },
  { id: "budget", label: "Budget" },
];

const MENU_PAGES: { id: TabId; label: string; hint: string }[] = [
  { id: "save", label: "Tigum", hint: "Savings pots & goals" },
  { id: "utang", label: "Utang", hint: "Loans & credit to pay" },
];

const MENU_SETUP: { id: MoreFocusTab; label: string; hint: string }[] = [
  {
    id: "budget",
    label: "Budget setup",
    hint: "Income & expense categories",
  },
  {
    id: "particulars",
    label: "Particulars",
    hint: "Names for Budget & Ledger lines",
  },
  {
    id: "accounts",
    label: "Accounts",
    hint: "Cash, wallets, banks",
  },
  {
    id: "profile",
    label: "Profile",
    hint: "Sign-in, sync, Manual, tour",
  },
];

export function AppShell() {
  const { ready, savedAt, month, setMonth } = useFinance();
  const [tab, setTab] = useState<TabId>("home");
  const [moreFocus, setMoreFocus] = useState<MoreFocusTab | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [tourSession, setTourSession] = useState(0);

  const goTab = useCallback((next: TabId) => {
    if (next === "more") setMoreFocus(null);
    setTab(next);
    setMenuOpen(false);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-ink-muted">
        Opening {APP_NAME}…
      </div>
    );
  }

  const justSaved = savedAt !== null;
  const showMonth = tab === "home" || tab === "ledger";
  const menuActive =
    tab === "save" || tab === "utang" || tab === "more";

  function openMore(focus: MoreFocusTab) {
    setMoreFocus(focus);
    setTab("more");
    setMenuOpen(false);
  }

  return (
    <div className="mx-auto min-h-dvh max-w-6xl px-4 pb-28 pt-6">
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-deep">
            {APP_NAME}
            {justSaved ? (
              <span className="ml-2 font-medium normal-case tracking-normal text-ok">
                saved
              </span>
            ) : null}
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {heading(tab, moreFocus)}
          </h1>
        </div>
        <div className="flex shrink-0 items-end gap-2">
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
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            aria-label="Help for this page"
            className="rounded-full border border-paper-line bg-white px-3 py-2 text-xs font-semibold text-ink"
          >
            Help
          </button>
        </div>
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
        {tab === "more" ? (
          <MoreView
            focusTab={moreFocus}
            onOpenManual={() => setManualOpen(true)}
            onReplayTour={() => setTourSession((n) => n + 1)}
          />
        ) : null}
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-paper-line bg-paper/95 backdrop-blur">
        <ul className="mx-auto grid max-w-6xl grid-cols-4">
          {PRIMARY_TABS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => goTab(item.id)}
                className={`flex w-full flex-col items-center py-3.5 text-base font-semibold ${
                  tab === item.id ? "text-gold-deep" : "text-ink-muted"
                }`}
              >
                {item.label}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              className={`flex w-full items-center justify-center py-3.5 ${
                menuActive || menuOpen ? "text-gold-deep" : "text-ink-muted"
              }`}
            >
              <MenuIcon />
            </button>
          </li>
        </ul>
      </nav>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-ink/40"
            onClick={() => setMenuOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="relative z-10 max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-paper-line bg-paper p-5 shadow-xl sm:rounded-2xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="font-display text-xl font-semibold">Menu</h2>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="text-sm font-semibold text-ink-muted hover:text-ink"
              >
                Close
              </button>
            </div>

            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Pages
            </p>
            <ul className="mt-2 space-y-1">
              {MENU_PAGES.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => goTab(item.id)}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left ${
                      tab === item.id
                        ? "border-gold-deep/40 bg-gold-deep/10"
                        : "border-paper-line bg-white"
                    }`}
                  >
                    <span>
                      <span className="block text-base font-semibold text-ink">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block text-sm text-ink-muted">
                        {item.hint}
                      </span>
                    </span>
                    <span className="text-ink-muted" aria-hidden>
                      →
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Setup
            </p>
            <ul className="mt-2 space-y-1">
              {MENU_SETUP.map((item) => {
                const active = tab === "more" && moreFocus === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openMore(item.id)}
                      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left ${
                        active
                          ? "border-gold-deep/40 bg-gold-deep/10"
                          : "border-paper-line bg-white"
                      }`}
                    >
                      <span>
                        <span className="block text-base font-semibold text-ink">
                          {item.label}
                        </span>
                        <span className="mt-0.5 block text-sm text-ink-muted">
                          {item.hint}
                        </span>
                      </span>
                      <span className="text-ink-muted" aria-hidden>
                        →
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}

      <PageHelpModal
        open={helpOpen}
        tab={tab}
        onClose={() => setHelpOpen(false)}
      />
      <ManualModal open={manualOpen} onClose={() => setManualOpen(false)} />
      <WelcomeTour
        key={tourSession}
        startOpen={tourSession > 0 ? true : undefined}
        onNavigate={goTab}
      />
    </div>
  );
}

function MenuIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
    >
      <path
        d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function heading(tab: TabId, moreFocus: MoreFocusTab | null): string {
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
      switch (moreFocus) {
        case "particulars":
          return "Particulars";
        case "accounts":
          return "Accounts";
        case "profile":
          return "Profile";
        case "budget":
          return "Budget setup";
        default:
          return "Setup";
      }
  }
}
