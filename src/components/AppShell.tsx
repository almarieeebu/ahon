"use client";

import { useCallback, useState } from "react";
import { AddLoanSheet } from "@/components/AddLoanSheet";
import { BudgetTabView } from "@/components/BudgetTabView";
import { HomeView } from "@/components/HomeView";
import { ManualModal, PageHelpModal } from "@/components/HelpModals";
import { Modal } from "@/components/Modal";
import { MoreView, type MoreFocusTab } from "@/components/MoreView";
import { Ledger } from "@/components/Ledger";
import { NavIcon, type IconName } from "@/components/NavIcons";
import { RecordLoanPaymentSheet } from "@/components/RecordLoanPaymentSheet";
import { SaveView } from "@/components/SaveView";
import { SimpleLogSheet } from "@/components/SimpleLogSheet";
import { UtangView } from "@/components/UtangView";
import { WelcomeTour } from "@/components/WelcomeTour";
import { useFinance } from "@/context/FinanceContext";
import { APP_NAME } from "@/lib/defaults";
import { monthKey, monthLabel } from "@/lib/money";
import { byKind } from "@/lib/selectors";
import type { TabId } from "@/lib/types";

/** Primary navigation. Internal ids stay stable; labels are what people see. */
export const PRIMARY_TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "ledger", label: "Activity", icon: "activity" },
  { id: "budget", label: "Budget", icon: "budget" },
  { id: "utang", label: "Loans", icon: "loans" },
];

const MENU_SETUP: { id: MoreFocusTab; label: string; hint: string; icon: IconName }[] = [
  {
    id: "budget",
    label: "Income & recurring bills",
    hint: "Take-home pay, paydays, bills & spending groups",
    icon: "income",
  },
  {
    id: "accounts",
    label: "Cash & wallets",
    hint: "Cash, GCash, Maya and banks",
    icon: "wallets",
  },
  {
    id: "particulars",
    label: "Bill & income names",
    hint: "Optional reusable names for your records",
    icon: "names",
  },
  {
    id: "profile",
    label: "Profile",
    hint: "Sign-in, sync, Manual, tour",
    icon: "profile",
  },
];

/** Forms that can open over any page. */
type QuickAction = "expense" | "log" | "transfer" | "loan" | "payment";

