"use client";

import { useEffect, useMemo, useState } from "react";
import { AddLoanSheet } from "@/components/AddLoanSheet";
import { RecordLoanPaymentSheet } from "@/components/RecordLoanPaymentSheet";
import { SidePanel, panelDanger, panelPrimary } from "@/components/SidePanel";
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
} = {}) {
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
  const budget = revolving.reduce((s, d) => s + (d.plannedPayment || 0), 0);
  const unknownRate = revolving.some((d) => !interestKnown(d));
  const totalOwed = debts.reduce((s, d) => s + (balances[d.id] ?? 0), 0);

  const projection = projectPayoff(
    revolving.map((d) => ({ ...d, balance: balances[d.id] ?? 0 })),
    budget || 0,
  );

  const [fromId, setFromId] = useState(banks[0]?.id ?? "");
  const [addOpen, setAddOpen] = useState(startWithAdd);
  const [payLoanId, setPayLoanId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    if (startWithAdd) onStartConsumed?.();
  }, [startWithAdd, onStartConsumed]);

  const detail = detailId ? debts.find((d) => d.id === detailId) : undefined;
  const priorityId = !unknownRate ? projection.focusId : null;

  function archive(loan: Account) {
    if (window.confirm(`Hide ${loan.name} from this list?`)) {
      archiveAccount(loan.id);
      setDetailId(null);
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-xl text-sm text-ink-muted">
          Loans and utang you still owe. Tap a loan for its schedule and details; use Record
          payment when you pay.
        </p>
        <button
          type="button"
          data-testid="loans-add"
          onClick={() => setAddOpen(true)}
          className="min-h-11 rounded-full bg-ink px-4 text-sm font-semibold text-paper hover:bg-ink/90"
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
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {debts.map((loan) => (
              <LoanCard
                key={loan.id}
                loan={loan}
                owed={balances[loan.id] ?? 0}
                overdue={accountIsOverdue(state, loan.id)}
                priority={priorityId === loan.id}
                selected={detailId === loan.id}
                onOpen={() => setDetailId(loan.id)}
                onRecordPayment={() => setPayLoanId(loan.id)}
              />
            ))}
          </ul>

          <aside className="space-y-3 rounded-2xl border border-paper-line bg-white/80 p-4" aria-label="Loan totals">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">Total owed</p>
              <p className="mt-1 font-display text-2xl font-semibold text-danger">{phpSmart(totalOwed)}</p>
              <p className="text-sm text-ink-muted">
                {debts.length} loan{debts.length === 1 ? "" : "s"}
              </p>
            </div>
            {budget > 0 ? (
              <div className="border-t border-paper-line pt-3 text-sm">
                <p className="text-ink-muted">Regular payments a month</p>
                <p className="font-semibold">{phpSmart(budget)}</p>
              </div>
            ) : null}
            {revolving.length > 0 && budget > 0 && projection.months > 0 ? (
              <div className="border-t border-paper-line pt-3">
                <h3 className="text-sm font-semibold">If you keep the regular payments</h3>
                <p className="mt-1 text-sm text-ink-muted">
                  About {projection.months} month
                  {projection.months === 1 ? "" : "s"} to clear the loans without a schedule
                  {unknownRate
                    ? ". Interest is left out for loans where it is not known, so the real time may be longer."
                    : `, with roughly ${phpSmart(projection.interest)} interest.`}
                  {projection.focusId && !unknownRate
                    ? ` Priority focus: ${revolving.find((d) => d.id === projection.focusId)?.name ?? "—"}.`
                    : ""}
                </p>
              </div>
            ) : null}
          </aside>
        </div>
      )}

      <SidePanel
        open={Boolean(detail)}
        eyebrow={detail ? typeLabel(detail) : ""}
        title={detail?.name ?? ""}
        onClose={() => setDetailId(null)}
        testId="loan-panel"
        footer={
          detail ? (
            <>
              <button
                type="button"
                className={panelPrimary}
                data-testid="loan-panel-record-payment"
                onClick={() => setPayLoanId(detail.id)}
              >
                Record payment
              </button>
              <button type="button" className={panelDanger} onClick={() => archive(detail)}>
                Archive
              </button>
            </>
          ) : null
        }
      >
        {detail ? (
          <div className="space-y-5">
            <LoanSummary loan={detail} owed={balances[detail.id] ?? 0} />
            {detail.mode === "installment" ? (
              <InstallmentSchedule
                loan={detail}
                payFrom={payFrom}
                balances={balances}
                fromId={fromId}
                onFromId={setFromId}
                onPay={(rowId) => payInstallment(detail.id, rowId, fromId || null)}
                onUnpay={(rowId) => unpayInstallment(detail.id, rowId)}
              />
            ) : null}
            <LoanEditor
              account={detail}
              remaining={balances[detail.id] ?? 0}
              onSave={(next) => upsertAccount(next)}
              onSetRemaining={(amount) => setCurrentBalance(detail.id, amount)}
            />
          </div>
        ) : null}
      </SidePanel>

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

