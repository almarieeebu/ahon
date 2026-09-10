"use client";

import type { BeforePaydayPlan } from "@/lib/cashPlan";
import { phpSmart } from "@/lib/money";

export function MoneyNeededCard({
  plan,
  onOpenSetup,
  onPayBill,
}: {
  plan: BeforePaydayPlan;
  onOpenSetup: () => void;
  onPayBill?: (lineId: string) => void;
}) {
  const hasNeeds = plan.bills > 0 || plan.debtMinimums > 0 || plan.reserve > 0;
  const tone = plan.shortfall > 0 ? "border-danger/35 bg-danger/5" : "border-ok/30 bg-ok/5";

  return (
    <div className={`rounded-2xl border p-5 ${tone}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Money needed before next payday
        </p>
        <p className="text-xs text-ink-muted">
          {plan.usesPayday ? `Through ${plan.end}` : "Next 14 days"}
        </p>
      </div>

      {!plan.usesPayday ? (
        <p className="mt-2 text-sm text-ink-muted">
          Add your regular payday days for an exact window. Until then, Ahon protects the next 14 days.
        </p>
      ) : null}

      <dl className="mt-4 space-y-2 text-sm">
        <Row label="Cash available" value={phpSmart(plan.cash)} />
        <Row label="Bills due" value={phpSmart(plan.bills)} />
        <Row label="Debt minimums due" value={phpSmart(plan.debtMinimums)} />
        <Row label="Cash reserve to keep" value={phpSmart(plan.reserve)} />
        <div className="border-t border-paper-line/80 pt-2">
          <Row label="Needed before payday" value={phpSmart(plan.totalNeeded)} strong />
        </div>
      </dl>

      {hasNeeds ? (
        plan.shortfall > 0 ? (
          <p className="mt-4 rounded-xl border border-danger/25 bg-white/80 px-3 py-2.5 text-sm font-semibold text-danger">
            Short by {phpSmart(plan.shortfall)} before payday. Log money in, or wait on extra utang payments.
          </p>
        ) : (
          <p className="mt-4 text-sm font-semibold text-ok">
            Safe to use after these needs: {phpSmart(plan.safeToUse)}.
            {plan.safeToUse > 0 ? " This is the most Ahon will suggest for optional spending or extra debt." : ""}
          </p>
        )
      ) : (
        <p className="mt-4 text-sm text-ink-muted">
          Add due days and planned amounts for bills and debt to protect cash before payday.
        </p>
      )}

      {plan.needs.length > 0 ? (
        <ul className="mt-4 space-y-1.5 border-t border-paper-line/80 pt-4">
          {plan.needs.slice(0, 4).map((need) => {
            const billId = need.id.startsWith("bill:") ? need.id.slice(5) : null;
            return (
              <li key={need.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 text-ink-muted">
                  <span className="font-medium text-ink">{need.name}</span>
                  <span className={need.overdue ? "ml-2 text-danger" : "ml-2"}>
                    {need.overdue ? `Overdue · ${need.due}` : `Due ${need.due}`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-semibold text-ink">{phpSmart(need.amount)}</span>
                  {billId && onPayBill ? (
                    <button
                      type="button"
                      onClick={() => onPayBill(billId)}
                      className="rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-paper"
                    >
                      I paid this
                    </button>
                  ) : null}
                </span>
              </li>
            );
          })}
          {plan.needs.length > 4 ? (
            <li className="text-xs text-ink-muted">+ {plan.needs.length - 4} more due item{plan.needs.length === 5 ? "" : "s"}</li>
          ) : null}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={onOpenSetup}
        className="mt-4 text-sm font-semibold text-ink underline-offset-2 hover:underline"
      >
        Set paydays & reserve →
      </button>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? "font-medium text-ink" : "text-ink-muted"}>{label}</dt>
      <dd className={`font-display ${strong ? "text-lg font-semibold" : "text-base font-semibold"}`}>{value}</dd>
    </div>
  );
}
