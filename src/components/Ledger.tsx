"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { RecordForm } from "@/components/RecordForm";
import { useFinance } from "@/context/FinanceContext";
import { php } from "@/lib/money";
import { particularLabel } from "@/lib/refs";
import { accountName, kindLabel, monthOf, sortedTx } from "@/lib/selectors";
import type { Transaction } from "@/lib/types";

export function Ledger({
  onManageParticulars,
  onManageCategories,
}: {
  onManageParticulars?: () => void;
  onManageCategories?: () => void;
}) {
  const { state, month, removeTransaction } = useFinance();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const rows = useMemo(
    () =>
      sortedTx(state.transactions)
        .filter((tx) => monthOf(tx) === month)
        .reverse(),
    [month, state.transactions],
  );

  function closeModal() {
    setOpen(false);
    setEditing(null);
  }

  function openAdd() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(tx: Transaction) {
    setEditing(tx);
    setOpen(true);
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">
            This month’s ledger
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            Actual cash movement · feeds Home overview.{" "}
            {rows.length === 0
              ? "Nothing recorded yet."
              : `${rows.length} transaction${rows.length === 1 ? "" : "s"}.`}
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="shrink-0 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper"
        >
          Add
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="sheet-empty">
          Tap Add to log payday, housing, tigum, or a bayad.
        </p>
      ) : (
        <div className="sheet-wrap sheet-stack">
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
                const categoryName =
                  state.categories.find((c) => c.id === tx.category)?.name ??
                  (tx.category === "income" ||
                  tx.category === "savings" ||
                  tx.category === "debt"
                    ? "—"
                    : tx.category);
                const particular = particularLabel(
                  state.particulars,
                  tx.particularId,
                  tx.particular,
                );
                const inflow = tx.kind === "income";
                return (
                  <tr key={tx.id}>
                    <td className="whitespace-nowrap">{tx.date}</td>
                    <td>
                      <span className="font-medium">{particular || "—"}</span>
                      {(tx.fromId || tx.toId || tx.note) && (
                        <p className="mt-0.5 text-[11px] text-ink-muted">
                          {tx.fromId
                            ? `from ${accountName(state, tx.fromId)}`
                            : ""}
                          {tx.fromId && tx.toId ? " · " : ""}
                          {tx.toId
                            ? `to ${accountName(state, tx.toId)}`
                            : ""}
                          {tx.note
                            ? `${tx.fromId || tx.toId ? " · " : ""}${tx.note}`
                            : ""}
                        </p>
                      )}
                    </td>
                    <td className="text-ink-muted">{categoryName || "—"}</td>
                    <td>{kindLabel(tx.kind)}</td>
                    <td
                      className={`num font-display font-semibold ${inflow ? "text-ok" : ""}`}
                    >
                      {inflow ? "+" : "−"}
                      {php(tx.amount)}
                    </td>
                    <td className="actions">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="sheet-link"
                          onClick={() => openEdit(tx)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="sheet-link danger"
                          onClick={() => {
                            const msg = tx.installmentId
                              ? "Remove this entry and mark the installment unpaid again?"
                              : "Remove this ledger entry?";
                            if (window.confirm(msg)) removeTransaction(tx.id);
                          }}
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
      )}

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
