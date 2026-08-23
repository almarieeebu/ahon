"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { PeriodBudgetView } from "@/components/PeriodBudgetView";
import { useFinance } from "@/context/FinanceContext";
import { monthKey as currentMonthKey, phpSmart, uid } from "@/lib/money";
import {
  availableBudgetMonths,
  monthChipLabel,
  periodLabel,
  summarizeMonthBudget,
} from "@/lib/periodBudget";
import type { BudgetPeriod } from "@/lib/types";

export function BudgetTabView() {
  const { state, upsertBudgetPeriod, addBudgetLine } = useFinance();
  const months = useMemo(
    () => availableBudgetMonths(state.budgetPeriods, state.budgetLines),
    [state.budgetPeriods, state.budgetLines],
  );
  const fallback = currentMonthKey();
  const [selected, setSelected] = useState(months[0] ?? fallback);

  useEffect(() => {
    if (!months.includes(selected) && months[0]) setSelected(months[0]);
  }, [months, selected]);

  const summary = useMemo(
    () => summarizeMonthBudget(state, selected),
    [state, selected],
  );

  const [addOpen, setAddOpen] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  function closeAdd() {
    setAddOpen(false);
    setStart("");
    setEnd("");
  }

  function addPeriod(event: FormEvent) {
    event.preventDefault();
    if (!start || !end) return;
    const period: BudgetPeriod = { id: uid(), start, end };
    upsertBudgetPeriod(period);
    addBudgetLine(period.id);
    setSelected(start.slice(0, 7));
    closeAdd();
  }

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      <aside className="w-full shrink-0 lg:w-48">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Months
          </p>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="rounded-full bg-ink px-3.5 py-2 text-sm font-semibold text-paper lg:hidden"
          >
            Add period
          </button>
        </div>
        <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
          {months.length === 0 ? (
            <li className="rounded-xl border border-dashed border-paper-line px-4 py-3 text-sm text-ink-muted">
              No periods yet — add one to start planning.
            </li>
          ) : (
            months.map((key) => {
              const snap = summarizeMonthBudget(state, key);
              const active = key === selected;
              return (
                <li key={key} className="shrink-0 lg:w-full">
                  <button
                    type="button"
                    onClick={() => setSelected(key)}
                    className={`min-w-[7.5rem] rounded-2xl border px-4 py-3 text-left lg:min-w-0 lg:w-full ${
                      active
                        ? "border-ink bg-ink text-paper"
                        : "border-paper-line bg-white text-ink"
                    }`}
                  >
                    <span className="block text-base font-semibold">
                      {monthChipLabel(key)}
                    </span>
                    <span
                      className={`mt-1 block text-sm ${active ? "text-paper/75" : "text-ink-muted"}`}
                    >
                      {snap.lines.length} lines
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="mt-3 hidden w-full rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-paper lg:block"
        >
          Add period
        </button>
      </aside>

      <div className="min-w-0 flex-1 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <MiniStat label="Budget in" value={phpSmart(summary.income)} />
          <MiniStat label="Budget out" value={phpSmart(summary.expense)} />
          <MiniStat label="Actual in" value={phpSmart(summary.actualIn)} />
          <MiniStat label="Actual out" value={phpSmart(summary.actualOut)} />
        </div>

        <PeriodBudgetView
          title={monthChipLabel(selected)}
          monthKey={selected}
          showHeader
          showAddPeriod={false}
        />

        <Modal open={addOpen} title="Add a pay period" onClose={closeAdd}>
          <form onSubmit={addPeriod} className="space-y-4">
            <p className="text-sm text-ink-muted">
              Example: Oct 25 → Oct 31 becomes{" "}
              {start && end ? periodLabel(start, end) : "OCT 25 - OCT 31"}.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-ink-muted">
                Start
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-paper-line px-3 py-3 text-base text-ink"
                  required
                />
              </label>
              <label className="block text-sm text-ink-muted">
                End
                <input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-paper-line px-3 py-3 text-base text-ink"
                  required
                />
              </label>
            </div>
            <button
              type="submit"
              className="w-full rounded-full bg-ink px-4 py-3 text-base font-semibold text-paper"
            >
              Add period
            </button>
          </form>
        </Modal>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-paper-line bg-white px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </p>
      <p className="mt-1 font-display text-lg font-semibold">{value}</p>
    </div>
  );
}
