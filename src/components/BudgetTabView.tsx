"use client";

import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { PeriodBudgetView } from "@/components/PeriodBudgetView";
import { useFinance } from "@/context/FinanceContext";
import { emptyCategory } from "@/lib/defaults";
import { monthKey as currentMonthKey, uid } from "@/lib/money";
import {
  addMonthsToKey,
  hasBudgetErrors,
  monthBounds,
  monthTitle,
  periodsForMonth,
  previousBudgetMonth,
  validateNewBudget,
  type NewBudgetErrors,
  type NewBudgetInput,
} from "@/lib/periodBudget";
import type { Category } from "@/lib/types";

/**
 * Budget tab: one calendar month at a time, the current month first.
 * Targets are set here; spending comes from Activity.
 */
export function BudgetTabView({
  startWithForm = false,
  onStartConsumed,
}: {
  /** Open "Set monthly budget" for this month (asked for from a quick action). */
  startWithForm?: boolean;
  onStartConsumed?: () => void;
} = {}) {
  const { state, copyMonthPlan } = useFinance();
  const thisMonth = currentMonthKey();
  const [month, setMonth] = useState(thisMonth);
  const [formOpen, setFormOpen] = useState(
    () => startWithForm && periodsForMonth(state, thisMonth).length === 0,
  );
  const [status, setStatus] = useState("");

  // A quick action asked again while this page is open (adjust during render).
  const [lastStart, setLastStart] = useState(startWithForm);
  if (startWithForm !== lastStart) {
    setLastStart(startWithForm);
    if (startWithForm) {
      setMonth(thisMonth);
      if (periodsForMonth(state, thisMonth).length === 0) setFormOpen(true);
    }
  }
  useEffect(() => {
    if (startWithForm) onStartConsumed?.();
  }, [startWithForm, onStartConsumed]);

  const periods = useMemo(() => periodsForMonth(state, month), [state, month]);
  const previous = useMemo(() => previousBudgetMonth(state, month), [state, month]);
  const title = monthTitle(month);

  function go(delta: number) {
    setMonth((m) => addMonthsToKey(m, delta));
    setStatus("");
  }

  function copy() {
    if (!previous) return;
    copyMonthPlan(previous, month);
    setStatus(
      `Copied limits, expected income and bills from ${monthTitle(previous)}. Spending starts from your ${title} activity.`,
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2 sm:flex-none sm:justify-start" role="group" aria-label="Choose month">
        <button
          type="button"
          onClick={() => go(-1)}
          className="min-h-11 rounded-full border border-ink/20 bg-white px-3 text-sm font-semibold hover:bg-paper-soft"
          data-testid="budget-prev-month"
        >
          <span aria-hidden="true">‹ </span>Previous<span className="sr-only"> month</span>
        </button>
        <p className="min-w-0 text-center font-display text-lg font-semibold sm:min-w-44" aria-live="polite" data-testid="budget-month">
          {title}
        </p>
        <button
          type="button"
          onClick={() => go(1)}
          className="min-h-11 rounded-full border border-ink/20 bg-white px-3 text-sm font-semibold hover:bg-paper-soft"
          data-testid="budget-next-month"
        >
          Next<span className="sr-only"> month</span>
          <span aria-hidden="true"> ›</span>
        </button>
      </div>
      {month !== thisMonth ? (
        <button
          type="button"
          onClick={() => {
            setMonth(thisMonth);
            setStatus("");
          }}
          className="min-h-11 text-sm font-semibold underline-offset-2 hover:underline"
        >
          Back to this month
        </button>
      ) : null}
      </div>

      <p role="status" className="text-sm text-ink-muted empty:hidden">
        {status}
      </p>

      {periods.length === 0 ? (
        <section
          className="max-w-2xl space-y-3 rounded-2xl border border-paper-line bg-white/80 p-5"
          aria-labelledby="budget-empty-heading"
          data-testid="budget-empty"
        >
          <h2 id="budget-empty-heading" className="font-display text-xl font-semibold">
            Set your budget for {title}
          </h2>
          <p className="text-sm text-ink-muted">
            Choose a few categories and how much you want to spend on each. Spending fills in
            from your Activity.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="rounded-full bg-ink px-5 py-3 text-base font-semibold text-paper"
              data-testid="budget-set"
            >
              Set monthly budget
            </button>
            {previous ? (
              <button
                type="button"
                onClick={copy}
                className="rounded-full border border-ink/20 px-5 py-3 text-base font-semibold"
                data-testid="budget-copy"
              >
                {previous === addMonthsToKey(month, -1)
                  ? "Copy last month"
                  : `Copy ${monthTitle(previous)}`}
              </button>
            ) : null}
          </div>
          {previous ? (
            <p className="text-xs text-ink-muted">
              Copying brings over limits, expected income and bills only — not spending or
              what was paid.
            </p>
          ) : null}
        </section>
      ) : (
        periods.map((p) => <PeriodBudgetView key={p.id} periodId={p.id} />)
      )}

      {formOpen ? (
        <BudgetForm
          monthKey={month}
          onClose={() => setFormOpen(false)}
          onCreated={() => {
            setFormOpen(false);
            setStatus(`Budget for ${title} saved.`);
          }}
        />
      ) : null}
    </div>
  );
}

type LimitDraft = { key: string; categoryId: string; newName: string; amount: string };
type BillDraft = { key: string; name: string; amount: string; due: string };

const NEW_CATEGORY = "__new";
const inputClass =
  "mt-1 w-full rounded-xl border border-paper-line bg-white px-3 py-2.5 text-base text-ink aria-[invalid=true]:border-danger";

function BudgetForm({
  monthKey,
  onClose,
  onCreated,
}: {
  monthKey: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { state, upsertCategory, createMonthBudget } = useFinance();
  // One id per opened form: a double tap or resubmit never makes two budgets.
  const budgetId = useRef(uid());
  const submitted = useRef(false);
  const ids = useId();
  const [limits, setLimits] = useState<LimitDraft[]>([
    { key: uid(), categoryId: "", newName: "", amount: "" },
  ]);
  const [income, setIncome] = useState("");
  const [bills, setBills] = useState<BillDraft[]>([]);
  const [custom, setCustom] = useState(false);
  const bounds = monthBounds(monthKey);
  const [start, setStart] = useState(bounds.start);
  const [end, setEnd] = useState(bounds.end);
  const [errors, setErrors] = useState<NewBudgetErrors & { newName?: Record<number, string> }>({});

  const categories = state.categories.filter((c) => (c.kind ?? "expense") !== "income");

  function patchLimit(i: number, patch: Partial<LimitDraft>) {
    setLimits((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function patchBill(i: number, patch: Partial<BillDraft>) {
    setBills((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (submitted.current) return;

    // New categories typed inline are created together with the budget.
    const created: Category[] = [];
    const newNameErrors: Record<number, string> = {};
    const limitInputs = limits.map((row, i) => {
      if (row.categoryId !== NEW_CATEGORY) return { categoryId: row.categoryId, amount: row.amount };
      const name = row.newName.trim();
      if (!name) {
        newNameErrors[i] = "Name the new category.";
        return { categoryId: "", amount: row.amount };
      }
      const existing =
        categories.find((c) => c.name.trim().toLowerCase() === name.toLowerCase()) ??
        created.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (existing) return { categoryId: existing.id, amount: row.amount };
      const category = emptyCategory(name, "expense", "default");
      created.push(category);
      return { categoryId: category.id, amount: row.amount };
    });

    const input: NewBudgetInput = {
      id: budgetId.current,
      monthKey,
      limits: limitInputs,
      expectedIncome: income,
      bills: bills.map(({ name, amount, due }) => ({ name, amount, due })),
      custom: custom ? { start, end } : null,
    };
    const found = validateNewBudget(
      { ...state, categories: [...state.categories, ...created] },
      input,
    );
    if (Object.keys(newNameErrors).length) {
      found.limits = { ...(found.limits ?? {}) };
      for (const i of Object.keys(newNameErrors)) {
        const n = Number(i);
        found.limits[n] = { ...found.limits[n], category: undefined };
      }
    }
    const allErrors = { ...found, newName: newNameErrors };
    setErrors(allErrors);
    if (hasBudgetErrors(found) || Object.keys(newNameErrors).length) return;

    submitted.current = true;
    for (const category of created) upsertCategory(category);
    createMonthBudget(input);
    onCreated();
  }

  const describe = (id: string, has: unknown) =>
    has ? { "aria-invalid": true as const, "aria-describedby": id } : {};

  return (
    <Modal open title={`Budget for ${monthTitle(monthKey)}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5" noValidate data-testid="budget-form">
        {errors.form ? (
          <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
            {errors.form}
          </p>
        ) : null}

        <fieldset className="space-y-3">
          <legend className="text-base font-semibold">Spending limits</legend>
          <p className="text-sm text-ink-muted">Start with one category. You can add more later.</p>
          {limits.map((row, i) => {
            const e = errors.limits?.[i];
            const nameErr = errors.newName?.[i];
            return (
              <div key={row.key} className="space-y-2 rounded-xl border border-paper-line bg-white p-3">
                <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
                  <label className="block text-sm font-semibold text-ink">
                    Category
                    <select
                      value={row.categoryId}
                      onChange={(ev) => patchLimit(i, { categoryId: ev.target.value })}
                      className={inputClass}
                      data-testid="budget-form-category"
                      {...describe(`${ids}-cat-${i}`, e?.category)}
                    >
                      <option value="">Choose a category</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                      <option value={NEW_CATEGORY}>New category…</option>
                    </select>
                    {e?.category ? (
                      <span id={`${ids}-cat-${i}`} className="mt-1 block text-sm text-danger">
                        {e.category}
                      </span>
                    ) : null}
                  </label>
                  <label className="block text-sm font-semibold text-ink">
                    Spending limit
                    <input
                      inputMode="decimal"
                      value={row.amount}
                      onChange={(ev) => patchLimit(i, { amount: ev.target.value })}
                      placeholder="₱"
                      className={inputClass}
                      data-testid="budget-form-limit"
                      {...describe(`${ids}-amt-${i}`, e?.amount)}
                    />
                    {e?.amount ? (
                      <span id={`${ids}-amt-${i}`} className="mt-1 block text-sm text-danger">
                        {e.amount}
                      </span>
                    ) : null}
                  </label>
                </div>
                {row.categoryId === NEW_CATEGORY ? (
                  <label className="block text-sm font-semibold text-ink">
                    New category name
                    <input
                      value={row.newName}
                      onChange={(ev) => patchLimit(i, { newName: ev.target.value })}
                      className={inputClass}
                      {...describe(`${ids}-new-${i}`, nameErr)}
                    />
                    {nameErr ? (
                      <span id={`${ids}-new-${i}`} className="mt-1 block text-sm text-danger">
                        {nameErr}
                      </span>
                    ) : null}
                  </label>
                ) : null}
                {limits.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setLimits((rows) => rows.filter((_, j) => j !== i))}
                    className="text-sm font-semibold text-ink-muted underline-offset-2 hover:underline"
                  >
                    Remove this category
                  </button>
                ) : null}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() =>
              setLimits((rows) => [...rows, { key: uid(), categoryId: "", newName: "", amount: "" }])
            }
            className="rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold"
          >
            Add another category
          </button>
        </fieldset>

        <label className="block text-sm font-semibold text-ink">
          Expected income <span className="font-normal text-ink-muted">(optional)</span>
          <input
            inputMode="decimal"
            value={income}
            onChange={(ev) => setIncome(ev.target.value)}
            placeholder="₱"
            className={inputClass}
            {...describe(`${ids}-income`, errors.expectedIncome)}
          />
          {errors.expectedIncome ? (
            <span id={`${ids}-income`} className="mt-1 block text-sm text-danger">
              {errors.expectedIncome}
            </span>
          ) : null}
        </label>

        <fieldset className="space-y-3">
          <legend className="text-base font-semibold">
            Planned bills <span className="text-sm font-normal text-ink-muted">(optional)</span>
          </legend>
          {bills.map((bill, i) => {
            const e = errors.bills?.[i];
            return (
              <div key={bill.key} className="space-y-2 rounded-xl border border-paper-line bg-white p-3">
                <label className="block text-sm font-semibold text-ink">
                  Bill name
                  <input
                    value={bill.name}
                    onChange={(ev) => patchBill(i, { name: ev.target.value })}
                    placeholder="e.g. Electricity"
                    className={inputClass}
                    {...describe(`${ids}-bn-${i}`, e?.name)}
                  />
                  {e?.name ? (
                    <span id={`${ids}-bn-${i}`} className="mt-1 block text-sm text-danger">
                      {e.name}
                    </span>
                  ) : null}
                </label>
                <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
                  <label className="block text-sm font-semibold text-ink">
                    Amount
                    <input
                      inputMode="decimal"
                      value={bill.amount}
                      onChange={(ev) => patchBill(i, { amount: ev.target.value })}
                      placeholder="₱"
                      className={inputClass}
                      {...describe(`${ids}-ba-${i}`, e?.amount)}
                    />
                    {e?.amount ? (
                      <span id={`${ids}-ba-${i}`} className="mt-1 block text-sm text-danger">
                        {e.amount}
                      </span>
                    ) : null}
                  </label>
                  <label className="block text-sm font-semibold text-ink">
                    Due date
                    <input
                      type="date"
                      value={bill.due}
                      onChange={(ev) => patchBill(i, { due: ev.target.value })}
                      className={inputClass}
                      {...describe(`${ids}-bd-${i}`, e?.due)}
                    />
                    {e?.due ? (
                      <span id={`${ids}-bd-${i}`} className="mt-1 block text-sm text-danger">
                        {e.due}
                      </span>
                    ) : null}
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => setBills((rows) => rows.filter((_, j) => j !== i))}
                  className="text-sm font-semibold text-ink-muted underline-offset-2 hover:underline"
                >
                  Remove this bill
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setBills((rows) => [...rows, { key: uid(), name: "", amount: "", due: "" }])}
            className="rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold"
          >
            Add a bill
          </button>
        </fieldset>

        <details className="rounded-xl border border-paper-line bg-white px-3 py-2">
          <summary className="cursor-pointer py-1 text-sm font-semibold">Advanced options</summary>
          <div className="mt-2 space-y-3">
            <p className="text-sm text-ink-muted">
              The budget covers {monthTitle(monthKey)} ({bounds.start} to {bounds.end}). Use
              custom dates only if you budget by paycheck.
            </p>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={custom} onChange={(ev) => setCustom(ev.target.checked)} />
              Use custom dates
            </label>
            {custom ? (
              <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
                <label className="block text-sm font-semibold text-ink">
                  Start date
                  <input
                    type="date"
                    value={start}
                    onChange={(ev) => setStart(ev.target.value)}
                    className={inputClass}
                    {...describe(`${ids}-custom`, errors.custom)}
                  />
                </label>
                <label className="block text-sm font-semibold text-ink">
                  End date
                  <input
                    type="date"
                    value={end}
                    onChange={(ev) => setEnd(ev.target.value)}
                    className={inputClass}
                    {...describe(`${ids}-custom`, errors.custom)}
                  />
                </label>
                {errors.custom ? (
                  <span id={`${ids}-custom`} className="block text-sm text-danger min-[400px]:col-span-2">
                    {errors.custom}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </details>

        <p role="status" className="text-sm text-danger empty:hidden">
          {hasBudgetErrors(errors) || Object.keys(errors.newName ?? {}).length
            ? "Check the highlighted fields."
            : ""}
        </p>
        <button
          type="submit"
          className="w-full rounded-full bg-ink px-4 py-3 text-base font-semibold text-paper"
          data-testid="budget-form-save"
        >
          Save budget
        </button>
      </form>
    </Modal>
  );
}
