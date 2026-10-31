"use client";

import { useMemo, useState } from "react";
import { AddLoanSheet } from "@/components/AddLoanSheet";
import { AffordThisMonthCard } from "@/components/AffordThisMonthCard";
import { CriticalAlertsPanel } from "@/components/CriticalAlertsPanel";
import { MoneyNeededCard } from "@/components/MoneyNeededCard";
import { QuickStartWizard, loadSetupDraft } from "@/components/QuickStartWizard";
import { SimpleLogSheet } from "@/components/SimpleLogSheet";
import { WalletPanel } from "@/components/AccountsPanel";
import {
  GettingStarted,
  isFreshBooks,
} from "@/components/GettingStarted";
import type { MoreFocusTab } from "@/components/MoreView";
import { OverviewDashboard } from "@/components/YearBudgetDashboard";
import { useFinance } from "@/context/FinanceContext";
import { monthAffordability } from "@/lib/affordability";
import { buildFinanceAlerts, type AlertAction } from "@/lib/alerts";
import { moneyNeededBeforePayday } from "@/lib/cashPlan";
import { monthKey, phpSmart, todayIso } from "@/lib/money";
import {
  availableBudgetMonths,
  availableBudgetYears,
  monthChipLabel,
  summarizeMonthOverview,
  summarizeYearBudget,
} from "@/lib/periodBudget";
import {
  dismissPrompt,
  hasSeenRitual,
  lineActionLabel,
  loadPromptDismissals,
  markRitualSeen,
  monthStatusSentence,
  pickDailyPrompt,
  unpaidPlanLines,
  type DailyPrompt,
} from "@/lib/simpleLog";
import {
  byKind,
  incompleteBalanceAccounts,
  netWorth,
  sumKind,
} from "@/lib/selectors";
import type { BudgetLine } from "@/lib/types";

type OverviewTab = "yearly" | "monthly";

type LogPrefill = {
  direction?: "in" | "out";
  chipId?: string;
  particularId?: string;
};

type Props = {
  onOpenMore: (focus: MoreFocusTab) => void;
  onOpenBudget: () => void;
  onOpenLedger: () => void;
  onOpenUtang: () => void;
};

