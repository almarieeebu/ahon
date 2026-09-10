"use client";

import { monthChipLabel } from "@/lib/periodBudget";
import {
  SURVIVAL_PRIORITY,
  type MonthAffordability,
} from "@/lib/affordability";
import { phpSmart } from "@/lib/money";

export function AffordThisMonthCard({
  snap,
  onLog,
}: {
  snap: MonthAffordability;
  onLog?: () => void;
}) {
  const emptyPlan = snap.income <= 0 && snap.obligations <= 0;
  const deficit = snap.gap < 0;

  const tone = emptyPlan
    ? "border-paper-line bg-white/70"
    : deficit
      ? "border-danger/35 bg-danger/5"
      : snap.verdict === "tight"
        ? "border-gold-deep/35 bg-gold-deep/5"
        : "border-ok/30 bg-ok/5";

  return (
    <div className={`rounded-2xl border p-5 ${tone}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
        Monthly survival
      </p>

      {emptyPlan ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-ink-muted">
            Add usual bills in Quick start or log money — then Ahon can show if you cover this month.
          </p>
          {onLog ? (
            <button
              type="button"
              onClick={onLog}
              className="text-sm font-semibold text-ink underline-offset-2 hover:underline"
            >
              Log money →
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Income" value={phpSmart(snap.income)} />
            <Row
              label="Essential expenses"
              value={phpSmart(snap.essentialExpenses)}
            />
            <Row label="Debt payments" value={phpSmart(snap.debtPayments)} />
            <div className="border-t border-paper-line/80 pt-2">
              <Row
                label="Monthly gap"
                value={phpSmart(snap.gap)}
                warn={deficit}
                strong
              />
            </div>
          </dl>

          {deficit ? (
            <p className="mt-4 rounded-xl border border-danger/25 bg-white/80 px-3 py-2.5 text-sm font-semibold text-danger">
              Monthly deficit — you need {phpSmart(Math.abs(snap.gap))} more
              this month ({monthChipLabel(snap.monthKey)}).
            </p>
          ) : snap.verdict === "tight" ? (
            <p className="mt-4 text-sm font-semibold text-gold-deep">
              Tight month — little room after essentials and debt.
            </p>
          ) : (
            <p className="mt-4 text-sm font-semibold text-ok">
              Income covers essentials and debt dues this month.
            </p>
          )}
        </>
      )}

      {snap.debtDues.length > 0 ? (
        <div className="mt-4 border-t border-paper-line/80 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Debt dues this month
          </p>
          <ul className="mt-2 space-y-1.5">
            {snap.debtDues.map((d) => (
              <li
                key={d.id}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span>
                  <span className="font-medium text-ink">{d.name}</span>
                  <span className="ml-2 text-ink-muted">{d.label}</span>
                </span>
                <span className="shrink-0 font-semibold">
                  {phpSmart(d.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {snap.survivalMode ? (
        <div className="mt-5 border-t border-danger/20 pt-4">
          <p className="text-sm font-semibold text-danger">
            Financial Survival Mode
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            Pay in this order — pause non-essentials.
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink">
            {SURVIVAL_PRIORITY.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  warn,
  strong,
}: {
  label: string;
  value: string;
  warn?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd
        className={`font-display ${strong ? "text-lg font-semibold" : "text-base font-semibold"} ${
          warn ? "text-danger" : "text-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
