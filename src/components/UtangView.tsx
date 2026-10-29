"use client";

import { useEffect, useMemo, useState } from "react";
import { AddLoanSheet } from "@/components/AddLoanSheet";
import { RecordLoanPaymentSheet } from "@/components/RecordLoanPaymentSheet";
import { useFinance } from "@/context/FinanceContext";
import { accountIsOverdue } from "@/lib/alerts";
import { phpSmart, todayIso } from "@/lib/money";
import { projectPayoff } from "@/lib/payoff";
import {
  installmentPaidSoFar,
  lastPaid,
  longDate,
  nextUnpaid,
  scheduledRepaymentsLeft,
} from "@/lib/schedule";
import { byKind } from "@/lib/selectors";
import type { Account, LiabilityType } from "@/lib/types";

const TYPES: { id: LiabilityType; label: string }[] = [
  { id: "credit-card", label: "Credit card" },
  { id: "housing", label: "Housing / amortization" },
  { id: "personal", label: "Personal / salary loan" },
  { id: "other", label: "Other utang" },
];

function interestKnown(account: Account): boolean {
  return account.interestKnown !== false;
}

export function UtangView({
  startWithAdd = false,
  onStartConsumed,
}: {
  /** Open Add loan right away (asked for from another page). */
  startWithAdd?: boolean;
  onStartConsumed?: () => void;
}) {
  const {
    state,
    balances,
    upsertAccount,
    setCurrentBalance,
    archiveAccount,
    payInstallment,
    unpayInstallment,
  } = useFinance();
  const banks = byKind(state, "cash");
  const savings = byKind(state, "savings");
  const debts = byKind(state, "liability");
  const payFrom = [...banks, ...savings];
  const revolving = debts.filter((d) => d.mode !== "installment");
  const installments = debts.filter((d) => d.mode === "installment");
  const budget = revolving.reduce((s, d) => s + (d.plannedPayment || 0), 0);
  const unknownRate = revolving.some((d) => !interestKnown(d));

  const projection = projectPayoff(
    revolving.map((d) => ({ ...d, balance: balances[d.id] ?? 0 })),
    budget || 0,
  );

  const [fromId, setFromId] = useState(banks[0]?.id ?? "");
  const [addOpen, setAddOpen] = useState(startWithAdd);
  const [payLoanId, setPayLoanId] = useState<string | null>(null);

  useEffect(() => {
    if (startWithAdd) onStartConsumed?.();
  }, [startWithAdd, onStartConsumed]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-ink-muted">
          Loans and utang you still owe. Add each one, then use Record payment
          on its card when you pay.
        </p>
        <button
          type="button"
          data-testid="loans-add"
          onClick={() => setAddOpen(true)}
          className="rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-paper"
        >
          Add loan
        </button>
      </div>

      {debts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-paper-line px-4 py-8 text-center text-sm text-ink-muted">
          <p>No loans yet.</p>
          <p className="mt-1">
            Add a loan you already owe, or money you just borrowed.
          </p>
        </div>
      ) : null}

      {installments.map((loan) => (
        <InstallmentSheet
          key={loan.id}
          loan={loan}
          remaining={balances[loan.id] ?? 0}
          payFrom={payFrom}
          balances={balances}
          fromId={fromId}
          onFromId={setFromId}
          overdue={accountIsOverdue(state, loan.id)}
          onRecordPayment={() => setPayLoanId(loan.id)}
          onPay={(rowId) => payInstallment(loan.id, rowId, fromId || null)}
          onUnpay={(rowId) => unpayInstallment(loan.id, rowId)}
          onSave={(next) => upsertAccount(next)}
          onArchive={() => {
            if (window.confirm(`Hide ${loan.name} from this list?`)) {
              archiveAccount(loan.id);
            }
          }}
        />
      ))}

      {revolving.map((d) => (
        <RevolvingCard
          key={d.id}
          account={d}
          remaining={balances[d.id] ?? 0}
          overdue={accountIsOverdue(state, d.id)}
          priority={projection.focusId === d.id && !unknownRate}
          onRecordPayment={() => setPayLoanId(d.id)}
          onSave={(next) => upsertAccount(next)}
          onSetRemaining={(amount) => setCurrentBalance(d.id, amount)}
          onArchive={() => {
            if (window.confirm(`Hide ${d.name} from this list?`)) {
              archiveAccount(d.id);
            }
          }}
        />
      ))}

      {revolving.length > 0 && budget > 0 && projection.months > 0 ? (
        <div className="rounded-2xl border border-paper-line bg-white/70 p-4">
          <h3 className="font-display text-base font-semibold">
            If you keep the regular payments
          </h3>
          <p className="mt-2 text-sm text-ink-muted">
            About {projection.months} month
            {projection.months === 1 ? "" : "s"} to clear the loans above
            without a schedule
            {unknownRate
              ? ". Interest is left out for loans where it is not known, so the real time may be longer."
              : `, with roughly ${phpSmart(projection.interest)} interest.`}
            {projection.focusId && !unknownRate
              ? ` Priority focus: ${revolving.find((d) => d.id === projection.focusId)?.name ?? "—"}.`
              : ""}
          </p>
        </div>
      ) : null}

      <AddLoanSheet open={addOpen} onClose={() => setAddOpen(false)} />
      <RecordLoanPaymentSheet
        loanId={payLoanId}
        onClose={() => setPayLoanId(null)}
        onAddLoan={() => {
          setPayLoanId(null);
          setAddOpen(true);
        }}
      />
    </section>
  );
}

