"use client";

import { FormEvent, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { useFinance } from "@/context/FinanceContext";
import { accountIsOverdue } from "@/lib/alerts";
import { emptyAccount } from "@/lib/defaults";
import { phpSmart, todayIso } from "@/lib/money";
import { projectPayoff } from "@/lib/payoff";
import {
  buildMonthEndSchedule,
  lastPaid,
  longDate,
  nextUnpaid,
} from "@/lib/schedule";
import { byKind } from "@/lib/selectors";
import type { Account, LiabilityType } from "@/lib/types";

const TYPES: { id: LiabilityType; label: string }[] = [
  { id: "credit-card", label: "Credit card" },
  { id: "housing", label: "Housing / amortization" },
  { id: "personal", label: "Personal / salary loan" },
  { id: "other", label: "Other utang" },
];

type UtangAction = "pick" | "installment" | "revolving" | "bayad";

export function UtangView() {
  const {
    state,
    balances,
    addTransaction,
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

  const projection = useMemo(
    () =>
      projectPayoff(
        revolving.map((d) => ({ ...d, balance: balances[d.id] ?? 0 })),
        budget || 0,
      ),
    [balances, budget, revolving],
  );

  const [fromId, setFromId] = useState(banks[0]?.id ?? "");
  const [modalOpen, setModalOpen] = useState(false);
  const [action, setAction] = useState<UtangAction>("pick");

  function closeModal() {
    setModalOpen(false);
    setAction("pick");
  }

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-ink-muted">
          Installment loans keep a due / monthly / status / balance sheet.
          Cards stay editable with remaining balance, rate, and planned bayad.
        </p>
        <button
          type="button"
          onClick={() => {
            setAction("pick");
            setModalOpen(true);
          }}
          className="rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-paper"
        >
          Utang actions
        </button>
      </div>

      {debts.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-paper-line px-4 py-8 text-center text-sm text-ink-muted">
          No liabilities yet. Use Utang actions to add a loan or card.
        </p>
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
          priority={projection.focusId === d.id}
          onSave={(next) => upsertAccount(next)}
          onSetRemaining={(amount) => setCurrentBalance(d.id, amount)}
          onArchive={() => {
            if (window.confirm(`Hide ${d.name} from this list?`)) {
              archiveAccount(d.id);
            }
          }}
        />
      ))}

      {revolving.length > 0 && projection.months > 0 ? (
        <div className="rounded-2xl border border-paper-line bg-white/70 p-4">
          <h3 className="font-display text-base font-semibold">
            Revolving cards, if you keep the planned payments
          </h3>
          <p className="mt-2 text-sm text-ink-muted">
            About {projection.months} month
            {projection.months === 1 ? "" : "s"} to clear listed revolving
            utang, with roughly {phpSmart(projection.interest)} interest.
            {projection.focusId
              ? ` Priority focus: ${revolving.find((d) => d.id === projection.focusId)?.name ?? "—"}.`
              : ""}
          </p>
        </div>
      ) : null}

      <Modal
        open={modalOpen}
        title={
          action === "pick"
            ? "Utang actions"
            : action === "installment"
              ? "Add installment loan"
              : action === "revolving"
                ? "Add card or revolving"
                : "Bayad revolving utang"
        }
        onClose={closeModal}
      >
        {action === "pick" ? (
          <div className="grid gap-2">
            {(
              [
                ["installment", "Add installment loan"],
                ["revolving", "Add card or revolving utang"],
                ["bayad", "Bayad revolving utang"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                disabled={id === "bayad" && revolving.length === 0}
                onClick={() => setAction(id)}
                className="rounded-xl border border-paper-line bg-white px-4 py-3 text-left text-sm font-semibold disabled:opacity-40"
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {action === "installment" ? (
          <AddInstallmentForm
            onAdd={(account) => {
              upsertAccount(account);
              closeModal();
            }}
            onBack={() => setAction("pick")}
          />
        ) : null}

        {action === "revolving" ? (
          <AddRevolvingForm
            onAdd={(account) => {
              upsertAccount(account);
              closeModal();
            }}
            onBack={() => setAction("pick")}
          />
        ) : null}

        {action === "bayad" ? (
          <BayadForm
            revolving={revolving}
            payFrom={payFrom}
            balances={balances}
            defaultFromId={fromId}
            onDone={() => closeModal()}
            onBack={() => setAction("pick")}
            onPay={(payload) => {
              addTransaction({
                date: todayIso(),
                kind: "payment",
                amount: payload.amount,
                category: "debt",
                particular: "",
                particularId: null,
                fromId: payload.fromId,
                toId: payload.toId,
                note:
                  payload.fromId == null
                    ? "Paid from untracked source"
                    : "Bayad utang",
              });
            }}
          />
        ) : null}
      </Modal>
    </section>
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
  onPay: (rowId: string) => void;
  onUnpay: (rowId: string) => void;
  onSave: (account: Account) => void;
  onArchive: () => void;
}) {
  const schedule = loan.schedule ?? [];
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
            {paidCount}/{total} paid · remaining {phpSmart(remaining)}
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

      {payFrom.length > 0 ? (
        <label className="mb-2 block text-xs text-ink-muted">
          Mark paid from
          <select
            value={fromId || payFrom[0]?.id || "__untracked__"}
            onChange={(e) => onFromId(e.target.value === "__untracked__" ? "" : e.target.value)}
            className="mt-1 w-full max-w-xs rounded-lg border border-paper-line bg-white px-2 py-1.5 text-sm text-ink"
          >
            {payFrom.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {phpSmart(balances[a.id] ?? 0)}
              </option>
            ))}
            <option value="__untracked__">
              Payment came from an untracked source
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
                    ) : rowOverdue ? (
                      <span className="font-semibold text-danger">OVERDUE</span>
                    ) : (
                      ""
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
  onSave,
  onSetRemaining,
  onArchive,
}: {
  account: Account;
  remaining: number;
  overdue: boolean;
  priority: boolean;
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
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next && next !== account.name) {
                onSave({ ...account, name: next });
              }
            }}
            className="mt-1 w-full bg-transparent font-medium outline-none"
          />
        </div>
        <p className="font-display text-2xl font-semibold text-danger">
          {phpSmart(remaining)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
          Monthly rate %
          <input
            type="number"
            min={0}
            step={0.1}
            defaultValue={Math.round(account.monthlyRate * 1000) / 10}
            key={`${account.id}-rate-${account.monthlyRate}`}
            onBlur={(e) => {
              const n = Number(e.target.value);
              if (!Number.isFinite(n)) return;
              const next = n / 100;
              if (next !== account.monthlyRate) {
                onSave({ ...account, monthlyRate: next });
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
          Planned / mo
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

function BayadForm({
  revolving,
  payFrom,
  balances,
  defaultFromId,
  onPay,
  onDone,
  onBack,
}: {
  revolving: Account[];
  payFrom: Account[];
  balances: Record<string, number>;
  defaultFromId: string;
  onPay: (payload: {
    toId: string;
    fromId: string | null;
    amount: number;
  }) => void;
  onDone: () => void;
  onBack: () => void;
}) {
  const [toId, setToId] = useState(revolving[0]?.id ?? "");
  const [fromId, setFromId] = useState(
    defaultFromId || payFrom[0]?.id || "__untracked__",
  );
  const [amount, setAmount] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!toId || !Number.isFinite(value) || value <= 0) return;
    const resolvedFrom =
      fromId === "__untracked__" || !fromId ? null : fromId;
    if (resolvedFrom == null && payFrom.length === 0) {
      // ok — untracked only path
    } else if (resolvedFrom == null && fromId !== "__untracked__") {
      return;
    }
    onPay({
      toId,
      fromId: resolvedFrom,
      amount: Math.round(value * 100) / 100,
    });
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <button type="button" onClick={onBack} className="text-xs font-semibold text-ink-muted">
        ← Back
      </button>
      <label className="block text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Which utang
        <select
          value={toId}
          onChange={(e) => setToId(e.target.value)}
          className="mt-1 w-full rounded-xl border border-paper-line bg-white px-3 py-2 text-sm font-normal text-ink"
        >
          {revolving.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} · {phpSmart(balances[d.id] ?? 0)} left
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Pay from
        <select
          value={fromId}
          onChange={(e) => setFromId(e.target.value)}
          className="mt-1 w-full rounded-xl border border-paper-line bg-white px-3 py-2 text-sm font-normal text-ink"
        >
          {payFrom.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
          <option value="__untracked__">
            Payment came from an untracked source
          </option>
        </select>
        {fromId === "__untracked__" ? (
          <p className="mt-1 text-[11px] text-gold-deep">
            Debt drops; cash wallets stay the same.
          </p>
        ) : null}
      </label>
      <input
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount"
        required
        className="w-full rounded-xl border border-paper-line px-3 py-2 text-sm"
      />
      <button
        type="submit"
        className="w-full rounded-full bg-ink py-2.5 text-sm font-semibold text-paper"
      >
        Record payment
      </button>
    </form>
  );
}

function AddInstallmentForm({
  onAdd,
  onBack,
}: {
  onAdd: (account: Account) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const [monthly, setMonthly] = useState("941.56");
  const [start, setStart] = useState("2026-01");
  const [count, setCount] = useState("24");
  const [paidMonths, setPaidMonths] = useState("0");

  function submit(event: FormEvent) {
    event.preventDefault();
    const n = name.trim();
    const amount = Number(monthly);
    const months = Math.round(Number(count));
    const paid = Math.max(0, Math.round(Number(paidMonths) || 0));
    if (!n || !Number.isFinite(amount) || amount <= 0 || months < 1) return;
    const schedule = buildMonthEndSchedule(start, months, amount);
    let remaining = Math.round(amount * months * 100) / 100;
    for (let i = 0; i < Math.min(paid, schedule.length); i += 1) {
      remaining = Math.max(0, Math.round((remaining - amount) * 100) / 100);
      schedule[i].status = "paid";
      schedule[i].balanceAfter = remaining;
    }
    const account = emptyAccount("liability", n);
    account.liabilityType = "personal";
    account.mode = "installment";
    account.openingBalance =
      paid > 0 ? remaining + amount * Math.min(paid, months) : remaining;
    account.monthlyRate = 0;
    account.dueDay = 31;
    account.plannedPayment = amount;
    account.schedule = schedule;
    onAdd(account);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <button type="button" onClick={onBack} className="text-xs font-semibold text-ink-muted">
        ← Back
      </button>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Pag-IBIG MP2 loan, GSIS"
        className="w-full rounded-xl border border-paper-line px-3 py-2 text-sm"
        required
      />
      <div className="grid grid-cols-2 gap-2">
        <MiniField label="Monthly" value={monthly} onChange={setMonthly} placeholder="941.56" />
        <MiniField label="Start month" value={start} onChange={setStart} placeholder="2026-01" />
        <MiniField label="Months" value={count} onChange={setCount} placeholder="24" />
        <MiniField label="Already paid" value={paidMonths} onChange={setPaidMonths} placeholder="0" />
      </div>
      <button
        type="submit"
        className="w-full rounded-full bg-ink py-2.5 text-sm font-semibold text-paper"
      >
        Add installment loan
      </button>
    </form>
  );
}

function AddRevolvingForm({
  onAdd,
  onBack,
}: {
  onAdd: (account: Account) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<LiabilityType>("credit-card");
  const [remaining, setRemaining] = useState("");
  const [rate, setRate] = useState("3");
  const [due, setDue] = useState("15");
  const [planned, setPlanned] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const n = name.trim();
    const bal = Number(remaining);
    if (!n || !Number.isFinite(bal) || bal < 0) return;
    const account = emptyAccount("liability", n);
    account.liabilityType = type;
    account.mode = "revolving";
    account.openingBalance = bal;
    account.monthlyRate = (Number(rate) || 0) / 100;
    account.dueDay = Number(due) || 0;
    account.plannedPayment = Number(planned) || 0;
    onAdd(account);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <button type="button" onClick={onBack} className="text-xs font-semibold text-ink-muted">
        ← Back
      </button>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. BDO card, BPI, utang kay mama"
        className="w-full rounded-xl border border-paper-line px-3 py-2 text-sm"
        required
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value as LiabilityType)}
        className="w-full rounded-xl border border-paper-line bg-white px-3 py-2 text-sm"
      >
        {TYPES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <MiniField label="Remaining now" value={remaining} onChange={setRemaining} placeholder="30000" />
        <MiniField label="Monthly rate %" value={rate} onChange={setRate} placeholder="3" />
        <MiniField label="Due day" value={due} onChange={setDue} placeholder="15" />
        <MiniField label="Planned bayad / mo" value={planned} onChange={setPlanned} placeholder="3500" />
      </div>
      <button
        type="submit"
        className="w-full rounded-full bg-ink py-2.5 text-sm font-semibold text-paper"
      >
        Add card / revolving
      </button>
    </form>
  );
}

function MiniField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-xs text-ink-muted">
      {label}
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-paper-line px-2 py-1.5 text-sm text-ink"
      />
    </label>
  );
}
