"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useFinance } from "@/context/FinanceContext";
import { todayIso } from "@/lib/money";
import { findParticular } from "@/lib/refs";
import { nextUnpaid } from "@/lib/schedule";
import { byKind } from "@/lib/selectors";
import type { Transaction, TxKind } from "@/lib/types";

const KINDS: { id: TxKind; label: string }[] = [
  { id: "income", label: "Payday / income" },
  { id: "expense", label: "Expense" },
  { id: "transfer", label: "Move to tigum" },
  { id: "payment", label: "Bayad utang" },
];

export function RecordForm({
  initial,
  onSaved,
  onManageParticulars,
  onManageCategories,
}: {
  initial?: Transaction | null;
  onSaved?: () => void;
  onManageParticulars?: () => void;
  onManageCategories?: () => void;
}) {
  const { state, addTransaction, updateTransaction, payInstallment } =
    useFinance();
  const editing = Boolean(initial);
  const cash = byKind(state, "cash");
  const savings = byKind(state, "savings");
  const debts = byKind(state, "liability");
  const spendFrom = [
    ...cash,
    ...savings,
    ...debts.filter((d) => d.mode !== "installment"),
  ];
  const payFrom = [...cash, ...savings];

  const [kind, setKind] = useState<TxKind>(initial?.kind ?? "expense");
  const [amount, setAmount] = useState(
    initial ? String(initial.amount) : "",
  );
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [category, setCategory] = useState(initial?.category ?? "");
  const [particularId, setParticularId] = useState(
    initial?.particularId ??
      findParticular(state.particulars, {
        id: initial?.particularId,
        name: initial?.particular,
      })?.id ??
      state.particulars[0]?.id ??
      "",
  );
  const [fromId, setFromId] = useState(initial?.fromId ?? cash[0]?.id ?? "");
  const [toId, setToId] = useState(
    initial?.toId ?? savings[0]?.id ?? debts[0]?.id ?? "",
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!initial) return;
    setKind(initial.kind);
    setAmount(String(initial.amount));
    setDate(initial.date);
    setCategory(initial.category);
    setParticularId(
      initial.particularId ??
        findParticular(state.particulars, {
          id: initial.particularId,
          name: initial.particular,
        })?.id ??
        "",
    );
    setFromId(initial.fromId ?? "");
    setToId(initial.toId ?? "");
    setNote(initial.note);
  }, [initial, state.particulars]);

  const categoryOptions = useMemo(() => {
    if (kind === "income") {
      return state.categories.filter((c) => (c.kind ?? "expense") === "income");
    }
    return state.categories.filter((c) => (c.kind ?? "expense") === "expense");
  }, [kind, state.categories]);

  const resolvedCategory =
    categoryOptions.some((c) => c.id === category)
      ? category
      : (categoryOptions[0]?.id ?? "");

  const toOptions = useMemo(() => {
    if (kind === "income") return cash;
    if (kind === "transfer") return savings;
    if (kind === "payment") return debts;
    return [];
  }, [cash, debts, kind, savings]);

  const showTags = kind === "income" || kind === "expense";

  const selectedDebt = debts.find((d) => d.id === toId);
  const nextInstallment =
    !editing &&
    kind === "payment" &&
    selectedDebt?.mode === "installment"
      ? nextUnpaid(selectedDebt.schedule)
      : undefined;

  function finishSave() {
    if (!editing) {
      setAmount("");
      setNote("");
    }
    setSaved(true);
    window.setTimeout(() => {
      setSaved(false);
      onSaved?.();
    }, 700);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    const resolvedTo =
      kind === "expense" ? null : (toId || toOptions[0]?.id || null);
    const resolvedFrom =
      kind === "income" ? null : (fromId || spendFrom[0]?.id || null);
    const particular = showTags
      ? state.particulars.find((p) => p.id === particularId)
      : undefined;
    const particularName = particular?.name ?? "";
    const categoryId = showTags
      ? categoryOptions.some((c) => c.id === resolvedCategory)
        ? resolvedCategory
        : (categoryOptions[0]?.id ?? "")
      : kind === "transfer"
        ? "savings"
        : kind === "payment"
          ? "debt"
          : "";

    if (!editing && kind === "payment" && resolvedTo) {
      const debt = debts.find((d) => d.id === resolvedTo);
      const next = nextUnpaid(debt?.schedule);
      if (debt?.mode === "installment" && next) {
        payInstallment(debt.id, next.id, resolvedFrom, {
          particular: "",
          particularId: null,
          category: "debt",
        });
        finishSave();
        return;
      }
    }

    if (!Number.isFinite(value) || value <= 0) return;
    if (showTags && !categoryId) return;

    const payload = {
      date,
      kind,
      amount: Math.round(value * 100) / 100,
      category: categoryId || (kind === "transfer" ? "savings" : kind === "payment" ? "debt" : ""),
      particular: particularName,
      particularId: particular?.id ?? null,
      fromId: resolvedFrom,
      toId: resolvedTo,
      note: note.trim(),
      installmentId: initial?.installmentId,
    };

    if (editing && initial) {
      updateTransaction({ ...payload, id: initial.id });
    } else {
      addTransaction(payload);
    }
    finishSave();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="sr-only">Type</legend>
        {KINDS.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={editing && Boolean(initial?.installmentId)}
            onClick={() => {
              setKind(item.id);
              if (item.id === "income") setToId(cash[0]?.id ?? "");
              if (item.id === "transfer") setToId(savings[0]?.id ?? "");
              if (item.id === "payment") setToId(debts[0]?.id ?? "");
              if (item.id === "expense") setFromId(cash[0]?.id ?? "");
            }}
            className={`rounded-xl border px-3 py-2.5 text-left text-sm font-medium disabled:opacity-50 ${
              kind === item.id
                ? "border-ink bg-ink text-paper"
                : "border-paper-line bg-white text-ink"
            }`}
          >
            {item.label}
          </button>
        ))}
      </fieldset>

      {nextInstallment ? (
        <p className="rounded-xl border border-paper-line bg-white/70 px-3 py-2 text-sm text-ink-muted">
          Next SSS-style due is {nextInstallment.due} for{" "}
          {nextInstallment.amount.toFixed(2)}. Saving this will mark that row
          PAID and drop the remaining balance.
        </p>
      ) : null}

      {kind !== "payment" || !nextInstallment ? (
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Amount (₱)
          </span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-paper-line bg-white px-4 py-3 font-display text-2xl outline-none"
            placeholder="0"
            required={!nextInstallment}
          />
        </label>
      ) : null}

      {showTags ? (
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Particular
          </span>
          <select
            value={particularId}
            onChange={(e) => setParticularId(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-paper-line bg-white px-3 py-2.5 text-sm"
          >
            <option value="">— None —</option>
            {state.particulars.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-ink-muted">
            Links to Budget lines & Home overview.{" "}
            {onManageParticulars ? (
              <button
                type="button"
                onClick={onManageParticulars}
                className="font-semibold text-ink underline-offset-2 hover:underline"
              >
                Manage in More → Particulars
              </button>
            ) : null}
          </p>
        </label>
      ) : null}

      {showTags ? (
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Category
          </span>
          <select
            value={resolvedCategory}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-paper-line bg-white px-3 py-2.5 text-sm"
            required
          >
            {categoryOptions.length === 0 ? (
              <option value="">
                {kind === "income"
                  ? "Add an income category in More → Budget setup"
                  : "Add an expense category in More → Budget setup"}
              </option>
            ) : (
              categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>
          {onManageCategories ? (
            <p className="mt-1.5 text-xs text-ink-muted">
              <button
                type="button"
                onClick={onManageCategories}
                className="font-semibold text-ink underline-offset-2 hover:underline"
              >
                Manage in More → Budget setup
              </button>
            </p>
          ) : null}
        </label>
      ) : null}

      {kind === "expense" ? (
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Paid from
          </span>
          <select
            value={fromId}
            onChange={(e) => setFromId(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-paper-line bg-white px-3 py-2.5 text-sm"
          >
            {spendFrom.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {kind === "income" || kind === "transfer" || kind === "payment" ? (
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {kind === "income"
              ? "Goes into"
              : kind === "transfer"
                ? "Savings pot"
                : "Which utang"}
          </span>
          <select
            value={toId}
            onChange={(e) => setToId(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-paper-line bg-white px-3 py-2.5 text-sm"
          >
            {toOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {kind === "transfer" || kind === "payment" ? (
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Taken from
          </span>
          <select
            value={fromId}
            onChange={(e) => setFromId(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-paper-line bg-white px-3 py-2.5 text-sm"
          >
            <option value="">Payroll / none</option>
            {payFrom.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Date
        </span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-paper-line bg-white px-3 py-2.5 text-sm"
        />
      </label>

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Note (optional)
        </span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-paper-line bg-white px-3 py-2.5 text-sm"
          placeholder="e.g. palengke, Meralco, BDO due date"
        />
      </label>

      <button
        type="submit"
        className="w-full rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper"
      >
        {saved
          ? "Saved"
          : editing
            ? "Update entry"
            : "Save entry"}
      </button>
    </form>
  );
}