export function HomeView({
  onOpenMore,
  onOpenBudget,
  onOpenLedger,
  onOpenUtang,
}: Props) {
  const {
    state,
    balances,
    month,
    syncMode,
    cloudError,
    payPlanLine,
    updateState,
  } = useFinance();
  const fresh = isFreshBooks(state);
  const cash = sumKind(state, balances, "cash");
  const tigum = sumKind(state, balances, "savings");
  const utang = sumKind(state, balances, "liability");
  const worth = netWorth(state, balances);
  const banks = byKind(state, "cash");
  const activeMonth = month || monthKey();
  const today = todayIso();
  const afford = useMemo(
    () => monthAffordability(state, activeMonth, cash),
    [state, activeMonth, cash],
  );
  const alerts = useMemo(
    () => buildFinanceAlerts(state, { monthKey: activeMonth }),
    [state, activeMonth],
  );
  const beforePayday = useMemo(
    () => moneyNeededBeforePayday(state, cash, today),
    [state, cash, today],
  );
  const status = useMemo(
    () => monthStatusSentence(state, activeMonth, today),
    [state, activeMonth, today],
  );
  const payLines = useMemo(
    () => unpaidPlanLines(state, activeMonth),
    [state, activeMonth],
  );

  const years = useMemo(
    () => availableBudgetYears(state.budgetPeriods),
    [state.budgetPeriods],
  );
  const months = useMemo(
    () => availableBudgetMonths(state.budgetPeriods, state.budgetLines),
    [state.budgetPeriods, state.budgetLines],
  );

  const [tab, setTab] = useState<OverviewTab>("yearly");
  const [yearChoice, setYear] = useState(years[0] ?? new Date().getFullYear());
  const [monthChoice, setSelectedMonth] = useState(
    month || months[0] || monthKey(),
  );
  const [logOpen, setLogOpen] = useState(false);
  const [logPrefill, setLogPrefill] = useState<LogPrefill | undefined>();
  const [logTitle, setLogTitle] = useState<string | undefined>();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [addLoanOpen, setAddLoanOpen] = useState(false);
  // Set when Add loan was opened from "Borrowed (utang)" in Log money.
  const [borrowed, setBorrowed] = useState<{ amount: string } | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  // Read when the first-use card renders; a skipped setup leaves a draft.
  const [hasDraft, setHasDraft] = useState(() => loadSetupDraft() != null);
  // The app shell only renders on the client, so storage is readable here.
  const [dismissed, setDismissed] = useState<string[]>(() =>
    loadPromptDismissals(today),
  );
  const [showRitual, setShowRitual] = useState(() => !hasSeenRitual());

  // Follow the header month when it changes (adjust state during render).
  const [lastMonth, setLastMonth] = useState(month);
  if (month !== lastMonth) {
    setLastMonth(month);
    if (months.includes(month)) setSelectedMonth(month);
  }
  const year = years.includes(yearChoice) || !years[0] ? yearChoice : years[0];
  const selectedMonth =
    months.includes(monthChoice) || !months[0] ? monthChoice : months[0];

  const prompt = useMemo(
    () =>
      pickDailyPrompt(state, {
        today,
        dismissedIds: dismissed,
      }),
    [state, today, dismissed],
  );

  function openLog(prefill?: LogPrefill, title?: string) {
    setLogPrefill(prefill);
    setLogTitle(title);
    setLogOpen(true);
  }

  function openAddExpense() {
    openLog({ direction: "out" }, "Add expense");
  }

  function onAlertAction(action: AlertAction) {
    if (action === "utang") onOpenUtang();
    else if (action === "budget") onOpenBudget();
    else onOpenLedger();
  }

  function skipPrompt(id: string) {
    setDismissed(dismissPrompt(id, today));
  }

  const firstUse = !state.settings.setupComplete;
  const hasRecords =
    state.transactions.length > 0 || byKind(state, "liability").length > 0;
  const incomplete = incompleteBalanceAccounts(state);

  if (wizardOpen) {
    return (
      <QuickStartWizard
        onSkip={() => {
          setHasDraft(true);
          setWizardOpen(false);
        }}
        onFinished={({ offerLog }) => {
          setHasDraft(false);
          setWizardOpen(false);
          // Opens once Home renders; no category is preselected.
          if (offerLog) openAddExpense();
        }}
      />
    );
  }

  if (fresh && !firstUse) {
    return (
      <section className="space-y-6">
        <GettingStarted
          onOpenMore={onOpenMore}
          onOpenBudget={onOpenBudget}
          onOpenLedger={onOpenLedger}
        />
      </section>
    );
  }

  return (
    <section className="space-y-5">
      {firstUse ? (
        <FirstUseCard
          hasDraft={hasDraft}
          cashIncomplete={incomplete.length > 0}
          onAddExpense={openAddExpense}
          onAddLoan={() => setAddLoanOpen(true)}
          onSetBudget={onOpenBudget}
          onSetup={() => setWizardOpen(true)}
          onDismiss={() =>
            updateState((current) => ({
              ...current,
              settings: { ...current.settings, setupComplete: true },
            }))
          }
        />
      ) : null}

      {!firstUse || hasRecords ? (
        <>
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-5">
        <div
          className={`rounded-2xl border p-5 ${
            status.tone === "need"
              ? "border-danger/35 bg-danger/5"
              : status.tone === "tight"
                ? "border-gold-deep/35 bg-gold-deep/5"
                : "border-ok/30 bg-ok/5"
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
            This month
          </p>
          <p
            className={`mt-2 font-display text-xl font-semibold ${
              status.tone === "need"
                ? "text-danger"
                : status.tone === "tight"
                  ? "text-gold-deep"
                  : "text-ink"
            }`}
          >
            {status.sentence}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            Cash left {phpSmart(status.cashLeft)}
            {incomplete.length > 0 ? (
              <span className="ml-1 font-semibold text-gold-deep">
                · incomplete: starting balance not entered for{" "}
                {incomplete.map((a) => a.name).join(", ")}
              </span>
            ) : null}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button
              type="button"
              data-testid="home-add-expense"
              onClick={openAddExpense}
              className="min-h-11 rounded-full bg-ink px-4 text-sm font-semibold text-paper hover:bg-ink/90"
            >
              Add expense
            </button>
            <button
              type="button"
              data-testid="home-log-money"
              onClick={() => openLog()}
              className="min-h-11 rounded-full border border-ink/20 bg-white px-4 text-sm font-semibold text-ink hover:bg-paper-soft"
            >
              Log money
            </button>
            <button
              type="button"
              data-testid="home-add-loan"
              onClick={() => setAddLoanOpen(true)}
              className="col-span-2 min-h-11 rounded-full border border-ink/20 bg-white px-4 text-sm font-semibold text-ink hover:bg-paper-soft sm:col-span-1"
            >
              Add loan
            </button>
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-2" aria-label="Net position">
          <MiniStat label="Cash" value={phpSmart(cash)} warn={cash < 0} />
          <MiniStat label="Tigum" value={phpSmart(tigum)} />
          <MiniStat label="Utang" value={phpSmart(utang)} warn={utang > 0} />
        </dl>

        {prompt ? (
          <TodayPromptCard
            prompt={prompt}
            onLog={openLog}
            onPay={(line) => payPlanLine(line.id)}
            onSkip={() => skipPrompt(prompt.id)}
          />
        ) : null}

        {payLines.length > 0 ? (
          <PayPlanList
            lines={payLines}
            onPay={(line) => payPlanLine(line.id)}
          />
        ) : null}

        <CriticalAlertsPanel alerts={alerts} onAction={onAlertAction} />

        {showRitual ? (
          <WeeklyRitualCard
            onDismiss={() => {
              markRitualSeen();
              setShowRitual(false);
            }}
          />
        ) : null}
        </div>

        <div className="min-w-0 space-y-5">
        <AffordThisMonthCard snap={afford} onLog={() => openLog()} />
        <MoneyNeededCard
          plan={beforePayday}
          onOpenSetup={() => onOpenMore("budget")}
          onPayBill={(lineId) => payPlanLine(lineId)}
        />

        {banks.length > 0 ? (
          <div className="rounded-2xl border border-paper-line bg-white/80 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-display text-base font-semibold">Wallets</h2>
              <p className="text-sm text-ink-muted">
                Net position{" "}
                <span className={`font-semibold ${worth < 0 ? "text-danger" : "text-ink"}`}>
                  {phpSmart(worth)}
                </span>
              </p>
            </div>
            <ul className="mt-3 divide-y divide-paper-line rounded-xl border border-paper-line bg-white">
              {banks.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => setWalletId(a.id)}
                    data-testid="home-wallet"
                    className="flex min-h-11 w-full items-baseline justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-paper-soft/70"
                  >
                    <span className="min-w-0 truncate">{a.name}</span>
                    <span className="shrink-0 font-display font-semibold">
                      {phpSmart(balances[a.id] ?? 0)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-muted">
              Cash + tigum minus remaining utang. Tap a wallet to fix its balance.
            </p>
          </div>
        ) : null}

        <p className="text-xs text-ink-muted">
          Sync:{" "}
          <span className="font-semibold text-ink">
            {syncMode === "cloud" ? "Cloud (Supabase)" : "This device only"}
          </span>
          {cloudError ? (
            <span className="ml-2 text-danger" role="alert">
              · {cloudError}
            </span>
          ) : null}
        </p>
        </div>
        </div>

        <button
          type="button"
          onClick={() => setDetailsOpen((value) => !value)}
          aria-expanded={detailsOpen}
          className="flex min-h-11 w-full items-center justify-between rounded-2xl border border-paper-line bg-white/70 px-4 py-3 text-left text-sm font-semibold text-ink hover:bg-white"
        >
          {detailsOpen ? "Hide income & spending overview" : "Income & spending overview"}
          <span aria-hidden>{detailsOpen ? "−" : "+"}</span>
        </button>

        {detailsOpen ? (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { id: "yearly", label: "Yearly" },
                    { id: "monthly", label: "Monthly" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                      tab === item.id
                        ? "bg-ink text-paper"
                        : "border border-paper-line bg-white/70 text-ink-muted"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {tab === "yearly" ? (
                <div className="space-y-3">
                  {years.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {years.map((y) => {
                        const snap = summarizeYearBudget(state, y);
                        const active = y === year;
                        return (
                          <button
                            key={y}
                            type="button"
                            onClick={() => setYear(y)}
                            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                              active
                                ? "border-ink bg-ink text-paper"
                                : "border-paper-line bg-white/70 text-ink"
                            }`}
                          >
                            {y}
                            <span
                              className={`ml-2 text-[11px] font-medium ${active ? "text-paper/70" : "text-ink-muted"}`}
                            >
                              {phpSmart(snap.income)} / {phpSmart(snap.expense)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <OverviewDashboard scope="year" year={year} />
                </div>
              ) : (
                <div className="space-y-3">
                  {months.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {months.map((key) => {
                        const snap = summarizeMonthOverview(state, key);
                        const active = key === selectedMonth;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setSelectedMonth(key)}
                            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                              active
                                ? "border-ink bg-ink text-paper"
                                : "border-paper-line bg-white/70 text-ink"
                            }`}
                          >
                            {monthChipLabel(key)}
                            <span
                              className={`ml-2 text-[11px] font-medium ${active ? "text-paper/70" : "text-ink-muted"}`}
                            >
                              {phpSmart(snap.income)} / {phpSmart(snap.expense)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <OverviewDashboard scope="month" monthKey={selectedMonth} />
                </div>
              )}
            </div>

          </div>
        ) : null}
        </>
      ) : null}

      <WalletPanel walletId={walletId} onClose={() => setWalletId(null)} />

      <AddLoanSheet
        open={addLoanOpen}
        initialKind={borrowed ? "new" : undefined}
        initialAmount={borrowed?.amount}
        onClose={() => {
          setAddLoanOpen(false);
          setBorrowed(null);
        }}
        onViewLoans={onOpenUtang}
      />

      <SimpleLogSheet
        open={logOpen}
        prefill={logPrefill}
        title={logTitle}
        onAddLoan={onOpenUtang}
        onAddBorrowed={(amount) => {
          setBorrowed({ amount });
          setAddLoanOpen(true);
        }}
        onClose={() => {
          setLogOpen(false);
          setLogPrefill(undefined);
          setLogTitle(undefined);
        }}
        onManageParticulars={() => onOpenMore("particulars")}
        onManageCategories={() => onOpenMore("budget")}
      />
    </section>
  );
}

function MiniStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-paper-line bg-white/80 px-3 py-2.5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className={`mt-0.5 truncate font-display text-base font-semibold sm:text-lg ${warn ? "text-danger" : "text-ink"}`}>
        {value}
      </dd>
    </div>
  );
}

function FirstUseCard({
  hasDraft,
  cashIncomplete,
  onAddExpense,
  onAddLoan,
  onSetBudget,
  onSetup,
  onDismiss,
}: {
  hasDraft: boolean;
  cashIncomplete: boolean;
  onAddExpense: () => void;
  onAddLoan: () => void;
  onSetBudget: () => void;
  onSetup: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="rounded-2xl border border-paper-line bg-white/80 p-5"
      data-testid="first-use"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-deep">
        Start here
      </p>
      <h2 className="mt-2 font-display text-xl font-semibold tracking-tight">
        What do you want to do first?
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        No setup needed. Pick one; you can do the rest later.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          data-testid="first-add-expense"
          onClick={onAddExpense}
          className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper"
        >
          Add expense
        </button>
        <button
          type="button"
          data-testid="first-add-loan"
          onClick={onAddLoan}
          className="rounded-full border border-ink/20 bg-white px-5 py-3 text-sm font-semibold text-ink"
        >
          Add loan
        </button>
        <button
          type="button"
          data-testid="first-set-budget"
          onClick={onSetBudget}
          className="rounded-full border border-ink/20 bg-white px-5 py-3 text-sm font-semibold text-ink"
        >
          Set monthly budget
        </button>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-paper-line pt-3">
        <button
          type="button"
          data-testid="first-setup"
          onClick={onSetup}
          className="text-sm font-semibold text-gold-deep underline-offset-2 hover:underline"
        >
          {hasDraft ? "Continue setting up income and wallets" : "Set up income and wallets (optional)"}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs font-semibold text-ink-muted underline-offset-2 hover:underline"
        >
          Hide this
        </button>
      </div>
      {cashIncomplete ? (
        <p className="mt-3 text-xs text-ink-muted">
          Cash on hand: starting balance not entered yet, so totals are
          incomplete (not ₱0). Add it any time under More → Cash &amp; wallets.
        </p>
      ) : null}
    </div>
  );
}

function TodayPromptCard({
  prompt,
  onLog,
  onPay,
  onSkip,
}: {
  prompt: DailyPrompt;
  onLog: (prefill?: LogPrefill) => void;
  onPay: (line: BudgetLine) => void;
  onSkip: () => void;
}) {
  const copy = promptCopy(prompt);
  return (
    <div className="rounded-2xl border border-paper-line bg-white/80 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-deep">
        Today
      </p>
      <p className="mt-2 text-base font-semibold text-ink">{copy.title}</p>
      <p className="mt-1 text-sm text-ink-muted">{copy.body}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            if (prompt.kind === "bill") onPay(prompt.line);
            else if (prompt.kind === "payday") onLog({ direction: "in", chipId: "paycheck" });
            else if (prompt.kind === "catchup") onLog({ direction: "out", chipId: "food" });
            else onLog({ direction: "out" });
          }}
          className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper"
        >
          {copy.cta}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="rounded-full border border-paper-line px-4 py-2 text-sm font-semibold text-ink-muted"
        >
          {prompt.kind === "gastos" ? "Not today" : "Not now"}
        </button>
      </div>
    </div>
  );
}

function promptCopy(prompt: DailyPrompt): { title: string; body: string; cta: string } {
  switch (prompt.kind) {
    case "first-log":
      return {
        title: "Want to log something that already happened today?",
        body: "One amount is enough. You do not need to catch up on every peso.",
        cta: "Log today",
      };
    case "payday":
      return {
        title: "Did your sweldo arrive?",
        body: "Tap to log what reached you. Approximate is fine.",
        cta: "Money in",
      };
    case "bill":
      return {
        title: `Did you pay ${prompt.line.particular || "this bill"}?`,
        body: "If yes, Ahon will log it and mark the plan paid.",
        cta: "I paid this",
      };
    case "catchup":
      return {
        title: "Log this week’s groceries in one amount",
        body: "A weekly total is enough. You do not need every trip.",
        cta: "Log food",
      };
    case "gastos":
      return {
        title: "Any gastos today?",
        body: "If you spent, add one amount. If not, that’s fine.",
        cta: "Yes, log it",
      };
  }
}

function WeeklyRitualCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="rounded-2xl border border-paper-line bg-white/80 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-deep">
        Weekly habit
      </p>
      <h2 className="mt-2 font-display text-lg font-semibold">Four small steps</h2>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink">
        <li>When paid — Money in.</li>
        <li>When a bill is paid — I paid this.</li>
        <li>When cash is spent — amount + chip.</li>
        <li>Once a week, read the green or gold sentence on Home.</li>
      </ol>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-4 text-sm font-semibold text-ink underline-offset-2 hover:underline"
      >
        Got it
      </button>
    </div>
  );
}

function PayPlanList({
  lines,
  onPay,
}: {
  lines: BudgetLine[];
  onPay: (line: BudgetLine) => void;
}) {
  return (
    <div className="rounded-2xl border border-paper-line bg-white/80 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
        Pay first
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        Tap when it actually happened. Approximate is fine.
      </p>
      <ul className="mt-3 space-y-2">
        {lines.map((line) => (
          <li
            key={line.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-paper-line bg-white px-3 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">
                {line.particular || "Plan line"}
              </p>
              <p className="text-xs text-ink-muted">
                {line.due ? `Due ${line.due}` : "No due date"} ·{" "}
                {phpSmart((line.income || 0) > 0 ? line.income : line.expense)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onPay(line)}
              className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-paper"
            >
              {lineActionLabel(line)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
