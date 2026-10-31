"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { RecordForm } from "@/components/RecordForm";
import { DetailList, SidePanel, panelDanger, panelPrimary } from "@/components/SidePanel";
import { SimpleLogSheet } from "@/components/SimpleLogSheet";
import { useFinance } from "@/context/FinanceContext";
import {
  accountFlowLabel,
  accountGroups,
  activityTotals,
  DEFAULT_ACTIVITY_FILTER,
  filterActivity,
  isCustomDate,
  KIND_FILTERS,
  parseActivityFilter,
  txFlow,
  type ActivityFilter,
  type DateFilter,
  type Flow,
  type KindFilterId,
} from "@/lib/activityFilter";
import { php, todayIso } from "@/lib/money";
import { monthBounds } from "@/lib/periodBudget";
import { particularLabel } from "@/lib/refs";
import { accountName, kindLabel, monthOf, sortedTx } from "@/lib/selectors";
import { isWalletTransfer } from "@/lib/simpleLog";
import type { Transaction } from "@/lib/types";

const FILTER_STORAGE_KEY = "ahon.activityFilter";

function loadFilter(): ActivityFilter {
  try {
    return parseActivityFilter(window.sessionStorage.getItem(FILTER_STORAGE_KEY));
  } catch {
    return DEFAULT_ACTIVITY_FILTER;
  }
}

function saveFilter(filter: ActivityFilter) {
  try {
    window.sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filter));
  } catch {
    // Storage blocked: the filter still works for this visit.
  }
}

