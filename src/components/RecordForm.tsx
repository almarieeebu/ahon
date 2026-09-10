"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useFinance } from "@/context/FinanceContext";
import { todayIso } from "@/lib/money";
import { UNTRACKED_PAYMENT_SOURCE } from "@/lib/paymentSource";
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

function initialFromId(tx: Transaction | null | undefined, cashId: string): string {
  if (!tx) return cashId;
  if (tx.kind === "payment") {
    return tx.fromId ?? UNTRACKED_PAYMENT_SOURCE;
  }
  return tx.fromId ?? cashId;
}

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
  const defaultCashId = cash[0]?.id ?? "";
  // Expenses: pay from cash wallets only (not tigum pots / utang)
  const spendFrom = cash;
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
  const [fromId, setFromId] = useState(
    initialFromId(initial, defaultCashId),
  );
  const [toId, setToId] = useState(
    initial?.toId ?? savings[0]?.id ?? debts[0]?.id ?? "",
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [saved, setSaved] = useState(false);

  const particularOptions = useMemo(() => {
    return state.particulars.filter((p) => {
      const cat = state.categories.find((c) => c.id === p.categoryId);
      if (kind === "income") return (cat?.kind ?? "expense") === "income";
      if (kind === "expense") return (cat?.kind ?? "expense") === "expense";
      return true;
    });
  }, [kind, state.categories, state.particulars]);

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
    setFromId(initialFromId(initial, defaultCashId));
    setToId(initial.toId ?? "");
    setNote(initial.note);
    // Reload only when a different row is opened. `cash` is a new array each
    // render and must not reset the fields the person is editing.
  }, [initial, defaultCashId, state.particulars]);

  useEffect(() => {
    if (!particularId) return;
    if (!particularOptions.some((p) => p.id === particularId)) {
      setParticularId(particularOptions[0]?.id ?? "");
    }
  }, [particularId, particularOptions]);

  useEffect(() => {
    if (kind === "expense" && fromId && !spendFrom.some((a) => a.id === fromId)) {
      setFromId(spendFrom[0]?.id ?? "");
    }
  }, [fromId, kind, spendFrom]);

  const categoryOptions = useMemo(() => {
    if (kind === "income") {
      return state.categories.filter((c) => (c.kind ?? "expense") === "income");
    }
    return state.categories.filter((c) => (c.kind ?? "expense") === "expense");
  }, [kind, state.categories]);

  const selectedParticular = state.particulars.find(
    (particular) => particular.id === particularId,
  );
  const linkedCategoryId = selectedParticular?.categoryId ?? "";
  const linkedCategory = categoryOptions.find(
    (item) => item.id === linkedCategoryId,
  );
  const resolvedCategory = linkedCategory
    ? linkedCategory.id
    : categoryOptions.some((item) => item.id === category)
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

    let resolvedFrom: string | null = null;
    if (kind === "income") {
      resolvedFrom = null;
    } else if (kind === "payment") {
      if (fromId === UNTRACKED_PAYMENT_SOURCE) {
        resolvedFrom = null;
      } else if (fromId && payFrom.some((a) => a.id === fromId)) {
        resolvedFrom = fromId;
      } else if (payFrom[0]?.id) {
        resolvedFrom = payFrom[0].id;
      } else {
        window.alert(
          "Add a cash or savings account first, or choose “Payment came from an untracked source”.",
        );
        return;
      }
    } else if (kind === "transfer") {
      if (!fromId || !payFrom.some((a) => a.id === fromId)) {
        window.alert("Choose which account the transfer is taken from.");
        return;
      }
      resolvedFrom = fromId;
    } else {
      resolvedFrom = fromId || spendFrom[0]?.id || null;
      if (!resolvedFrom) {
        window.alert("Add a cash account to pay from.");
        return;
      }
    }

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
      note:
        kind === "payment" && resolvedFrom == null && !note.trim()
          ? "Paid from untracked source"
          : note.trim(),
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
            data-testid="record-amount"
          />
        </label>
      ) : null}

      {showTags ? (
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            What was it for?
          </span>
          <select
            value={particularId}
            onChange={(e) => setParticularId(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-paper-line bg-white px-3 py-2.5 text-sm"
          >
            <option value="">— None —</option>
            {particularOptions.map((p) => (
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
                Manage names in Menu
              </button>
            ) : null}
          </p>
        </label>
      ) : null}

      {showTags && !linkedCategory ? (
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
                  ? "Add an income group in Menu → Money plan"
                  : "Add an expense group in Menu → Money plan"}
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
                Manage groups in Menu
              </button>
            </p>
          ) : null}
        </label>
      ) : null}

      {showTags && linkedCategory ? (
        <p className="rounded-xl border border-paper-line bg-paper-soft/40 px-3 py-2.5 text-sm text-ink-muted">
          Category: <span className="font-semibold text-ink">{linkedCategory.name}</span>
        </p>
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

      {kind === "transfer" ? (
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Taken from
          </span>
          <select
            value={fromId}
            onChange={(e) => setFromId(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-paper-line bg-white px-3 py-2.5 text-sm"
            required
          >
            {payFrom.length === 0 ? (
              <option value="">Add a cash account first</option>
            ) : (
              payFrom.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))
            )}
          </select>
        </label>
      ) : null}

      {kind === "payment" ? (
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Pay from
          </span>
          <select
            value={fromId || (payFrom[0]?.id ?? UNTRACKED_PAYMENT_SOURCE)}
            onChange={(e) => setFromId(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-paper-line bg-white px-3 py-2.5 text-sm"
            required
          >
            {payFrom.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            <option value={UNTRACKED_PAYMENT_SOURCE}>
              Payment came from an untracked source
            </option>
          </select>
          {fromId === UNTRACKED_PAYMENT_SOURCE ? (
            <p className="mt-1.5 text-xs text-gold-deep">
              Debt will drop, but no cash/wallet balance will change. Use only
              when the money did not come from an account in Ahon.
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-ink-muted">
              Cash or wallet decreases with this bayad.
            </p>
          )}
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
        data-testid="record-save"
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