function typeLabel(loan: Account): string {
  if (loan.mode === "installment" && loan.liabilityType !== "housing") return "Loan with schedule";
  return TYPES.find((t) => t.id === (loan.liabilityType ?? "other"))?.label ?? "Loan";
}

function LoanCard({
  loan,
  owed,
  overdue,
  priority,
  selected,
  onOpen,
  onRecordPayment,
}: {
  loan: Account;
  owed: number;
  overdue: boolean;
  priority: boolean;
  selected: boolean;
  onOpen: () => void;
  onRecordPayment: () => void;
}) {
  const schedule = loan.schedule ?? [];
  const scheduled = loan.mode === "installment" && schedule.length > 0;
  const paidCount = schedule.filter((r) => r.status === "paid").length;
  const next = scheduled ? nextUnpaid(schedule) : undefined;
  return (
    <li
      className={`relative flex flex-col gap-3 rounded-2xl border p-4 transition-shadow hover:shadow-sm ${
        overdue ? "border-danger/35 bg-danger/5" : "border-paper-line bg-white/80"
      } ${selected ? "ring-2 ring-gold-deep/50" : ""}`}
      data-testid="loan-card"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full border border-paper-line bg-white px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          {typeLabel(loan)}
        </span>
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
      <h3 className="min-w-0">
        <button
          type="button"
          onClick={onOpen}
          aria-haspopup="dialog"
          className="block max-w-full truncate text-left font-display text-lg font-semibold after:absolute after:inset-0 after:rounded-2xl after:content-[''] hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-gold-deep"
        >
          {loan.name}
        </button>
      </h3>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-ink-muted">Amount owed</p>
          <p className="font-display text-2xl font-semibold text-danger" data-testid="loan-owed">
            {phpSmart(owed)}
          </p>
        </div>
        {scheduled ? (
          <p className="text-right text-sm text-ink-muted">
            {paidCount}/{schedule.length} paid
            {next ? <span className="block">Next {longDate(next.due)}</span> : null}
          </p>
        ) : loan.plannedPayment > 0 ? (
          <p className="text-right text-sm text-ink-muted">
            {phpSmart(loan.plannedPayment)}
            <span className="block">a month</span>
          </p>
        ) : null}
      </div>
      {scheduled ? (
        <span className="block h-1.5 overflow-hidden rounded-full bg-paper-soft" aria-hidden>
          <span
            className="block h-full bg-ok"
            style={{ width: `${(paidCount / schedule.length) * 100}%` }}
          />
        </span>
      ) : null}
      <p className="text-xs text-ink-muted">
        Interest:{" "}
        <span className="font-semibold text-ink">
          {interestKnown(loan) ? `${Math.round(loan.monthlyRate * 1000) / 10}% a month` : "not known"}
        </span>
      </p>
      <div className="relative z-10 mt-auto flex gap-2">
        <button
          type="button"
          onClick={onRecordPayment}
          data-testid="loan-record-payment"
          aria-label={`Record payment on ${loan.name}`}
          className="min-h-11 flex-1 rounded-full bg-ink px-4 text-sm font-semibold text-paper hover:bg-ink/90"
        >
          Record payment
        </button>
        <button
          type="button"
          onClick={onOpen}
          aria-haspopup="dialog"
          aria-label={`Details for ${loan.name}`}
          className="min-h-11 rounded-full border border-ink/20 bg-white px-4 text-sm font-semibold text-ink hover:bg-paper-soft"
        >
          Details
        </button>
      </div>
    </li>
  );
}

