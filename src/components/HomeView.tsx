"use client";

import { useEffect, useMemo, useState } from "react";
import {
  GettingStarted,
  isFreshBooks,
} from "@/components/GettingStarted";
import type { MoreFocusTab } from "@/components/MoreView";
import { OverviewDashboard } from "@/components/YearBudgetDashboard";
import { useFinance } from "@/context/FinanceContext";
import { monthKey, phpSmart } from "@/lib/money";
import {
  availableBudgetMonths,
  availableBudgetYears,
  monthChipLabel,
  summarizeMonthOverview,
  summarizeYearBudget,
} from "@/lib/periodBudget";
import { byKind, netWorth, sumKind } from "@/lib/selectors";

type OverviewTab = "yearly" | "monthly";

type Props = {
  onOpenMore: (focus: MoreFocusTab) => void;
  onOpenBudget: () => void;
  onOpenLedger: () => void;
};

export function HomeView({ onOpenMore, onOpenBudget, onOpenLedger }: Props) {
  const { state, balances, month } = useFinance();
  const fresh = isFreshBooks(state);
  const cash = sumKind(state, balances, "cash");
  const tigum = sumKind(state, balances, "savings");
  const utang = sumKind(state, balances, "liability");
  const worth = netWorth(state, balances);
  const banks = byKind(state, "cash");

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
      <div className="rounded-2xl border border-paper-line bg-white/70 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-deep">
          Net position
        </p>
        <p
          className={`mt-2 font-display text-4xl font-semibold tracking-tight ${worth < 0 ? "text-danger" : "text-ink"}`}
        >
          {phpSmart(worth)}
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          Cash + tigum minus remaining utang.
        </p>
      </div>

      <dl className="grid grid-cols-3 gap-2">
        <Stat label="Cash" value={phpSmart(cash)} warn={cash < 0} />
        <Stat label="Tigum" value={phpSmart(tigum)} />
        <Stat label="Utang left" value={phpSmart(utang)} warn={utang > 0} />
      </dl>

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
    </section>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl border border-paper-line bg-white/50 px-3 py-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </dt>
      <dd
        className={`mt-1 font-display text-base font-semibold sm:text-lg ${warn ? "text-danger" : "text-ink"}`}
      >
        {value}
      </dd>
    </div>
  );
}
