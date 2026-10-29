"use client";

import { FormEvent, useId, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { DetailList, SidePanel, panelDanger, panelPrimary } from "@/components/SidePanel";
import { useFinance } from "@/context/FinanceContext";
import { parseAmount, phpSmart } from "@/lib/money";
import {
  deriveBudget,
  legacyEntriesToReview,
  newBudgetRow,
  nextRowOrder,
  periodLabel,
  reconcileLegacyActuals,
  saveBudgetRow,
  shortDue,
  txCategoryId,
  type BudgetCategoryRow,
  type LegacyActualItem,
} from "@/lib/periodBudget";
import { particularLabel } from "@/lib/refs";
import type { BudgetLine, BudgetLineType, Transaction } from "@/lib/types";

const fieldClass =
  "mt-1 w-full rounded-xl border border-paper-line bg-white px-3 py-2.5 text-base text-ink aria-[invalid=true]:border-danger";

/** "₱X left" or "₱X over": said in words, never by colour alone. */
export function leftText(left: number): string {
  return left < 0 ? `${phpSmart(-left)} over` : `${phpSmart(left)} left`;
}

type Editor =
  | { kind: "limit"; row?: BudgetCategoryRow }
  | { kind: "bill"; line?: BudgetLine }
  | { kind: "income"; line?: BudgetLine };

type Detail = { kind: "category"; categoryId: string } | { kind: "bill"; lineId: string };

/**
 * One budget: targets (limits, bills, expected income) with spending derived
 * from Activity. Nothing here asks for amounts that already happened.
 * Rows open a details panel; forms open over the page.
 */
export function PeriodBudgetView({ periodId }: { periodId: string }) {
  const { state, updateState, removeBudgetLine, upsertBudgetPeriod, removeBudgetPeriod, reviewLegacyEntry } =
    useFinance();
  const budget = useMemo(() => deriveBudget(state, periodId), [state, periodId]);
  const legacy = useMemo(() => legacyEntriesToReview(state, periodId), [state, periodId]);
  const reconciledCount = useMemo(
    () => reconcileLegacyActuals(state, periodId).filter((i) => i.status === "reconciled").length,
    [state, periodId],
  );
  const [editor, setEditor] = useState<Editor | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const headingId = useId();

  if (!budget) return null;
  const { period } = budget;
  const lineById = (id: string) => state.budgetLines.find((l) => l.id === id);
  const billIds = new Set(budget.bills.map((b) => b.lineId));

  const detailCategory =
    detail?.kind === "category"
      ? budget.categories.find((c) => c.categoryId === detail.categoryId)
      : undefined;
  const detailBill =
    detail?.kind === "bill" ? budget.bills.find((b) => b.lineId === detail.lineId) : undefined;

  function confirmRemove(ids: string[], linkedBill: boolean) {
    const msg = linkedBill
      ? "Remove this bill? Expenses linked to it stay in Activity and count by category."
      : "Remove this from the budget? Your Activity stays as it is.";
    if (!window.confirm(msg)) return;
    for (const id of ids) removeBudgetLine(id);
    setDetail(null);
  }

  return (
    <section aria-labelledby={headingId} className="space-y-4" data-testid="budget-active">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 id={headingId} className="font-display text-lg font-semibold">
            {budget.fullMonth ? "Monthly budget" : `Budget for ${periodLabel(period.start, period.end)}`}
          </h3>
          <p className="text-sm text-ink-muted">
            Spent comes from your Activity. Add an expense there and it shows up here.
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-2 lg:w-[30rem]" aria-live="polite">
          <Stat label="Budget" value={phpSmart(budget.budget)} testId="budget-total" />
          <Stat label="Spent" value={phpSmart(budget.spent)} testId="budget-spent" />
          <Stat
            label={budget.left < 0 ? "Over" : "Left"}
            value={phpSmart(Math.abs(budget.left))}
            testId="budget-left"
            warn={budget.left < 0}
          />
        </dl>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Categories */}
        <div className="space-y-3 rounded-2xl border border-paper-line bg-white/80 p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
              Spending by category
            </h4>
            <button
              type="button"
              onClick={() => setEditor({ kind: "limit" })}
              className="min-h-10 rounded-full border border-ink/20 bg-white px-3 text-sm font-semibold hover:bg-paper-soft"
            >
              Add category
            </button>
          </div>
          {budget.categories.length === 0 ? (
            <p className="text-sm text-ink-muted">No category limits yet.</p>
          ) : (
            <ul className="divide-y divide-paper-line overflow-hidden rounded-xl border border-paper-line bg-white">
              {budget.categories.map((row) => (
                <li key={row.categoryId} data-testid="budget-category">
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => setDetail({ kind: "category", categoryId: row.categoryId })}
                    className="block w-full space-y-2 px-3 py-3 text-left hover:bg-paper-soft/60"
                  >
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="font-semibold">{row.name}</span>
                      <span
                        className={`text-sm font-semibold ${row.left < 0 ? "text-danger" : "text-ink"}`}
                        data-testid="budget-category-left"
                      >
                        {leftText(row.left)}
                      </span>
                    </span>
                    <ProgressBar spent={row.spent} limit={row.limit} />
                    <span className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
                      <span>
                        Limit {phpSmart(row.limit)} · Spent {phpSmart(row.spent)}
                      </span>
                      <span aria-hidden className="text-xs font-semibold text-ink">
                        Details ›
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {budget.unbudgeted.total > 0 ? (
            <div className="rounded-xl border border-dashed border-paper-line bg-white px-3 py-3" data-testid="budget-unbudgeted">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">Unbudgeted spending</p>
                <p className="text-sm font-semibold">{phpSmart(budget.unbudgeted.total)}</p>
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                Spending in categories without a limit:{" "}
                {budget.unbudgeted.rows.map((r) => `${r.name} ${phpSmart(r.amount)}`).join(", ")}.
              </p>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          {/* Bills */}
          <div className="space-y-3 rounded-2xl border border-paper-line bg-white/80 p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
                Planned bills
              </h4>
              <button
                type="button"
                onClick={() => setEditor({ kind: "bill" })}
                className="min-h-10 rounded-full border border-ink/20 bg-white px-3 text-sm font-semibold hover:bg-paper-soft"
              >
                Add bill
              </button>
            </div>
            {budget.bills.length === 0 ? (
              <p className="text-sm text-ink-muted">No planned bills.</p>
            ) : (
              <>
                <ul className="divide-y divide-paper-line overflow-hidden rounded-xl border border-paper-line bg-white">
                  {budget.bills.map((bill) => (
                    <li key={bill.lineId}>
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        onClick={() => setDetail({ kind: "bill", lineId: bill.lineId })}
                        className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-3 text-left hover:bg-paper-soft/60"
                      >
                        <span className="min-w-0">
                          <span className="block font-semibold">{bill.name}</span>
                          <span className="block text-sm text-ink-muted">
                            {bill.due ? `Due ${shortDue(bill.due)} · ` : ""}
                            {phpSmart(bill.amount)}
                          </span>
                        </span>
                        <BillStatus paid={bill.paid} paidAmount={bill.paidAmount} />
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-ink-muted">
                  A bill shows as paid when you add the expense in Activity and choose this bill.
                </p>
              </>
            )}
          </div>

          {/* Income */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-paper-line bg-white/80 p-4">
            <div>
              <p className="font-semibold">Expected income</p>
              <p className="text-sm text-ink-muted">
                {budget.income.length
                  ? `${phpSmart(budget.expectedIncome)} expected · ${phpSmart(budget.incomeReceived)} received`
                  : `Not set · ${phpSmart(budget.incomeReceived)} received`}
              </p>
              {budget.income.length > 1 ? (
                <ul className="mt-1 text-sm text-ink-muted">
                  {budget.income.map((i) => (
                    <li key={i.lineId}>
                      {i.name}: {phpSmart(i.amount)}{" "}
                      <button
                        type="button"
                        className="font-semibold text-ink underline-offset-2 hover:underline"
                        onClick={() => {
                          const line = lineById(i.lineId);
                          if (line) setEditor({ kind: "income", line });
                        }}
                        aria-label={`Edit expected income ${i.name}`}
                      >
                        Edit
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {budget.income.length <= 1 ? (
              <button
                type="button"
                onClick={() =>
                  setEditor({
                    kind: "income",
                    line: budget.income[0] ? lineById(budget.income[0].lineId) : undefined,
                  })
                }
                className="min-h-10 rounded-full border border-ink/20 bg-white px-3 text-sm font-semibold hover:bg-paper-soft"
              >
                {budget.income.length ? "Edit" : "Add"}
                <span className="sr-only"> expected income</span>
              </button>
            ) : null}
          </div>

          {/* Repayments + cash out */}
          <div className="space-y-2 rounded-2xl border border-paper-line bg-white/80 p-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2" data-testid="budget-repayments">
              <p className="font-semibold">Loan &amp; card repayments</p>
              <p className="font-semibold">{phpSmart(budget.repayments.total)}</p>
            </div>
            <div className="flex flex-wrap justify-between gap-2 border-t border-paper-line pt-2">
              <p className="font-semibold">Total cash out</p>
              <p className="font-semibold" data-testid="budget-cash-out">
                {phpSmart(budget.cashOut)}
              </p>
            </div>
            <details className="text-ink-muted">
              <summary className="cursor-pointer py-1 font-semibold text-ink">What counts here?</summary>
              <p className="mt-1">
                Paying a loan or card is not new spending, so it is not in Spent. Things you bought
                on credit already count when you bought them. Total cash out is Spent plus
                repayments, each counted once.
              </p>
            </details>
          </div>

          {legacy.length > 0 ? (
            <LegacySection items={legacy} onReview={reviewLegacyEntry} reconciledCount={reconciledCount} />
          ) : null}

          <AdvancedOptions
            start={period.start}
            end={period.end}
            onSaveDates={(start, end) => upsertBudgetPeriod({ ...period, start, end })}
            onDelete={() => {
              const note = legacy.length
                ? " Earlier manual entries saved in it are removed too; export a backup first if you want to keep them."
                : "";
              if (window.confirm(`Delete this budget? Your Activity stays as it is.${note}`)) {
                removeBudgetPeriod(period.id);
              }
            }}
          />
        </div>
      </div>

      <SidePanel
        open={Boolean(detailCategory)}
        eyebrow="Budget category"
        title={detailCategory?.name ?? ""}
        onClose={() => setDetail(null)}
        testId="budget-category-panel"
        footer={
          detailCategory ? (
            <>
              <button
                type="button"
                className={panelPrimary}
                onClick={() => setEditor({ kind: "limit", row: detailCategory })}
              >
                Edit limit
              </button>
              <button
                type="button"
                className={panelDanger}
                onClick={() => confirmRemove(detailCategory.lineIds, false)}
              >
                Remove
              </button>
            </>
          ) : null
        }
      >
        {detailCategory ? (
          <div className="space-y-4">
            <DetailList
              items={[
                { label: "Spending limit", value: phpSmart(detailCategory.limit) },
                { label: "Spent", value: phpSmart(detailCategory.spent) },
                { label: detailCategory.left < 0 ? "Over by" : "Left", value: leftText(detailCategory.left) },
              ]}
            />
            <ProgressBar spent={detailCategory.spent} limit={detailCategory.limit} />
            <ActivityList
              title="Spending counted here"
              empty="No spending in this category yet."
              rows={state.transactions.filter(
                (tx) =>
                  tx.kind === "expense" &&
                  tx.date >= period.start &&
                  tx.date <= period.end &&
                  !(tx.budgetLineId && billIds.has(tx.budgetLineId)) &&
                  txCategoryId(state, tx) === detailCategory.categoryId,
              )}
            />
          </div>
        ) : null}
      </SidePanel>

      <SidePanel
        open={Boolean(detailBill)}
        eyebrow="Planned bill"
        title={detailBill?.name ?? ""}
        onClose={() => setDetail(null)}
        testId="budget-bill-panel"
        footer={
          detailBill ? (
            <>
              <button
                type="button"
                className={panelPrimary}
                onClick={() => {
                  const line = lineById(detailBill.lineId);
                  if (line) setEditor({ kind: "bill", line });
                }}
              >
                Edit bill
              </button>
              <button
                type="button"
                className={panelDanger}
                onClick={() =>
                  confirmRemove(
                    [detailBill.lineId],
                    state.transactions.some((t) => t.budgetLineId === detailBill.lineId),
                  )
                }
              >
                Remove
              </button>
            </>
          ) : null
        }
      >
        {detailBill ? (
          <div className="space-y-4">
            <DetailList
              items={[
                { label: "Amount", value: phpSmart(detailBill.amount) },
                { label: "Due", value: detailBill.due ? shortDue(detailBill.due) : "No due date" },
                {
                  label: "Status",
                  value: <BillStatus paid={detailBill.paid} paidAmount={detailBill.paidAmount} />,
                },
              ]}
            />
            <ActivityList
              title="Linked activity"
              empty="Nothing linked yet. Add the expense in Activity and choose this bill to mark it paid."
              rows={state.transactions.filter((tx) => tx.budgetLineId === detailBill.lineId)}
            />
          </div>
        ) : null}
      </SidePanel>

      <RowEditor
        key={editorKey(editor)}
        editor={editor}
        periodStart={period.start}
        periodEnd={period.end}
        existingCategoryIds={budget.categories.map((c) => c.categoryId)}
        onClose={() => setEditor(null)}
        onSave={(line, removeIds) => {
          updateState((prev) => {
            let next = saveBudgetRow(prev, {
              ...line,
              order: prev.budgetLines.some((l) => l.id === line.id)
                ? line.order
                : nextRowOrder(prev, period.id),
            });
            if (removeIds.length) {
              next = { ...next, budgetLines: next.budgetLines.filter((l) => !removeIds.includes(l.id)) };
            }
            return next;
          });
          setEditor(null);
        }}
        onRemove={(ids) => {
          for (const id of ids) removeBudgetLine(id);
          setEditor(null);
          setDetail(null);
        }}
        periodId={period.id}
      />
    </section>
  );
}

function ProgressBar({ spent, limit }: { spent: number; limit: number }) {
  const over = spent > limit;
  return (
    <span className="block h-2 overflow-hidden rounded-full bg-paper-soft" aria-hidden="true">
      <span
        className={`block h-full ${over ? "bg-danger" : "bg-ok"}`}
        style={{
          width: `${limit > 0 ? Math.min(100, (spent / limit) * 100) : spent > 0 ? 100 : 0}%`,
        }}
      />
    </span>
  );
}

function BillStatus({ paid, paidAmount }: { paid: boolean; paidAmount: number }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
        paid ? "bg-ok/15 text-ink" : "bg-paper-soft text-ink-muted"
      }`}
    >
      {paid ? `Paid ${phpSmart(paidAmount)}` : "Not paid yet"}
    </span>
  );
}

function ActivityList({ title, empty, rows }: { title: string; empty: string; rows: Transaction[] }) {
  const { state } = useFinance();
  const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</h3>
      {sorted.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-paper-line rounded-xl border border-paper-line bg-white">
          {sorted.map((tx) => (
            <li key={tx.id} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  {particularLabel(state.particulars, tx.particularId, tx.particular) || tx.note || "Expense"}
                </span>
                <span className="block text-xs text-ink-muted">{shortDue(tx.date)}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{phpSmart(tx.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function editorKey(editor: Editor | null): string {
  if (!editor) return "closed";
  if (editor.kind === "limit") return `limit-${editor.row?.categoryId ?? "new"}`;
  return `${editor.kind}-${editor.line?.id ?? "new"}`;
}

function Stat({
  label,
  value,
  testId,
  warn,
}: {
  label: string;
  value: string;
  testId: string;
  warn?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-paper-line bg-white px-2.5 py-2.5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd
        className={`mt-0.5 break-words font-display text-base font-semibold sm:text-lg ${warn ? "text-danger" : ""}`}
        data-testid={testId}
      >
        {value}
      </dd>
    </div>
  );
}

function LegacySection({
  items,
  reconciledCount,
  onReview,
}: {
  items: LegacyActualItem[];
  reconciledCount: number;
  onReview: (lineId: string, review: "kept" | "hidden" | null) => void;
}) {
  const [showHidden, setShowHidden] = useState(false);
  const visible = items.filter((i) => showHidden || i.review !== "hidden");
  const hiddenCount = items.filter((i) => i.review === "hidden").length;
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="space-y-2 rounded-2xl border border-gold-line bg-gold-soft/30 p-4"
      data-testid="budget-legacy"
    >
      <h4 id={headingId} className="font-semibold">
        Earlier manual entries (not from your activity)
      </h4>
      <p className="text-sm text-ink-muted">
        These amounts were typed in by hand before spending came from Activity. They are kept as
        they were but are not added to Spent. Keep each as a note or hide it.
        {reconciledCount
          ? ` ${reconciledCount} other earlier ${reconciledCount === 1 ? "entry matches" : "entries match"} linked activity and needs nothing.`
          : ""}
      </p>
      {visible.length === 0 ? (
        <p className="text-sm text-ink-muted">All earlier entries here are hidden.</p>
      ) : (
        <ul className="divide-y divide-paper-line rounded-lg border border-paper-line bg-white">
          {visible.map((item) => (
            <li key={item.lineId} className="space-y-2 px-3 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{item.name}</p>
                <p className="text-sm font-semibold">Typed {phpSmart(item.actual)}</p>
              </div>
              <p className="text-sm text-ink-muted">
                {item.due ? `Dated ${shortDue(item.due)}. ` : ""}
                {item.status === "mismatch"
                  ? `Linked activity adds up to ${phpSmart(item.linkedTotal)}, not the typed amount.`
                  : "No activity is linked to it."}
                {item.review === "kept" ? " Kept as a note." : ""}
                {item.review === "hidden" ? " Hidden." : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                {item.review === "kept" ? null : (
                  <button
                    type="button"
                    onClick={() => onReview(item.lineId, "kept")}
                    className="rounded-full border border-ink/20 px-3 py-1.5 text-sm font-semibold"
                  >
                    Keep as note
                  </button>
                )}
                {item.review === "hidden" ? (
                  <button
                    type="button"
                    onClick={() => onReview(item.lineId, null)}
                    className="rounded-full border border-ink/20 px-3 py-1.5 text-sm font-semibold"
                  >
                    Show again
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onReview(item.lineId, "hidden")}
                    className="rounded-full border border-ink/20 px-3 py-1.5 text-sm font-semibold"
                  >
                    Hide
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setShowHidden((v) => !v)}
          aria-expanded={showHidden}
          className="text-sm font-semibold underline-offset-2 hover:underline"
        >
          {showHidden ? "Hide hidden entries" : `Show hidden entries (${hiddenCount})`}
        </button>
      ) : null}
    </section>
  );
}

function AdvancedOptions({
  start,
  end,
  onSaveDates,
  onDelete,
}: {
  start: string;
  end: string;
  onSaveDates: (start: string, end: string) => void;
  onDelete: () => void;
}) {
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(end);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const errorId = useId();

  function save(event: FormEvent) {
    event.preventDefault();
    setSaved("");
    if (!from || !to) return setError("Choose a start and end date.");
    if (to < from) return setError("The end date must be on or after the start date.");
    setError("");
    onSaveDates(from, to);
    setSaved("Dates saved.");
  }

  return (
    <details className="rounded-2xl border border-paper-line bg-white/80 px-4 py-2">
      <summary className="cursor-pointer py-2 text-sm font-semibold">Advanced options</summary>
      <form onSubmit={save} className="mt-2 space-y-3" noValidate>
        <p className="text-sm text-ink-muted">
          Budgets follow the calendar month. Change the dates only if you budget by paycheck.
        </p>
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
          <label className="block text-sm text-ink-muted">
            Start date
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={fieldClass}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
            />
          </label>
          <label className="block text-sm text-ink-muted">
            End date
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={fieldClass}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
            />
          </label>
        </div>
        {error ? (
          <p id={errorId} role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <p role="status" className="text-sm text-ink-muted">
          {saved}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold">
            Save dates
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-full border border-danger/30 px-4 py-2 text-sm font-semibold text-danger"
          >
            Delete this budget
          </button>
        </div>
      </form>
    </details>
  );
}

function RowEditor({
  editor,
  periodId,
  periodStart,
  periodEnd,
  existingCategoryIds,
  onClose,
  onSave,
  onRemove,
}: {
  editor: Editor | null;
  periodId: string;
  periodStart: string;
  periodEnd: string;
  existingCategoryIds: string[];
  onClose: () => void;
  onSave: (line: BudgetLine, removeIds: string[]) => void;
  onRemove: (ids: string[]) => void;
}) {
  const { state } = useFinance();
  const kind: BudgetLineType = editor?.kind ?? "limit";
  const editingLimit = editor?.kind === "limit" ? editor.row : undefined;
  const editingLine = editor && editor.kind !== "limit" ? editor.line : undefined;
  const firstLimitLine = editingLimit
    ? state.budgetLines.find((l) => l.id === editingLimit.lineIds[0])
    : undefined;

  const [categoryId, setCategoryId] = useState(editingLimit?.categoryId ?? "");
  const [name, setName] = useState(editingLine?.particular ?? "");
  const [due, setDue] = useState(editingLine?.due ?? "");
  const [amount, setAmount] = useState(() => {
    const n = editingLimit
      ? editingLimit.limit
      : kind === "income"
        ? editingLine?.income
        : editingLine?.expense;
    return n ? String(n) : "";
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const ids = useId();

  const categories = state.categories.filter((c) => (c.kind ?? "expense") !== "income");
  const isEdit = Boolean(editingLimit || editingLine);
  const title =
    kind === "limit"
      ? isEdit
        ? `Edit ${editingLimit?.name ?? "category"}`
        : "Add a category"
      : kind === "bill"
        ? isEdit
          ? "Edit bill"
          : "Add a bill"
        : "Expected income";

  function submit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    const parsed = parseAmount(amount);
    if (!parsed.ok) next.amount = parsed.error;
    if (kind === "limit" && !editingLimit) {
      if (!categoryId) next.category = "Choose a category.";
      else if (existingCategoryIds.includes(categoryId)) {
        next.category = "This category is already in the budget.";
      }
    }
    if (kind === "bill") {
      if (!name.trim()) next.name = "Name the bill.";
      if (!due) next.due = "Choose a due date.";
      else if (due < periodStart || due > periodEnd) next.due = "Pick a date inside this budget.";
    }
    setErrors(next);
    if (Object.keys(next).length || !parsed.ok) return;

    const value = parsed.value;
    if (kind === "limit") {
      const catId = editingLimit?.categoryId ?? categoryId;
      const catName = state.categories.find((c) => c.id === catId)?.name ?? "";
      const base =
        firstLimitLine ??
        newBudgetRow(periodId, 0, { lineType: "limit", categoryId: catId, particular: catName });
      onSave(
        { ...base, lineType: "limit", categoryId: catId, expense: value, income: 0 },
        editingLimit ? editingLimit.lineIds.slice(1) : [],
      );
    } else if (kind === "bill") {
      const base = editingLine ?? newBudgetRow(periodId, 0, { lineType: "bill" });
      onSave({ ...base, particular: name.trim(), due, expense: value, income: 0 }, []);
    } else {
      const base =
        editingLine ?? newBudgetRow(periodId, 0, { lineType: "income", particular: "Expected income" });
      onSave({ ...base, income: value, expense: 0 }, []);
    }
  }

  function remove() {
    const removeIds = editingLimit ? editingLimit.lineIds : editingLine ? [editingLine.id] : [];
    if (!removeIds.length) return;
    const linked =
      kind === "bill" && state.transactions.some((t) => t.budgetLineId === editingLine?.id);
    const msg = linked
      ? "Remove this bill? Expenses linked to it stay in Activity and count by category."
      : "Remove this from the budget? Your Activity stays as it is.";
    if (window.confirm(msg)) onRemove(removeIds);
  }

  const err = (key: string) =>
    errors[key]
      ? {
          "aria-invalid": true as const,
          "aria-describedby": `${ids}-${key}`,
        }
      : {};
  const errText = (key: string) =>
    errors[key] ? (
      <span id={`${ids}-${key}`} className="mt-1 block text-sm text-danger">
        {errors[key]}
      </span>
    ) : null;

  return (
    <Modal open={editor != null} title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {kind === "limit" && !editingLimit ? (
          <label className="block text-sm font-semibold text-ink">
            Category
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={fieldClass}
              {...err("category")}
            >
              <option value="">Choose a category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id} disabled={existingCategoryIds.includes(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
            {errText("category")}
          </label>
        ) : null}
        {kind === "bill" ? (
          <label className="block text-sm font-semibold text-ink">
            Bill name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldClass}
              placeholder="e.g. Electricity"
              {...err("name")}
            />
            {errText("name")}
          </label>
        ) : null}
        <label className="block text-sm font-semibold text-ink">
          {kind === "limit" ? "Spending limit" : kind === "bill" ? "Amount" : "Expected income"}
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={fieldClass}
            placeholder="₱"
            {...err("amount")}
          />
          {errText("amount")}
        </label>
        {kind === "bill" ? (
          <label className="block text-sm font-semibold text-ink">
            Due date
            <input
              type="date"
              value={due}
              min={periodStart}
              max={periodEnd}
              onChange={(e) => setDue(e.target.value)}
              className={fieldClass}
              {...err("due")}
            />
            {errText("due")}
          </label>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="flex-1 rounded-full bg-ink px-4 py-3 text-base font-semibold text-paper">
            Save
          </button>
          {isEdit ? (
            <button
              type="button"
              onClick={remove}
              className="rounded-full border border-danger/30 px-4 py-3 text-base font-semibold text-danger"
            >
              Remove
            </button>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}