const filterControl =
  "min-h-10 min-w-0 rounded-lg border border-paper-line bg-white px-2 text-sm text-ink";

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
  const [filter, setFilterState] = useState<ActivityFilter>(loadFilter);

  function setFilter(next: ActivityFilter) {
    setFilterState(next);
    saveFilter(next);
  }

  function setDateMode(mode: DateFilter["mode"]) {
    const { start, end } = monthBounds(month);
    const today = todayIso();
    const inMonth = today >= start && today <= end;
    const date: DateFilter =
      mode === "day"
        ? { mode, from: inMonth ? today : start }
        : mode === "range"
          ? { mode, from: start, to: inMonth ? today : end }
          : { mode };
    setFilter({ ...filter, date });
  }

  const allRows = useMemo(() => sortedTx(state.transactions).reverse(), [state.transactions]);
  const rows = useMemo(() => allRows.filter((tx) => monthOf(tx) === month), [allRows, month]);
  const accountOptions = useMemo(() => accountGroups(state.accounts), [state.accounts]);
  // A saved account that was since removed or archived falls back to all.
  const accountId = accountOptions.some((g) => g.accounts.some((a) => a.id === filter.accountId))
    ? filter.accountId
    : "";
  const effective = { ...filter, accountId };
  const shown = filterActivity(allRows, effective, month);
  const shownTotals = activityTotals(shown, accountId);
  const customDate = isCustomDate(filter.date);
  const filtered = filter.kind !== "all" || customDate || Boolean(accountId);

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
          {state.transactions.length > 0 ? (
            <div className="space-y-2" data-testid="log-filters">
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Show">
                {(Object.keys(KIND_FILTERS) as KindFilterId[]).map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={filter.kind === id}
                    onClick={() => setFilter({ ...filter, kind: id })}
                    className={`min-h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold ${
                      filter.kind === id
                        ? "bg-ink text-paper"
                        : "border border-paper-line bg-white text-ink-muted hover:text-ink"
                    }`}
                  >
                    {KIND_FILTERS[id].label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex min-w-0 flex-col text-xs text-ink-muted">
                  Date
                  <select
                    data-testid="log-filter-date-mode"
                    value={filter.date.mode}
                    onChange={(e) => setDateMode(e.target.value as DateFilter["mode"])}
                    className={`mt-1 ${filterControl}`}
                  >
                    <option value="month">Whole month</option>
                    <option value="day">One day</option>
                    <option value="range">Date range</option>
                  </select>
                </label>
                {filter.date.mode === "day" ? (
                  <label className="flex min-w-0 flex-col text-xs text-ink-muted">
                    Day
                    <input
                      type="date"
                      data-testid="log-filter-day"
                      value={filter.date.from}
                      onChange={(e) => setFilter({ ...filter, date: { mode: "day", from: e.target.value } })}
                      className={`mt-1 ${filterControl}`}
                    />
                  </label>
                ) : null}
                {filter.date.mode === "range" ? (
                  <>
                    <label className="flex min-w-0 flex-col text-xs text-ink-muted">
                      From
                      <input
                        type="date"
                        data-testid="log-filter-from"
                        value={filter.date.from}
                        max={filter.date.to || undefined}
                        onChange={(e) =>
                          setFilter({
                            ...filter,
                            date: { mode: "range", from: e.target.value, to: filter.date.mode === "range" ? filter.date.to : "" },
                          })
                        }
                        className={`mt-1 ${filterControl}`}
                      />
                    </label>
                    <label className="flex min-w-0 flex-col text-xs text-ink-muted">
                      To
                      <input
                        type="date"
                        data-testid="log-filter-to"
                        value={filter.date.to}
                        min={filter.date.from || undefined}
                        onChange={(e) =>
                          setFilter({
                            ...filter,
                            date: { mode: "range", from: filter.date.mode === "range" ? filter.date.from : "", to: e.target.value },
                          })
                        }
                        className={`mt-1 ${filterControl}`}
                      />
                    </label>
                  </>
                ) : null}
                <label className="flex min-w-0 max-w-full flex-col text-xs text-ink-muted">
                  Account
                  <select
                    data-testid="log-filter-account"
                    value={accountId}
                    onChange={(e) => setFilter({ ...filter, accountId: e.target.value })}
                    className={`mt-1 max-w-full ${filterControl}`}
                  >
                    <option value="">All accounts</option>
                    {accountOptions.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                {filtered ? (
                  <button
                    type="button"
                    data-testid="log-filter-clear"
                    onClick={() => setFilter(DEFAULT_ACTIVITY_FILTER)}
                    className="min-h-10 rounded-full px-3 text-sm font-semibold text-ink-muted underline-offset-2 hover:text-ink hover:underline"
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
              {filtered ? (
                <p className="text-sm text-ink-muted" data-testid="log-filter-summary" aria-live="polite">
                  <span className="font-semibold text-ink">
                    {shownTotals.count} matching
                  </span>
                  {" · "}
                  <span className="text-ok">+{php(shownTotals.moneyIn)} in</span>
                  {" · "}
                  <span>−{php(shownTotals.moneyOut)} out</span>
                </p>
              ) : null}
            </div>
          ) : null}

          {rows.length === 0 && !filtered ? (
            <p className="sheet-empty">
              Tap Add expense for gastos, or Log money for payday and bills.
            </p>
          ) : shown.length === 0 ? (
            <p className="sheet-empty">
              {filtered ? "Nothing matches these filters." : "Nothing of this kind this month."}
            </p>
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
                  const flow = txFlow(tx, accountId);
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
                        <span
                          data-testid="log-row-meta"
                          className="col-start-1 row-start-2 min-w-0 truncate text-xs text-ink-muted md:row-start-1 md:text-sm"
                        >
                          {tx.date}
                          <span className="md:hidden">
                            {" · "}
                            {meta.categoryName || kindLabel(tx.kind)}
                            {meta.account ? ` · ${meta.account}` : ""}
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
                          className={`col-start-2 row-span-2 row-start-1 text-right font-display font-semibold tabular-nums md:col-start-4 md:row-span-1 ${flowColor(flow)}`}
                        >
                          <SignedAmount flow={flow} amount={tx.amount} />
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

function flowColor(flow: Flow): string {
  return flow === "in" ? "text-ok" : flow === "neutral" ? "text-ink-muted" : "text-ink";
}

/** "+₱100" in, "−₱100" out, "⇄ ₱100" for moves between your own wallets. */
function SignedAmount({ flow, amount }: { flow: Flow; amount: number }) {
  return (
    <>
      <span className="sr-only">
        {flow === "in" ? "Money in " : flow === "out" ? "Money out " : "Moved between your accounts "}
      </span>
      {flow === "in" ? "+" : flow === "out" ? "−" : <span aria-hidden>⇄ </span>}
      {php(amount)}
    </>
  );
}

function TransactionDetails({ tx }: { tx: Transaction }) {
  const { state } = useFinance();
  const meta = rowMeta(state, tx);
  const flow = txFlow(tx);
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
        className={`font-display text-3xl font-semibold tabular-nums ${flowColor(flow)}`}
        data-testid="log-panel-amount"
      >
        <SignedAmount flow={flow} amount={tx.amount} />
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
  const account = accountFlowLabel(tx, (id) => accountName(state, id));
  const bits = [account, tx.note].filter(Boolean);
  return {
    particular: particular || (walletTransfer ? "Transfer" : ""),
    categoryName,
    account,
    subtitle: bits.join(" · "),
  };
}
