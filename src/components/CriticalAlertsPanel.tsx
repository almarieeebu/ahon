"use client";

import type { AlertAction, FinanceAlert } from "@/lib/alerts";
import { phpSmart } from "@/lib/money";

export function CriticalAlertsPanel({
  alerts,
  onAction,
}: {
  alerts: FinanceAlert[];
  onAction?: (action: AlertAction) => void;
}) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-2xl border border-ok/25 bg-ok/5 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ok">
          Critical alerts
        </p>
        <p className="mt-2 text-base font-semibold text-ink">
          No red flags right now
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          No overdue debts, upcoming housing crunch, or projected shortage
          detected from your books.
        </p>
      </div>
    );
  }

  const critical = alerts.filter((a) => a.severity === "critical").length;

  return (
    <div className="rounded-2xl border border-danger/25 bg-danger/5 px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-danger">
          Critical alerts
        </p>
        <p className="text-sm text-ink-muted">
          {alerts.length} flag{alerts.length === 1 ? "" : "s"}
          {critical > 0 ? ` · ${critical} urgent` : ""}
        </p>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        From your books: overdue, due soon, cash shortage, and debt priority.
      </p>
      <ul className="mt-4 space-y-2">
        {alerts.map((alert) => (
          <li
            key={alert.id}
            className={`rounded-xl border bg-white/90 px-3 py-3 ${
              alert.severity === "critical"
                ? "border-danger/30"
                : alert.severity === "warn"
                  ? "border-gold-deep/30"
                  : "border-paper-line"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className={`text-sm font-semibold ${
                    alert.severity === "critical"
                      ? "text-danger"
                      : alert.severity === "warn"
                        ? "text-gold-deep"
                        : "text-ink"
                  }`}
                >
                  {alert.title}
                </p>
                <p className="mt-0.5 text-sm text-ink-muted">{alert.detail}</p>
              </div>
              {alert.amount != null && alert.amount > 0 ? (
                <p className="shrink-0 font-display text-base font-semibold text-ink">
                  {phpSmart(alert.amount)}
                </p>
              ) : null}
            </div>
            {alert.action && onAction ? (
              <button
                type="button"
                onClick={() => onAction(alert.action!)}
                className="mt-2 text-sm font-semibold text-ink underline-offset-2 hover:underline"
              >
                {actionLabel(alert.action)} →
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function actionLabel(action: AlertAction): string {
  switch (action) {
    case "utang":
      return "Open Utang";
    case "budget":
      return "Open Plan";
    case "ledger":
      return "Open Log";
  }
}
