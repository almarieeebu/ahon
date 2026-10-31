"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { RecordForm } from "@/components/RecordForm";
import { DetailList, SidePanel, panelDanger, panelPrimary } from "@/components/SidePanel";
import { SimpleLogSheet } from "@/components/SimpleLogSheet";
import { useFinance } from "@/context/FinanceContext";
import { php } from "@/lib/money";
import { particularLabel } from "@/lib/refs";
import { accountName, kindLabel, monthOf, sortedTx } from "@/lib/selectors";
import { isWalletTransfer } from "@/lib/simpleLog";
import type { Transaction } from "@/lib/types";

type FilterId = "all" | "spending" | "income" | "loans";

const FILTERS: Record<FilterId, { label: string; kinds: Transaction["kind"][] }> = {
  all: { label: "All", kinds: [] },
  spending: { label: "Spending", kinds: ["expense"] },
  income: { label: "Money in", kinds: ["income"] },
  loans: { label: "Loans & transfers", kinds: ["payment", "borrow", "transfer", "adjustment"] },
};

export function Ledger({
  onManageParticulars,
  onManageCategories,
  onAddLoan,
  onAddBorrowed,
}: {
  onManageParticulars?: () => void;
  onManageCategories?: () => void;
  onAddLoan?: () => void;
  onAddBorrowed?: (amount: string) => void;
}) {
  const { state, month, removeTransaction } = useFinance();
  const [open, setOpen] = useState(false);
  const [simpleOpen, setSimpleOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [addMode, setAddMode] = useState<"expense" | "any">("any");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>("all");

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
    if (tx.kind === "income" || tx.kind === "expense" || isWalletTransfer(tx)) {
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
    if (window.confirm(msg)) {
      removeTransaction(tx.id);
      setDetailId(null);
    }
  }

  const detail = detailId ? state.transactions.find((tx) => tx.id === detailId) : undefined;
  const shown = filter === "all" ? rows : rows.filter((tx) => FILTERS[filter].kinds.includes(tx.kind));
  const totals = useMemo(() => {
    const sum = (kind: Transaction["kind"]) =>
      rows.filter((tx) => tx.kind === kind).reduce((s, tx) => s + tx.amount, 0);
    return { income: sum("income"), expense: sum("expense"), payment: sum("payment") };
  }, [rows]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
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
            className="min-h-11 rounded-full bg-ink px-4 text-sm font-semibold text-paper hover:bg-ink/90"
          >
            Add expense
          </button>
          <button
            type="button"
            data-testid="log-add"
            onClick={() => openAdd("any")}
            className="min-h-11 rounded-full border border-ink/20 bg-white px-4 text-sm font-semibold text-ink hover:bg-paper-soft"
          >
            Log money
          </button>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-3">
          {rows.length > 0 ? (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Show">
              {(Object.keys(FILTERS) as FilterId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={filter === id}
                  onClick={() => setFilter(id)}
                  className={`min-h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold ${
                    filter === id
                      ? "bg-ink text-paper"
                      : "border border-paper-line bg-white text-ink-muted hover:text-ink"
                  }`}
                >
                  {FILTERS[id].label}
                </button>
              ))}
            </div>
          ) : null}

          {rows.length === 0 ? (
            <p className="sheet-empty">
              Tap Add expense for gastos, or Log money for payday and bills.
            </p>
          ) : shown.length === 0 ? (
            <p className="sheet-empty">Nothing of this kind this month.</p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-paper-line bg-white/80">
              <div
                className="hidden grid-cols-[6.5rem_minmax(0,1fr)_9rem_8rem] gap-3 border-b border-paper-line bg-paper-soft px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-muted md:grid"
                aria-hidden
              >
                <span>Date</span>
                <span>Particular</span>
                <span>Category</span>
                <span className="text-right">Amount</span>
              </div>
              <ul className="divide-y divide-paper-line">
                {shown.map((tx) => {
                  const meta = rowMeta(state, tx);
                  const inflow = isInflow(tx);
                  const active = tx.id === detailId;
                  return (
                    <li key={tx.id}>
                      <button
                        type="button"
                        data-testid="log-row"
                        aria-haspopup="dialog"
                        onClick={() => setDetailId(tx.id)}
                        className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-3 text-left hover:bg-paper-soft/70 md:grid-cols-[6.5rem_minmax(0,1fr)_9rem_8rem] ${
                          active ? "bg-gold-soft/60" : ""
                        }`}
                      >
                        <span className="col-start-1 row-start-2 text-xs text-ink-muted md:row-start-1 md:text-sm">
                          {tx.date}
                          <span className="md:hidden">
                            {" · "}
                            {meta.categoryName || kindLabel(tx.kind)}
                          </span>
                        </span>
                        <span className="col-start-1 row-start-1 min-w-0 md:col-start-2">
                          <span className="block truncate font-semibold text-ink">
                            {meta.particular || kindLabel(tx.kind)}
                          </span>
                          {meta.subtitle ? (
                            <span className="hidden truncate text-xs text-ink-muted md:block">
                              {meta.subtitle}
                            </span>
                          ) : null}
                        </span>
                        <span className="hidden min-w-0 truncate text-sm text-ink-muted md:block">
                          {meta.categoryName || kindLabel(tx.kind)}
                        </span>
                        <span
                          data-testid="log-row-amount"
                          className={`col-start-2 row-span-2 row-start-1 text-right font-display font-semibold tabular-nums md:col-start-4 md:row-span-1 ${inflow ? "text-ok" : "text-ink"}`}
                        >
                          {inflow ? "+" : "−"}
                          {php(tx.amount)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {rows.length > 0 ? (
          <aside className="rounded-2xl border border-paper-line bg-white/80 p-4" aria-label="Month totals">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">This month</p>
            <dl className="mt-3 grid grid-cols-3 gap-3 text-sm lg:grid-cols-1">
              <div>
                <dt className="text-ink-muted">Money in</dt>
                <dd className="font-display text-lg font-semibold text-ok">+{php(totals.income)}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Spent</dt>
                <dd className="font-display text-lg font-semibold">−{php(totals.expense)}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Loan payments</dt>
                <dd className="font-display text-lg font-semibold">−{php(totals.payment)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-ink-muted">
              Tap a row to see its details, edit or remove it.
            </p>
          </aside>
        ) : null}
      </div>

      <SidePanel
        open={Boolean(detail)}
        eyebrow={detail ? kindLabel(detail.kind) : ""}
        title={detail ? rowMeta(state, detail).particular || kindLabel(detail.kind) : ""}
        onClose={() => setDetailId(null)}
        testId="log-panel"
        footer={
          detail ? (
            <>
              {detail.kind === "adjustment" ? null : (
                <button
                  type="button"
                  data-testid="log-edit"
                  className={panelPrimary}
                  onClick={() => openEdit(detail)}
                >
                  Edit
                </button>
              )}
              <button
                type="button"
                data-testid="log-remove"
                className={panelDanger}
                onClick={() => confirmRemove(detail)}
              >
                Remove
              </button>
            </>
          ) : null
        }
      >
        {detail ? <TransactionDetails tx={detail} /> : null}
      </SidePanel>

      <SimpleLogSheet
        key={editing?.id ?? "new"}
        open={simpleOpen}
        initial={editing}
        prefill={!editing && addMode === "expense" ? { direction: "out" } : undefined}
        title={!editing && addMode === "expense" ? "Add expense" : undefined}
        onAddLoan={onAddLoan}
        onAddBorrowed={onAddBorrowed}
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

function isInflow(tx: Transaction): boolean {
  return (
    tx.kind === "income" ||
    (tx.kind === "borrow" && Boolean(tx.toId)) ||
    (tx.kind === "adjustment" && Boolean(tx.toId) && !tx.fromId)
  );
}

function TransactionDetails({ tx }: { tx: Transaction }) {
  const { state } = useFinance();
  const meta = rowMeta(state, tx);
  const inflow = isInflow(tx);
  const items = [
    { label: "Date", value: tx.date },
    { label: "Type", value: kindLabel(tx.kind) },
    ...(meta.categoryName ? [{ label: "Category", value: meta.categoryName }] : []),
    ...(tx.fromId || tx.kind === "payment"
      ? [{ label: "From", value: tx.fromId ? accountName(state, tx.fromId) : "Untracked source" }]
      : []),
    ...(tx.toId ? [{ label: "To", value: accountName(state, tx.toId) }] : []),
    ...(tx.note ? [{ label: "Note", value: tx.note }] : []),
  ];
  return (
    <div className="space-y-4">
      <p
        className={`font-display text-3xl font-semibold tabular-nums ${inflow ? "text-ok" : "text-ink"}`}
        data-testid="log-panel-amount"
      >
        {inflow ? "+" : "−"}
        {php(tx.amount)}
        <span className="sr-only">{inflow ? " money in" : " money out"}</span>
      </p>
      <DetailList items={items} />
      {tx.kind === "adjustment" ? (
        <p className="text-sm text-ink-muted">
          Balance adjustments are log history. To change a balance again, reconcile from Cash &amp;
          wallets, Savings, or Loans.
        </p>
      ) : null}
      {tx.installmentId ? (
        <p className="text-sm text-ink-muted">
          This paid a scheduled installment. Removing it marks the installment unpaid again.
        </p>
      ) : null}
    </div>
  );
}

function rowMeta(
  state: ReturnType<typeof useFinance>["state"],
  tx: Transaction,
) {
  const walletTransfer = isWalletTransfer(tx);
  const categoryName = walletTransfer
    ? "Transfer"
    : state.categories.find((c) => c.id === tx.category)?.name ??
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
    particular: particular || (walletTransfer ? "Transfer" : ""),
    categoryName,
    subtitle: bits.join(" · "),
  };
}