function LoanSummary({
  loan,
  owed,
  onRecordPayment,
}: {
  loan: Account;
  owed: number;
  onRecordPayment: () => void;
}) {
  const scheduled = loan.mode === "installment" && (loan.schedule?.length ?? 0) > 0;
  const left = scheduled ? scheduledRepaymentsLeft(loan.schedule) : 0;
  const count = scheduled
    ? (loan.schedule ?? []).filter((r) => r.status !== "paid").length
    : 0;
  const differs = scheduled && Math.abs(left - owed) >= 0.01;
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-ink-muted">Amount owed</dt>
          <dd
            className="font-display text-xl font-semibold text-danger"
            data-testid="loan-owed"
          >
            {phpSmart(owed)}
          </dd>
        </div>
        {scheduled ? (
          <div>
            <dt className="text-xs text-ink-muted">Scheduled payments left</dt>
            <dd className="font-display text-xl font-semibold text-ink">
              {phpSmart(left)}
              <span className="ml-1 text-xs font-normal text-ink-muted">
                ({count} payment{count === 1 ? "" : "s"})
              </span>
            </dd>
          </div>
        ) : loan.plannedPayment > 0 ? (
          <div>
            <dt className="text-xs text-ink-muted">Regular payment</dt>
            <dd className="font-display text-xl font-semibold text-ink">
              {phpSmart(loan.plannedPayment)}
            </dd>
          </div>
        ) : null}
        <div className="col-span-2 text-xs text-ink-muted">
          Interest:{" "}
          <span className="font-semibold text-ink">
            {interestKnown(loan)
              ? `${Math.round(loan.monthlyRate * 1000) / 10}% a month`
              : "not known"}
          </span>
        </div>
      </dl>
      {scheduled ? (
        <p className="text-xs text-ink-muted">
          {differs
            ? `Amount owed is what you told Ahon you owe, less payments. Scheduled payments left adds up the remaining payments on the schedule; the difference is usually interest or fees. `
            : ""}
          Ahon does not split payments into interest and principal: each
          payment you record lowers the amount owed by the full amount.
        </p>
      ) : null}
      <button
        type="button"
        onClick={onRecordPayment}
        data-testid="loan-record-payment"
        aria-label={`Record payment on ${loan.name}`}
        className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper"
      >
        Record payment
      </button>
    </div>
  );
}

