"use client";

import { FormEvent, useMemo, useState } from "react";
import { useFinance } from "@/context/FinanceContext";
import { parseAmount, php, todayIso } from "@/lib/money";
import { applyRemoveTransaction, checkLoanPayment } from "@/lib/payments";
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
  const [particularChoice, setParticularId] = useState(
    initial?.particularId ??
      findParticular(state.particulars, {
        id: initial?.particularId,
        name: initial?.particular,
      })?.id ??
      "",
  );
  const [fromChoice, setFromId] = useState(
    initialFromId(initial, defaultCashId),
  );
  const [toId, setToId] = useState(
    // Payments never preselect a loan: the person must choose one.
    initial?.toId ?? "",
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const particularOptions = useMemo(() => {
    return state.particulars.filter((p) => {
      const cat = state.categories.find((c) => c.id === p.categoryId);
      if (kind === "income") return (cat?.kind ?? "expense") === "income";
      if (kind === "expense") return (cat?.kind ?? "expense") === "expense";
      return true;
    });
  }, [kind, state.categories, state.particulars]);

  // Fields are initialised from `initial` once; callers remount with a new
  // `key` to load a different row. Invalid choices fall back while rendering.
  const particularId = particularOptions.some((p) => p.id === particularChoice)
    ? particularChoice
    : "";
  const fromId =
    kind === "expense" && fromChoice && !spendFrom.some((a) => a.id === fromChoice)
      ? (spendFrom[0]?.id ?? "")
      : fromChoice;

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
      : "";

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
    setError("");
    const resolvedTo =
      kind === "expense"
        ? null
        : kind === "payment" || kind === "borrow"
          ? toId || null
          : toId || toOptions[0]?.id || null;

    if (kind === "payment") {
      if (debts.length === 0) {
        setError("You have no loans yet. Add a loan in Loans first, then record the payment.");
        return;
      }
      if (!resolvedTo) {
        setError("Choose which loan this payment is for.");
        return;
      }
    }

    let resolvedFrom: string | null = null;
    if (kind === "income") {
      resolvedFrom = null;
    } else if (kind === "borrow") {
      // Loan received: keep the loan (fromId) and receiving wallet as saved.
      resolvedFrom = initial?.fromId ?? null;
    } else if (kind === "payment") {
      if (fromId === UNTRACKED_PAYMENT_SOURCE) {
        resolvedFrom = null;
      } else if (fromId && payFrom.some((a) => a.id === fromId)) {
        resolvedFrom = fromId;
      } else {
        setError(
          "Choose where the payment came from, or “Payment came from an untracked source”.",
        );
        return;
      }
    } else if (kind === "transfer") {
      if (!fromId || !payFrom.some((a) => a.id === fromId)) {
        setError("Choose which account the transfer is taken from.");
        return;
      }
      resolvedFrom = fromId;
    } else {
      resolvedFrom = fromId || spendFrom[0]?.id || null;
      if (!resolvedFrom) {
        setError("Add a cash account to pay from.");
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
        : ""
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

    const parsed = parseAmount(amount);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (showTags && !categoryId) {
      setError("Choose a category.");
      return;
    }
    if (kind === "payment" && resolvedTo) {
      // Check against the books without this row when editing.
      const base = editing && initial ? applyRemoveTransaction(state, initial.id) : state;
      const check = checkLoanPayment(base, {
        liabilityId: resolvedTo,
        amount: parsed.value,
      });
      if (check.reason === "overpay") {
        const ok = window.confirm(
          `This is ${php(check.excess, true)} more than the ${php(check.remaining, true)} still owed. Record it anyway?`,
        );
        if (!ok) return;
      } else if (check.error) {
        setError(check.error);
        return;
      }
    }

    const payload = {
      date,
      kind,
      amount: parsed.value,
      category:
        categoryId ||
        (kind === "transfer"
          ? "savings"
          : kind === "payment"
            ? "debt"
            : kind === "borrow"
              ? initial?.category || "loan-proceeds"
              : ""),
      particular: particularName,
      particularId: particular?.id ?? null,
      fromId: resolvedFrom,
      toId: resolvedTo,
      note:
        kind === "payment" && resolvedFrom == null && !note.trim()
          ? "Paid from untracked source"
          : note.trim(),
      installmentId: initial?.installmentId,
      budgetLineId: initial?.budgetLineId ?? null,
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
            disabled={
              editing &&
              (Boolean(initial?.installmentId) || initial?.kind === "borrow")
            }
            onClick={() => {
              setKind(item.id);
              if (item.id === "income") setToId(cash[0]?.id ?? "");
              if (item.id === "transfer") setToId(savings[0]?.id ?? "");
              if (item.id === "payment") setToId("");
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
                Manage names in More
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
            {categoryOptions.length > 0 ? (
              <option value="">Choose a category</option>
            ) : null}
            {categoryOptions.length === 0 ? (
              <option value="">
                {kind === "income"
                  ? "Add an income group in More → Income & recurring bills"
                  : "Add an expense group in More → Income & recurring bills"}
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
                Manage groups in More
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
            required={kind === "payment"}
          >
            {kind === "payment" ? (
              <option value="">
                {debts.length === 0 ? "No loans yet — add one in Loans" : "Choose a loan"}
              </option>
            ) : null}
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
            value={fromId}
            onChange={(e) => setFromId(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-paper-line bg-white px-3 py-2.5 text-sm"
            required
          >
            <option value="">Choose where it came from</option>
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

      <p
        role="status"
        aria-live="polite"
        data-testid="record-error"
        className={error ? "text-sm font-semibold text-danger" : "sr-only"}
      >
        {error}
      </p>

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
