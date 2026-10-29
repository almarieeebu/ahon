"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { RecordForm } from "@/components/RecordForm";
import { SimpleLogSheet } from "@/components/SimpleLogSheet";
import { useFinance } from "@/context/FinanceContext";
import { php } from "@/lib/money";
import { particularLabel } from "@/lib/refs";
import { accountName, kindLabel, monthOf, sortedTx } from "@/lib/selectors";
import type { Transaction } from "@/lib/types";

export function Ledger({
  onManageParticulars,
  onManageCategories,
  onAddLoan,
}: {
  onManageParticulars?: () => void;
  onManageCategories?: () => void;
  onAddLoan?: () => void;
}) {
  const { state, month, removeTransaction } = useFinance();
  const [open, setOpen] = useState(false);
  const [simpleOpen, setSimpleOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [addMode, setAddMode] = useState<"expense" | "any">("any");

  const rows = useMemo(
    () =>
      sortedTx(state.transactions)
        .filter((tx) => monthOf(tx) === month)
        .reverse(),
    [month, state.transactions],
  );

  function closeModal() {
    setOpen(false);
    setSimpleOpen(false);
    setEditing(null);
  }

  function openAdd(mode: "expense" | "any" = "any") {
    setEditing(null);
    setAddMode(mode);
    setOpen(false);
    setSimpleOpen(true);
  }

  function openEdit(tx: Transaction) {
    if (tx.kind === "adjustment") {
      window.alert(
        "Balance adjustments are log history. To change a balance again, reconcile from Cash & wallets, Savings, or Loans.",
      );
      return;
    }
    setEditing(tx);
    if (tx.kind === "income" || tx.kind === "expense") {
      setOpen(false);
      setSimpleOpen(true);
      return;
    }
    setSimpleOpen(false);
    setOpen(true);
  }

  function confirmRemove(tx: Transaction) {
    const msg = tx.installmentId
      ? "Remove this entry and mark the installment unpaid again?"
      : "Remove this ledger entry?";
    if (window.confirm(msg)) removeTransaction(tx.id);
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">
            This month’s log
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            What actually moved · feeds Home.{" "}
            {rows.length === 0
              ? "Nothing recorded yet."
              : `${rows.length} transaction${rows.length === 1 ? "" : "s"}.`}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <button
            type="button"
            data-testid="log-add-expense"
            onClick={() => openAdd("expense")}
            className="rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-paper"
          >
            Add expense
          </button>
          <button
            type="button"
            data-testid="log-add"
            onClick={() => openAdd("any")}
            className="rounded-full border border-ink/20 bg-white px-4 py-2.5 text-sm font-semibold text-ink"
          >
            Log money
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="sheet-empty">
          Tap Add expense for gastos, or Log money for payday and bills.
        </p>
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {rows.map((tx) => {
              const meta = rowMeta(state, tx);
              const inflow =
                tx.kind === "income" ||
                (tx.kind === "borrow" && Boolean(tx.toId)) ||
                (tx.kind === "adjustment" && tx.toId && !tx.fromId);
              return (
                <li
                  key={tx.id}
                  className="rounded-2xl border border-paper-line bg-white px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-ink-muted">{tx.date}</p>
                      <p className="mt-1 text-base font-semibold text-ink">
                        {meta.particular || "—"}
                      </p>
                      <p className="mt-0.5 text-sm text-ink-muted">
                        {meta.subtitle}
                      </p>
                      <p className="mt-1 text-sm text-ink-muted">
                        {kindLabel(tx.kind)}
                        {meta.categoryName ? ` · ${meta.categoryName}` : ""}
                      </p>
                    </div>
                    <p
                      data-testid="log-row-amount"
                      className={`shrink-0 font-display text-lg font-semibold ${inflow ? "text-ok" : "text-ink"}`}
                    >
                      {inflow ? "+" : "−"}
                      {php(tx.amount)}
                    </p>
                  </div>
                  <div className="mt-3 flex gap-2 border-t border-paper-line pt-3">
                    <button
                      type="button"
                      data-testid="log-edit"
                      onClick={() => openEdit(tx)}
                      className="flex-1 rounded-full border border-ink/15 bg-paper px-3 py-2 text-sm font-semibold text-ink"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmRemove(tx)}
                      className="flex-1 rounded-full border border-danger/25 bg-white px-3 py-2 text-sm font-semibold text-danger"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop table */}
          <div className="sheet-wrap hidden md:block">
            <table className="sheet">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Particular</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th className="num">Amount</th>
                  <th className="actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((tx) => {
                  const meta = rowMeta(state, tx);
                  const inflow =
                tx.kind === "income" ||
                (tx.kind === "borrow" && Boolean(tx.toId)) ||
                (tx.kind === "adjustment" && tx.toId && !tx.fromId);
                  return (
                    <tr key={tx.id}>
                      <td className="whitespace-nowrap">{tx.date}</td>
                      <td>
                        <span className="font-medium">
                          {meta.particular || "—"}
                        </span>
                        {meta.subtitle ? (
                          <p className="mt-0.5 text-[11px] text-ink-muted">
                            {meta.subtitle}
                          </p>
                        ) : null}
                      </td>
                      <td className="text-ink-muted">
                        {meta.categoryName || "—"}
                      </td>
                      <td>{kindLabel(tx.kind)}</td>
                      <td
                        data-testid="log-row-amount"
                        className={`num font-display font-semibold ${inflow ? "text-ok" : ""}`}
                      >
                        {inflow ? "+" : "−"}
                        {php(tx.amount)}
                      </td>
                      <td className="actions">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            data-testid="log-edit"
                            className="rounded-full border border-ink/15 px-3 py-1 text-xs font-semibold"
                            onClick={() => openEdit(tx)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-danger/25 px-3 py-1 text-xs font-semibold text-danger"
                            onClick={() => confirmRemove(tx)}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <SimpleLogSheet
        key={editing?.id ?? "new"}
        open={simpleOpen}
        initial={editing}
        prefill={!editing && addMode === "expense" ? { direction: "out" } : undefined}
        title={!editing && addMode === "expense" ? "Add expense" : undefined}
        onAddLoan={onAddLoan}
        onClose={closeModal}
        onManageParticulars={onManageParticulars}
        onManageCategories={onManageCategories}
      />

      <Modal
        open={open}
        title={editing ? "Edit entry" : "Log a peso"}
        onClose={closeModal}
      >
        <RecordForm
          key={editing?.id ?? "new"}
          initial={editing}
          onSaved={closeModal}
          onManageParticulars={
            onManageParticulars
              ? () => {
                  closeModal();
                  onManageParticulars();
                }
              : undefined
          }
          onManageCategories={
            onManageCategories
              ? () => {
                  closeModal();
                  onManageCategories();
                }
              : undefined
          }
        />
      </Modal>
    </section>
  );
}

function rowMeta(
  state: ReturnType<typeof useFinance>["state"],
  tx: Transaction,
) {
  const categoryName =
    state.categories.find((c) => c.id === tx.category)?.name ??
    (tx.category === "income" ||
    tx.category === "savings" ||
    tx.category === "debt"
      ? ""
      : tx.category);
  const particular = particularLabel(
    state.particulars,
    tx.particularId,
    tx.particular,
  );
  const bits = [
    tx.kind === "payment" && !tx.fromId
      ? "from untracked source"
      : tx.fromId
        ? `from ${accountName(state, tx.fromId)}`
        : "",
    tx.toId ? `to ${accountName(state, tx.toId)}` : "",
    tx.note,
  ].filter(Boolean);
  return {
    particular,
    categoryName,
    subtitle: bits.join(" · "),
  };
}