function InstallmentSheet({
  loan,
  remaining,
  payFrom,
  balances,
  fromId,
  onFromId,
  overdue,
  onRecordPayment,
  onPay,
  onUnpay,
  onSave,
  onArchive,
}: {
  loan: Account;
  remaining: number;
  payFrom: Account[];
  balances: Record<string, number>;
  fromId: string;
  onFromId: (id: string) => void;
  overdue: boolean;
  onRecordPayment: () => void;
  onPay: (rowId: string) => void;
  onUnpay: (rowId: string) => void;
  onSave: (account: Account) => void;
  onArchive: () => void;
}) {
  const schedule = useMemo(() => loan.schedule ?? [], [loan.schedule]);
  const next = nextUnpaid(schedule);
  const last = lastPaid(schedule);
  const paidCount = schedule.filter((r) => r.status === "paid").length;
  const total = schedule.length;
  const collapsible = total > 3;
  const [expanded, setExpanded] = useState(false);
  const today = todayIso();
  const visible = useMemo(() => {
    if (!collapsible || expanded) return schedule;
    const keep = new Set(
      schedule.slice(0, 3).map((r) => r.id),
    );
    if (next) keep.add(next.id);
    if (last) keep.add(last.id);
    return schedule.filter((r) => keep.has(r.id));
  }, [collapsible, expanded, schedule, next, last]);
  const hidden = Math.max(0, total - visible.length);

  return (
    <div
      className={`rounded-2xl border p-4 ${
        overdue ? "border-danger/35 bg-danger/5" : "border-paper-line bg-white/70"
      }`}
    >
      <div className="mb-2 flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <input
              defaultValue={loan.name}
              key={`${loan.id}-name`}
              aria-label="Loan name"
              onBlur={(e) => {
                const nextName = e.target.value.trim();
                if (nextName && nextName !== loan.name) {
                  onSave({ ...loan, name: nextName });
                }
              }}
              className="min-w-0 flex-1 bg-transparent font-display text-lg font-semibold uppercase tracking-wide outline-none"
            />
            {overdue ? (
              <span className="rounded-full bg-danger/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-danger">
                Overdue
              </span>
            ) : null}
            {loan.liabilityType === "housing" ? (
              <span className="rounded-full border border-paper-line px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                Housing
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {paidCount}/{total} payments made
          </p>
        </div>
        <button
          type="button"
          onClick={onArchive}
          className="text-[11px] font-semibold text-ink-muted hover:text-danger"
        >
          Archive
        </button>
      </div>

      <div className="mb-4">
        <LoanSummary loan={loan} owed={remaining} onRecordPayment={onRecordPayment} />
      </div>

      {payFrom.length > 0 ? (
        <label className="mb-2 block text-xs text-ink-muted">
          “Mark paid” takes the money from
          <select
            value={fromId || "__untracked__"}
            onChange={(e) => onFromId(e.target.value === "__untracked__" ? "" : e.target.value)}
            className="mt-1 w-full max-w-xs rounded-lg border border-paper-line bg-white px-2 py-1.5 text-sm text-ink"
          >
            {payFrom.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {phpSmart(balances[a.id] ?? 0)}
              </option>
            ))}
            <option value="__untracked__">
              Paid from money Ahon does not track
            </option>
          </select>
          {!fromId ? (
            <p className="mt-1 text-[11px] text-gold-deep">
              Schedule marks paid; no cash wallet will decrease.
            </p>
          ) : null}
        </label>
      ) : null}

      <div className="sheet-wrap sheet-stack">
        <table className="sheet">
          <thead>
            <tr>
              <th>Due</th>
              <th className="num">Monthly</th>
              <th>Status</th>
              <th className="num">Balance</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const isNext = next?.id === row.id;
              const isLastPaid = last?.id === row.id;
              const rowOverdue = row.status !== "paid" && row.due < today;
              return (
                <tr key={row.id}>
                  <td>{longDate(row.due)}</td>
                  <td className="num">{phpSmart(row.amount)}</td>
                  <td>
                    {row.status === "paid" ? (
                      <span className="paid">PAID</span>
                    ) : (
                      <>
                        {rowOverdue ? (
                          <span className="font-semibold text-danger">OVERDUE</span>
                        ) : null}
                        {installmentPaidSoFar(row) > 0 ? (
                          <span className="block text-[11px] text-ink-muted">
                            Partly paid {phpSmart(installmentPaidSoFar(row))}
                          </span>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td className="num">
                    {row.status === "paid" && row.balanceAfter != null
                      ? phpSmart(row.balanceAfter)
                      : ""}
                  </td>
                  <td className="text-right">
                    {isNext ? (
                      <button
                        type="button"
                        onClick={() => onPay(row.id)}
                        className="text-[11px] font-semibold text-ok"
                      >
                        Mark paid
                      </button>
                    ) : null}
                    {isLastPaid ? (
                      <button
                        type="button"
                        onClick={() => onUnpay(row.id)}
                        className="text-[11px] font-semibold text-ink-muted"
                      >
                        Undo
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {collapsible ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-semibold text-gold-deep"
        >
          {expanded
            ? "Show less"
            : `Show all ${total} months (${hidden} more)`}
        </button>
      ) : null}
    </div>
  );
}

function RevolvingCard({
  account,
  remaining,
  overdue,
  priority,
  onRecordPayment,
  onSave,
  onSetRemaining,
  onArchive,
}: {
  account: Account;
  remaining: number;
  overdue: boolean;
  priority: boolean;
  onRecordPayment: () => void;
  onSave: (account: Account) => void;
  onSetRemaining: (amount: number) => void;
  onArchive: () => void;
}) {
  return (
    <div
      className={`space-y-3 rounded-2xl border p-4 ${
        overdue
          ? "border-danger/35 bg-danger/5"
          : "border-paper-line bg-white/70"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Kind of loan"
              value={account.liabilityType ?? "other"}
              onChange={(e) =>
                onSave({
                  ...account,
                  liabilityType: e.target.value as LiabilityType,
                })
              }
              className="rounded-md border border-paper-line bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted"
            >
              {TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            {overdue ? (
              <span className="rounded-full bg-danger/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-danger">
                Overdue
              </span>
            ) : null}
            {priority ? (
              <span className="rounded-full bg-gold-deep/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gold-deep">
                Priority
              </span>
            ) : null}
          </div>
          <input
            defaultValue={account.name}
            key={`${account.id}-name`}
            aria-label="Loan name"
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next && next !== account.name) {
                onSave({ ...account, name: next });
              }
            }}
            className="mt-1 w-full bg-transparent font-medium outline-none"
          />
        </div>
      </div>

      <LoanSummary loan={account} owed={remaining} onRecordPayment={onRecordPayment} />

      <details className="rounded-xl border border-paper-line bg-white/60 px-3 py-2">
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          Edit details
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="block text-xs text-ink-muted">
            Remaining
            <input
              type="number"
              min={0}
              defaultValue={Math.round(remaining * 100) / 100}
              key={`${account.id}-bal-${Math.round(remaining * 100)}`}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n !== remaining) onSetRemaining(n);
              }}
              className="mt-1 w-full rounded-lg border border-paper-line px-2 py-1.5 text-sm text-ink"
            />
            <span className="mt-1 block text-[10px] text-ink-muted">
              Posts a Balance adjustment (keeps payment history).
            </span>
          </label>
          <label className="block text-xs text-ink-muted">
            Interest % a month
            <input
              inputMode="decimal"
              placeholder="Not known"
              defaultValue={
                interestKnown(account)
                  ? String(Math.round(account.monthlyRate * 1000) / 10)
                  : ""
              }
              key={`${account.id}-rate-${account.monthlyRate}-${interestKnown(account)}`}
              onBlur={(e) => {
                const raw = e.target.value.trim();
                if (raw === "") {
                  if (interestKnown(account)) {
                    onSave({ ...account, monthlyRate: 0, interestKnown: false });
                  }
                  return;
                }
                const n = Number(raw);
                if (!Number.isFinite(n) || n < 0 || n > 100) return;
                const next = n / 100;
                if (next !== account.monthlyRate || !interestKnown(account)) {
                  onSave({ ...account, monthlyRate: next, interestKnown: true });
                }
              }}
              className="mt-1 w-full rounded-lg border border-paper-line px-2 py-1.5 text-sm text-ink"
            />
          </label>
          <label className="block text-xs text-ink-muted">
            Due day
            <input
              type="number"
              min={0}
              max={31}
              defaultValue={account.dueDay || ""}
              key={`${account.id}-due-${account.dueDay}`}
              onBlur={(e) => {
                const n = Number(e.target.value);
                const next = Number.isFinite(n) ? n : 0;
                if (next !== account.dueDay) {
                  onSave({ ...account, dueDay: next });
                }
              }}
              className="mt-1 w-full rounded-lg border border-paper-line px-2 py-1.5 text-sm text-ink"
            />
          </label>
          <label className="block text-xs text-ink-muted">
            Regular payment
            <input
              type="number"
              min={0}
              defaultValue={account.plannedPayment || ""}
              key={`${account.id}-plan-${account.plannedPayment}`}
              onBlur={(e) => {
                const n = Number(e.target.value);
                const next = Number.isFinite(n) ? n : 0;
                if (next !== account.plannedPayment) {
                  onSave({ ...account, plannedPayment: next });
                }
              }}
              className="mt-1 w-full rounded-lg border border-paper-line px-2 py-1.5 text-sm text-ink"
            />
          </label>
        </div>
      </details>

      <button
        type="button"
        onClick={onArchive}
        className="text-[11px] font-semibold text-ink-muted hover:text-danger"
      >
        Archive
      </button>
    </div>
  );
}
