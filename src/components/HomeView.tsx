"use client";

import { useEffect, useMemo, useState } from "react";
import { AffordThisMonthCard } from "@/components/AffordThisMonthCard";
import { CriticalAlertsPanel } from "@/components/CriticalAlertsPanel";
import { MoneyNeededCard } from "@/components/MoneyNeededCard";
import { QuickStartWizard } from "@/components/QuickStartWizard";
import { SimpleLogSheet } from "@/components/SimpleLogSheet";
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
import { byKind, netWorth, sumKind } from "@/lib/selectors";
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
  const { state, balances, month, syncMode, cloudError, payPlanLine } =
    useFinance();
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
  const [year, setYear] = useState(years[0] ?? new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(
    month || months[0] || monthKey(),
  );
  const [logOpen, setLogOpen] = useState(false);
  const [logPrefill, setLogPrefill] = useState<LogPrefill | undefined>();
  const [offerFirstLog, setOfferFirstLog] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [showRitual, setShowRitual] = useState(false);

  useEffect(() => {
    setDismissed(loadPromptDismissals(today));
    setShowRitual(!hasSeenRitual());
  }, [today]);

  useEffect(() => {
    if (!years.includes(year) && years[0]) setYear(years[0]);
  }, [years, year]);

  useEffect(() => {
    if (months.includes(month)) setSelectedMonth(month);
  }, [month, months]);

  useEffect(() => {
    if (!months.includes(selectedMonth) && months[0]) {
      setSelectedMonth(months[0]);
    }
  }, [months, selectedMonth]);

  useEffect(() => {
    if (state.settings.setupComplete && offerFirstLog) {
      setLogPrefill({ direction: "out", chipId: "food" });
      setLogOpen(true);
      setOfferFirstLog(false);
    }
  }, [state.settings.setupComplete, offerFirstLog]);

  const prompt = useMemo(
    () =>
      pickDailyPrompt(state, {
        today,
        dismissedIds: dismissed,
      }),
    [state, today, dismissed],
  );

  function openLog(prefill?: LogPrefill) {
    setLogPrefill(prefill);
    setLogOpen(true);
  }

  function onAlertAction(action: AlertAction) {
    if (action === "utang") onOpenUtang();
    else if (action === "budget") onOpenBudget();
    else onOpenLedger();
  }

  function skipPrompt(id: string) {
    setDismissed(dismissPrompt(id, today));
  }

  if (!state.settings.setupComplete) {
    return (
      <QuickStartWizard
        onFinished={({ offerLog }) => {
          if (offerLog) setOfferFirstLog(true);
        }}
      />
    );
  }

  if (fresh) {
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
    <section className="space-y-6">
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
        </p>
        <button
          type="button"
          data-testid="home-log-money"
          onClick={() => openLog()}
          className="mt-4 w-full rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper"
        >
          Log money
        </button>
      </div>

      {prompt ? (
        <TodayPromptCard
          prompt={prompt}
          onLog={openLog}
          onPay={(line) => payPlanLine(line.id)}
          onSkip={() => skipPrompt(prompt.id)}
        />
      ) : null}

      {showRitual ? (
        <WeeklyRitualCard
          onDismiss={() => {
            markRitualSeen();
            setShowRitual(false);
          }}
        />
      ) : null}

      {payLines.length > 0 ? (
        <PayPlanList
          lines={payLines}
          onPay={(line) => payPlanLine(line.id)}
        />
      ) : null}

      <AffordThisMonthCard snap={afford} onLog={() => openLog()} />
      <MoneyNeededCard
        plan={beforePayday}
        onOpenSetup={() => onOpenMore("budget")}
        onPayBill={(lineId) => payPlanLine(lineId)}
      />
      <CriticalAlertsPanel alerts={alerts} onAction={onAlertAction} />

      <button
        type="button"
        onClick={() => setDetailsOpen((value) => !value)}
        className="w-full rounded-2xl border border-paper-line bg-white/70 px-4 py-3 text-left text-sm font-semibold text-ink"
      >
        {detailsOpen ? "Hide more on this month" : "More on this month"}
      </button>

      {detailsOpen ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-paper-line bg-white/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-deep">
              Net position
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Cash</dt>
                <dd className={`font-semibold ${cash < 0 ? "text-danger" : "text-ink"}`}>
                  {phpSmart(cash)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Tigum</dt>
                <dd className="font-semibold text-ink">{phpSmart(tigum)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Utang</dt>
                <dd className={`font-semibold ${utang > 0 ? "text-danger" : "text-ink"}`}>
                  {phpSmart(utang)}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-paper-line pt-2">
                <dt className="font-medium text-ink">Net position</dt>
                <dd
                  className={`font-display text-xl font-semibold ${worth < 0 ? "text-danger" : "text-ink"}`}
                >
                  {phpSmart(worth)}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-sm text-ink-muted">
              Cash + tigum minus remaining utang.
            </p>
          </div>

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

          {banks.length > 0 ? (
            <div>
              <h2 className="font-display text-lg font-semibold">Accounts</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {banks.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-baseline justify-between rounded-xl border border-paper-line bg-white/60 px-3 py-2 text-sm"
                  >
                    <span>{a.name}</span>
                    <span className="font-display font-semibold">
                      {phpSmart(balances[a.id] ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <SimpleLogSheet
        open={logOpen}
        prefill={logPrefill}
        onClose={() => {
          setLogOpen(false);
          setLogPrefill(undefined);
        }}
        onManageParticulars={() => onOpenMore("particulars")}
        onManageCategories={() => onOpenMore("budget")}
      />
    </section>
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
            else onLog({ direction: "out", chipId: "food" });
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