function LoanSummary({ loan, owed }: { loan: Account; owed: number }) {
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
            data-testid="loan-panel-owed"
          >
            {phpSmart(owed)}
          </dd>
        </div>
        {scheduled ? (
          <div>
            <dt className="text-xs text-ink-muted">Scheduled payments left</dt>
            <dd className="font-display text-xl font-semibold text-ink">
              {phpSmart(left)}
              <span className="block font-sans text-xs font-normal text-ink-muted">
                {count} payment{count === 1 ? "" : "s"}
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
    </div>
  );
}

function InstallmentSchedule({
  loan,
  payFrom,
  balances,
  fromId,
  onFromId,
  onPay,
  onUnpay,
}: {
  loan: Account;
  payFrom: Account[];
  balances: Record<string, number>;
  fromId: string;
  onFromId: (id: string) => void;
  onPay: (rowId: string) => void;
  onUnpay: (rowId: string) => void;
}) {
  const schedule = useMemo(() => loan.schedule ?? [], [loan.schedule]);
  const next = nextUnpaid(schedule);
  const last = lastPaid(schedule);
  const paidCount = schedule.filter((r) => r.status === "paid").length;
  const total = schedule.length;
  const collapsible = total > 4;
  const [expanded, setExpanded] = useState(false);
  const today = todayIso();
  const visible = useMemo(() => {
    if (!collapsible || expanded) return schedule;
    const keep = new Set<string>();
    if (last) keep.add(last.id);
    // The next few payments matter most; older paid rows are history.
    const nextIndex = next ? schedule.findIndex((r) => r.id === next.id) : schedule.length;
    for (const row of schedule.slice(nextIndex, nextIndex + 3)) keep.add(row.id);
    if (keep.size === 0) for (const row of schedule.slice(0, 3)) keep.add(row.id);
    return schedule.filter((r) => keep.has(r.id));
  }, [collapsible, expanded, schedule, next, last]);
  const hidden = Math.max(0, total - visible.length);

  if (total === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Schedule</h3>
        <p className="text-sm text-ink-muted">
          {paidCount}/{total} payments made
        </p>
      </div>

      {payFrom.length > 0 ? (
        <label className="block text-xs text-ink-muted">
          “Mark paid” takes the money from
          <select
            value={fromId || "__untracked__"}
            onChange={(e) => onFromId(e.target.value === "__untracked__" ? "" : e.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-paper-line bg-white px-2 text-sm text-ink"
          >
            {payFrom.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {phpSmart(balances[a.id] ?? 0)}
              </option>
            ))}
            <option value="__untracked__">Paid from money Ahon does not track</option>
          </select>
          {!fromId ? (
            <span className="mt-1 block text-[11px] text-gold-deep">
              Schedule marks paid; no cash wallet will decrease.
            </span>
          ) : null}
        </label>
      ) : null}

      <ul className="divide-y divide-paper-line rounded-xl border border-paper-line bg-white">
        {visible.map((row) => {
          const isNext = next?.id === row.id;
          const isLastPaid = last?.id === row.id;
          const rowOverdue = row.status !== "paid" && row.due < today;
          return (
            <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-semibold">{longDate(row.due)}</p>
                <p className="text-xs text-ink-muted">
                  {phpSmart(row.amount)}
                  {row.status === "paid" ? (
                    <span className="ml-1 font-semibold text-ok">· Paid</span>
                  ) : rowOverdue ? (
                    <span className="ml-1 font-semibold text-danger">· Overdue</span>
                  ) : null}
                  {row.status !== "paid" && installmentPaidSoFar(row) > 0
                    ? ` · Partly paid ${phpSmart(installmentPaidSoFar(row))}`
                    : ""}
                  {row.status === "paid" && row.balanceAfter != null
                    ? ` · ${phpSmart(row.balanceAfter)} left after`
                    : ""}
                </p>
              </div>
              {isNext ? (
                <button
                  type="button"
                  onClick={() => onPay(row.id)}
                  className="min-h-10 shrink-0 rounded-full border border-ok/40 px-3 text-xs font-semibold text-ok hover:bg-ok/5"
                >
                  Mark paid
                </button>
              ) : null}
              {isLastPaid ? (
                <button
                  type="button"
                  onClick={() => onUnpay(row.id)}
                  className="min-h-10 shrink-0 rounded-full border border-paper-line px-3 text-xs font-semibold text-ink-muted hover:text-ink"
                >
                  Undo
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {collapsible ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="min-h-10 text-sm font-semibold text-gold-deep"
        >
          {expanded ? "Show less" : `Show all ${total} months (${hidden} more)`}
        </button>
      ) : null}
    </div>
  );
}

const editInput =
  "mt-1 min-h-11 w-full rounded-lg border border-paper-line bg-white px-2.5 text-sm text-ink";

function LoanEditor({
  account,
  remaining,
  onSave,
  onSetRemaining,
}: {
  account: Account;
  remaining: number;
  onSave: (account: Account) => void;
  onSetRemaining: (amount: number) => void;
}) {
  const revolving = account.mode !== "installment";
  return (
    <details className="rounded-xl border border-paper-line bg-white px-3.5 py-1">
      <summary className="cursor-pointer py-2.5 text-sm font-semibold text-ink">Edit details</summary>
      <div className="grid grid-cols-2 gap-3 pb-3 pt-1">
        <label className="col-span-2 block text-xs text-ink-muted">
          Name
          <input
            defaultValue={account.name}
            key={`${account.id}-name-${account.name}`}
            aria-label="Loan name"
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next && next !== account.name) onSave({ ...account, name: next });
            }}
            className={editInput}
          />
        </label>
        {revolving ? (
          <>
            <label className="col-span-2 block text-xs text-ink-muted">
              Kind of loan
              <select
                aria-label="Kind of loan"
                value={account.liabilityType ?? "other"}
                onChange={(e) =>
                  onSave({ ...account, liabilityType: e.target.value as LiabilityType })
                }
                className={editInput}
              >
                {TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 block text-xs text-ink-muted">
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
                className={editInput}
              />
              <span className="mt-1 block text-[11px] text-ink-muted">
                Posts a Balance adjustment (keeps payment history).
              </span>
            </label>
            <label className="block text-xs text-ink-muted">
              Interest % a month
              <input
                inputMode="decimal"
                placeholder="Not known"
                defaultValue={
                  interestKnown(account) ? String(Math.round(account.monthlyRate * 1000) / 10) : ""
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
                className={editInput}
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
                  if (next !== account.dueDay) onSave({ ...account, dueDay: next });
                }}
                className={editInput}
              />
            </label>
            <label className="col-span-2 block text-xs text-ink-muted">
              Regular payment
              <input
                type="number"
                min={0}
                defaultValue={account.plannedPayment || ""}
                key={`${account.id}-plan-${account.plannedPayment}`}
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  const next = Number.isFinite(n) ? n : 0;
                  if (next !== account.plannedPayment) onSave({ ...account, plannedPayment: next });
                }}
                className={editInput}
              />
            </label>
          </>
        ) : null}
      </div>
    </details>
  );
}
