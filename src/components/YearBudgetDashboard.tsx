"use client";

import { useMemo } from "react";
import { useFinance } from "@/context/FinanceContext";
import { phpSmart } from "@/lib/money";
import {
  monthChipLabel,
  summarizeMonthOverview,
  summarizeYearBudget,
  type OverviewSummary,
} from "@/lib/periodBudget";

export function OverviewDashboard({
  scope,
  year,
  monthKey,
}: {
  scope: "year" | "month";
  year?: number;
  monthKey?: string;
}) {
  const { state } = useFinance();
  const summary = useMemo((): OverviewSummary => {
    if (scope === "month" && monthKey) {
      return summarizeMonthOverview(state, monthKey);
    }
    return summarizeYearBudget(state, year ?? new Date().getFullYear());
  }, [state, scope, year, monthKey]);

  const title =
    scope === "month" && monthKey
      ? `${monthChipLabel(monthKey)} overview`
      : `${year} overview`;

  const emptyLabel =
    scope === "month" && monthKey
      ? monthChipLabel(monthKey)
      : String(year);

  const netBudget = summary.income - summary.expense;
  const netActual = summary.actualIn - summary.actualOut;
  const spendPct =
    summary.expense > 0
      ? Math.min(
          100,
          Math.round((summary.actualOut / summary.expense) * 100),
        )
      : 0;

  return (
    <div className="space-y-5">
      <header>
        <h2 className="font-display text-xl font-semibold tracking-tight">
          {title}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Budget from period sheet · Actual from ledger · {summary.paid} paid ·{" "}
          {summary.unpaid} unpaid on budget
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat label="Budget in" value={phpSmart(summary.income)} />
        <MiniStat label="Budget out" value={phpSmart(summary.expense)} />
        <MiniStat label="Actual in" value={phpSmart(summary.actualIn)} />
        <MiniStat label="Actual out" value={phpSmart(summary.actualOut)} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <MiniStat
          label="Net budget"
          value={phpSmart(netBudget)}
          warn={netBudget < 0}
        />
        <MiniStat
          label="Net actual"
          value={phpSmart(netActual)}
          warn={netActual < 0}
        />
      </div>

      {summary.expense > 0 ? (
        <div className="rounded-2xl border border-paper-line bg-white/60 px-4 py-3">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-ink-muted">Spend vs budget out</span>
            <span className="font-medium">
              {phpSmart(summary.actualOut)} / {phpSmart(summary.expense)}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper-soft">
            <div
              className={`h-full rounded-full ${spendPct >= 100 ? "bg-danger" : "bg-ok"}`}
              style={{ width: `${spendPct}%` }}
            />
          </div>
        </div>
      ) : null}

      <div>
        <div className="mb-2">
          <h3 className="font-display text-base font-semibold">
            By particular
          </h3>
          <p className="text-xs text-ink-muted">
            Planned amounts from Plan · Actual from Log
          </p>
        </div>

        {summary.byParticular.length === 0 ? (
          <p className="sheet-empty">
            No budget lines or ledger entries for {emptyLabel} yet.
          </p>
        ) : (
          <div className="sheet-wrap sheet-stack">
            <table className="sheet">
              <thead>
                <tr>
                  <th>Particular</th>
                  <th className="num">Budget in</th>
                  <th className="num">Budget out</th>
                  <th className="num">Actual in</th>
                  <th className="num">Actual out</th>
                  <th className="num">Budget lines</th>
                  <th className="num">Log</th>
                </tr>
              </thead>
              <tbody>
                {summary.byParticular.map((row) => (
                  <tr key={row.name}>
                    <td className="font-medium">{row.name}</td>
                    <td className="num">
                      {row.income ? phpSmart(row.income) : "—"}
                    </td>
                    <td className="num">
                      {row.expense ? phpSmart(row.expense) : "—"}
                    </td>
                    <td className="num">
                      {row.actualIn ? phpSmart(row.actualIn) : "—"}
                    </td>
                    <td className="num">
                      {row.actualOut ? phpSmart(row.actualOut) : "—"}
                    </td>
                    <td className="num text-ink-muted">{row.count || "—"}</td>
                    <td className="num text-ink-muted">
                      {row.ledgerCount || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num">{phpSmart(summary.income)}</td>
                  <td className="num">{phpSmart(summary.expense)}</td>
                  <td className="num">{phpSmart(summary.actualIn)}</td>
                  <td className="num">{phpSmart(summary.actualOut)}</td>
                  <td className="num text-ink-muted">
                    {summary.byParticular.reduce((n, r) => n + r.count, 0)}
                  </td>
                  <td className="num text-ink-muted">
                    {summary.byParticular.reduce((n, r) => n + r.ledgerCount, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** @deprecated Prefer OverviewDashboard */
export function YearBudgetDashboard({ year }: { year: number }) {
  return <OverviewDashboard scope="year" year={year} />;
}

function MiniStat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl border border-paper-line bg-white/60 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </p>
      <p
        className={`mt-1 font-display text-base font-semibold ${warn ? "text-danger" : "text-ink"}`}
      >
        {value}
      </p>
    </div>
  );
}