export function AppShell() {
  const { ready, savedAt, month, setMonth, state } = useFinance();
  const [tab, setTab] = useState<TabId>("home");
  const [moreFocus, setMoreFocus] = useState<MoreFocusTab | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [tourSession, setTourSession] = useState(0);
  const [action, setAction] = useState<QuickAction | "loan-new" | null>(null);
  // Amount typed in Log money before choosing "Borrowed (utang)".
  const [borrowAmount, setBorrowAmount] = useState("");
  // Ask the Budget page to open "Set monthly budget" (from a quick action).
  const [pendingBudgetForm, setPendingBudgetForm] = useState(false);
  const consumeBudgetForm = useCallback(() => setPendingBudgetForm(false), []);

  const goTab = useCallback((next: TabId) => {
    if (next === "more") setMoreFocus(null);
    setTab(next);
    setMenuOpen(false);
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-ink-muted">
        Opening {APP_NAME}…
      </div>
    );
  }

  const justSaved = savedAt !== null;
  const showMonth = tab === "home" || tab === "ledger";
  const menuActive = tab === "save" || tab === "more";
  const hasLoans = byKind(state, "liability").length > 0;

  function openMore(focus: MoreFocusTab) {
    setMoreFocus(focus);
    setTab("more");
    setMenuOpen(false);
  }

  function startAction(next: QuickAction | "budget") {
    setAddMenuOpen(false);
    if (next === "budget") {
      setTab("budget");
      setPendingBudgetForm(true);
      return;
    }
    setAction(next);
  }

  function openBorrowed(amount: string) {
    setBorrowAmount(amount);
    setAction("loan-new");
  }

  const quickActions: { id: QuickAction | "budget"; label: string; hint: string; icon: IconName }[] = [
    { id: "expense", label: "Add expense", hint: "Gastos, bills, anything you paid", icon: "expense" },
    { id: "log", label: "Log money", hint: "Payday, money in, transfers", icon: "income" },
    { id: "transfer", label: "Transfer", hint: "Move money between wallets, with fee", icon: "transfer" },
    { id: "loan", label: "Add loan", hint: "Utang you owe or just borrowed", icon: "loans" },
    ...(hasLoans
      ? [{ id: "payment" as const, label: "Record payment", hint: "Pay toward a loan", icon: "pay" as const }]
      : []),
    { id: "budget", label: "Set budget", hint: "Spending limits for the month", icon: "budget" },
  ];

  const navItem = (active: boolean) =>
    `group flex w-full min-w-0 items-center rounded-xl text-left font-semibold transition-colors ${
      active
        ? "text-gold-deep lg:bg-gold-soft lg:text-ink"
        : "text-ink-muted hover:text-ink lg:hover:bg-paper-soft"
    }`;

  function renderTab(item: (typeof PRIMARY_TABS)[number]) {
    const active = tab === item.id;
    return (
      <li key={item.id} className="min-w-0">
        <button
          type="button"
          onClick={() => goTab(item.id)}
          aria-current={active ? "page" : undefined}
          data-testid={`tab-${item.id}`}
          className={`${navItem(active)} min-h-14 flex-col justify-center gap-0.5 px-0.5 text-xs sm:text-sm lg:min-h-10 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-sm`}
        >
          <NavIcon name={item.icon} />
          <span className={`max-w-full truncate ${active ? "underline decoration-2 underline-offset-4 lg:no-underline" : ""}`}>
            {item.label}
          </span>
        </button>
      </li>
    );
  }

  return (
    <div className="min-h-dvh lg:pl-64">
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-paper-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:inset-y-0 lg:left-0 lg:right-auto lg:flex lg:w-64 lg:flex-col lg:overflow-y-auto lg:border-r lg:border-t-0 lg:bg-white/60 lg:px-3 lg:pb-4 lg:pt-6"
      >
        <div className="hidden px-3 lg:block">
          <p className="font-display text-xl font-semibold tracking-tight">{APP_NAME}</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            Money journal
            {justSaved ? <span className="ml-1.5 font-semibold text-ok">· saved</span> : null}
          </p>
        </div>

        <div className="mt-5 hidden px-1 lg:block" role="group" aria-label="Quick actions">
          <button
            type="button"
            data-testid="quick-add-expense"
            onClick={() => startAction("expense")}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-paper hover:bg-ink/90"
          >
            <NavIcon name="plus" size={18} />
            Add expense
          </button>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {quickActions
              .filter((a) => a.id !== "expense")
              .map((a) => (
                <button
                  key={a.id}
                  type="button"
                  data-testid={`quick-${a.id}`}
                  onClick={() => startAction(a.id)}
                  className="min-h-10 rounded-lg border border-paper-line bg-white px-2 text-xs font-semibold text-ink hover:border-ink/25"
                >
                  {a.label}
                </button>
              ))}
          </div>
        </div>

        <p className="mt-6 hidden px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted lg:block">
          Pages
        </p>
        <ul className="mx-auto grid max-w-xl grid-cols-6 lg:mx-0 lg:mt-1 lg:max-w-none lg:grid-cols-1 lg:gap-0.5">
          {PRIMARY_TABS.slice(0, 2).map(renderTab)}
          {/* Phones: the add button sits in the middle of the tab bar. */}
          <li className="flex min-w-0 items-center justify-center lg:hidden">
            <button
              type="button"
              onClick={() => setAddMenuOpen(true)}
              aria-haspopup="dialog"
              data-testid="tab-add"
              className="flex size-12 flex-col items-center justify-center rounded-full bg-ink text-paper shadow-md"
            >
              <NavIcon name="plus" size={22} />
              <span className="sr-only">Add</span>
            </button>
          </li>
          {PRIMARY_TABS.slice(2).map(renderTab)}
          <li className="min-w-0 lg:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              data-testid="tab-more"
              className={`${navItem(menuActive || menuOpen)} min-h-14 flex-col justify-center gap-0.5 px-0.5 text-xs sm:text-sm`}
            >
              <NavIcon name="more" />
              <span className={menuActive || menuOpen ? "underline decoration-2 underline-offset-4" : ""}>
                More
              </span>
            </button>
          </li>
        </ul>

        <p className="mt-6 hidden px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted lg:block">
          Plan &amp; setup
        </p>
        <ul className="mt-1 hidden space-y-0.5 lg:block">
          <li>
            <button
              type="button"
              onClick={() => goTab("save")}
              aria-current={tab === "save" ? "page" : undefined}
              className={`${navItem(tab === "save")} min-h-10 gap-3 px-3 text-sm`}
            >
              <NavIcon name="savings" />
              Savings
            </button>
          </li>
          {MENU_SETUP.map((item) => {
            const active = tab === "more" && moreFocus === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openMore(item.id)}
                  aria-current={active ? "page" : undefined}
                  className={`${navItem(active)} min-h-10 gap-3 px-3 text-sm`}
                >
                  <NavIcon name={item.icon} />
                  <span className="truncate">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-auto hidden pt-6 lg:block">
          <button
            type="button"
            onClick={() => setManualOpen(true)}
            className={`${navItem(false)} min-h-10 gap-3 px-3 text-sm`}
          >
            <NavIcon name="help" />
            Manual
          </button>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
        <header className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-deep lg:hidden">
              {APP_NAME}
              {justSaved ? (
                <span className="ml-2 font-medium normal-case tracking-normal text-ok">
                  saved
                </span>
              ) : null}
            </p>
            <h1 className="font-display text-2xl font-semibold tracking-tight lg:text-3xl">
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
                  className="mt-1 block min-h-11 rounded-lg border border-paper-line bg-white px-2 text-sm text-ink"
                />
                <span className="sr-only">{monthLabel(month)}</span>
              </label>
            ) : null}
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              aria-label="Help for this page"
              className="flex min-h-11 items-center gap-1.5 rounded-full border border-paper-line bg-white px-3 text-sm font-semibold text-ink hover:border-ink/25"
            >
              <NavIcon name="help" size={18} />
              <span className="hidden sm:inline">Help</span>
            </button>
          </div>
        </header>

        <main className="mt-5 lg:mt-6">
          {tab === "home" ? (
            <HomeView
              onOpenMore={openMore}
              onOpenBudget={() => setTab("budget")}
              onOpenLedger={() => setTab("ledger")}
              onOpenUtang={() => setTab("utang")}
            />
          ) : null}
          {tab === "ledger" ? (
            <Ledger
              onManageParticulars={() => openMore("particulars")}
              onManageCategories={() => openMore("budget")}
              onAddLoan={() => setAction("loan")}
              onAddBorrowed={openBorrowed}
            />
          ) : null}
          {tab === "save" ? <SaveView /> : null}
          {tab === "utang" ? <UtangView /> : null}
          {tab === "budget" ? (
            <BudgetTabView
              startWithForm={pendingBudgetForm}
              onStartConsumed={consumeBudgetForm}
            />
          ) : null}
          {tab === "more" ? (
            <MoreView
              focusTab={moreFocus}
              onOpenManual={() => setManualOpen(true)}
              onReplayTour={() => setTourSession((n) => n + 1)}
            />
          ) : null}
        </main>
      </div>

      <Modal open={addMenuOpen} title="Add" onClose={() => setAddMenuOpen(false)}>
        <ul className="space-y-2">
          {quickActions.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => startAction(a.id)}
                data-testid={`add-menu-${a.id}`}
                className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-paper-line bg-white px-4 py-3 text-left hover:border-ink/25"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-paper-soft text-ink">
                  <NavIcon name={a.icon} size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-semibold text-ink">{a.label}</span>
                  <span className="block text-sm text-ink-muted">{a.hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      <Modal open={menuOpen} title="More" onClose={() => setMenuOpen(false)}>
        <ul className="space-y-2">
          <li>
            <MenuButton
              label="Savings"
              hint="Tigum pots & goals"
              icon="savings"
              active={tab === "save"}
              onClick={() => goTab("save")}
            />
          </li>
          {MENU_SETUP.map((item) => (
            <li key={item.id}>
              <MenuButton
                label={item.label}
                hint={item.hint}
                icon={item.icon}
                active={tab === "more" && moreFocus === item.id}
                onClick={() => openMore(item.id)}
              />
            </li>
          ))}
        </ul>
      </Modal>

      <SimpleLogSheet
        key={action ?? "closed"}
        open={action === "expense" || action === "log" || action === "transfer"}
        prefill={
          action === "expense"
            ? { direction: "out" }
            : action === "transfer"
              ? { direction: "transfer" }
              : undefined
        }
        title={
          action === "expense" ? "Add expense" : action === "transfer" ? "Transfer" : undefined
        }
        onAddLoan={() => setAction("loan")}
        onAddBorrowed={openBorrowed}
        onClose={() => setAction(null)}
        onManageParticulars={() => {
          setAction(null);
          openMore("particulars");
        }}
        onManageCategories={() => {
          setAction(null);
          openMore("budget");
        }}
      />
      <AddLoanSheet
        open={action === "loan" || action === "loan-new"}
        initialKind={action === "loan-new" ? "new" : undefined}
        initialAmount={action === "loan-new" ? borrowAmount : undefined}
        onClose={() => setAction(null)}
        onViewLoans={() => {
          setAction(null);
          goTab("utang");
        }}
      />
      <RecordLoanPaymentSheet
        loanId={action === "payment" ? "" : null}
        onClose={() => setAction(null)}
        onAddLoan={() => setAction("loan")}
      />

      <PageHelpModal
        open={helpOpen}
        tab={tab}
        onClose={() => setHelpOpen(false)}
      />
      <ManualModal open={manualOpen} onClose={() => setManualOpen(false)} />
      {state.settings.setupComplete ? (
        <WelcomeTour
          key={tourSession}
          startOpen={tourSession > 0 ? true : undefined}
          onNavigate={goTab}
        />
      ) : null}
    </div>
  );
}

function MenuButton({
  label,
  hint,
  icon,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  icon: IconName;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left ${
        active ? "border-gold-deep/40 bg-gold-soft" : "border-paper-line bg-white hover:border-ink/25"
      }`}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-paper-soft text-ink">
        <NavIcon name={icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-ink">{label}</span>
        <span className="mt-0.5 block text-sm text-ink-muted">{hint}</span>
      </span>
      <span className="text-ink-muted" aria-hidden>
        →
      </span>
    </button>
  );
}

function heading(tab: TabId, moreFocus: MoreFocusTab | null): string {
  switch (tab) {
    case "home":
      return "Your money";
    case "ledger":
      return "Activity";
    case "save":
      return "Savings";
    case "utang":
      return "Loans / Utang";
    case "budget":
      return "Budget";
    case "more":
      switch (moreFocus) {
        case "particulars":
          return "Bill & income names";
        case "accounts":
          return "Cash & wallets";
        case "profile":
          return "Profile";
        case "budget":
          return "Income & recurring bills";
        default:
          return "More";
      }
  }
}
