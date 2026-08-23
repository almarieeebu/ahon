"use client";

import { FormEvent, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { useFinance } from "@/context/FinanceContext";
import { emptyCategory, emptyParticular } from "@/lib/defaults";
import { phpSmart, uid } from "@/lib/money";
import {
  availableBudgetYears,
  computeBudgetSheet,
  periodLabel,
  shortDue,
} from "@/lib/periodBudget";
import { findParticular } from "@/lib/refs";
import type {
  BudgetLine,
  BudgetPeriod,
  ParticularTone,
} from "@/lib/types";

export function PeriodBudgetView({
  title = "Budget",
  year,
  monthKey,
  onYearChange,
  showYearPicker = false,
  showHeader = true,
  showAddPeriod = true,
}: {
  title?: string;
  year?: number;
  monthKey?: string;
  onYearChange?: (year: number) => void;
  showYearPicker?: boolean;
  showHeader?: boolean;
  showAddPeriod?: boolean;
}) {
  const {
    state,
    upsertBudgetLine,
    removeBudgetLine,
    addBudgetLine,
    upsertBudgetPeriod,
    removeBudgetPeriod,
    upsertParticular,
    upsertCategory,
  } = useFinance();

  const years = useMemo(
    () => availableBudgetYears(state.budgetPeriods),
    [state.budgetPeriods],
  );
  const blocks = useMemo(
    () => computeBudgetSheet(state, year, monthKey),
    [state, year, monthKey],
  );
  const particulars = state.particulars;
  const listId =
    monthKey != null
      ? `particular-options-${monthKey}`
      : year != null
        ? `particular-options-${year}`
        : "particular-options";

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [createFor, setCreateFor] = useState<{
    lineId: string;
    name: string;
  } | null>(null);
  const [createName, setCreateName] = useState("");
  const [createIsExpense, setCreateIsExpense] = useState(true);

  function addPeriod(event: FormEvent) {
    event.preventDefault();
    if (!start || !end) return;
    const period: BudgetPeriod = { id: uid(), start, end };
    upsertBudgetPeriod(period);
    addBudgetLine(period.id);
    setStart("");
    setEnd("");
  }

  function patchLine(line: BudgetLine, patch: Partial<BudgetLine>) {
    upsertBudgetLine({ ...line, ...patch });
  }

  function lineFlow(
    row: BudgetLine & { tone?: ParticularTone },
  ): "income" | "expense" | null {
    const hit = findParticular(particulars, {
      id: row.particularId,
      name: row.particular,
    });
    if (hit?.categoryId) {
      const cat = state.categories.find((c) => c.id === hit.categoryId);
      if (cat?.kind === "income" || cat?.kind === "expense") return cat.kind;
    }
    if (row.tone === "paycheck") return "income";
    return null;
  }

  function isKnownParticular(name: string) {
    return Boolean(findParticular(particulars, { name: name.trim() }));
  }

  function setParticular(row: BudgetLine, particular: string) {
    const hit = findParticular(particulars, { name: particular });
    const cat = hit?.categoryId
      ? state.categories.find((c) => c.id === hit.categoryId)
      : undefined;
    const flow = cat?.kind ?? null;
    patchLine(row, {
      particular: hit?.name ?? particular,
      particularId: hit?.id ?? null,
      ...(flow === "income" ? { expense: 0 } : {}),
      ...(flow === "expense" ? { income: 0 } : {}),
    });
  }

  function openCreateParticular(row: BudgetLine, draft?: string) {
    const name = (draft ?? row.particular).trim();
    if (!name) return;
    if (isKnownParticular(name)) {
      setParticular(row, name);
      return;
    }
    setCreateName(name);
    setCreateIsExpense(true);
    setCreateFor({ lineId: row.id, name });
  }

  function closeCreateParticular() {
    setCreateFor(null);
  }

  function saveCreateParticular(event: FormEvent) {
    event.preventDefault();
    if (!createFor) return;
    const name = createName.trim();
    if (!name) return;

    const existing = findParticular(particulars, { name });
    const line = state.budgetLines.find((l) => l.id === createFor.lineId);
    if (!line) {
      closeCreateParticular();
      return;
    }

    if (existing) {
      setParticular(line, existing.name);
      closeCreateParticular();
      return;
    }

    const kind = createIsExpense ? "expense" : "income";
    let category = state.categories.find((c) => c.kind === kind);
    if (!category) {
      category = emptyCategory(
        kind === "income" ? "Income" : "Expense",
        kind,
        kind === "income" ? "paycheck" : "default",
      );
      upsertCategory(category);
    }

    const particular = emptyParticular(name, category.id);
    upsertParticular(particular);
    patchLine(line, {
      particular: particular.name,
      particularId: particular.id,
      ...(kind === "income" ? { expense: 0 } : { income: 0 }),
    });
    closeCreateParticular();
  }

  const emptyMessage = (
    <p className="sheet-empty">
      No periods
      {monthKey != null ? " for this month" : year != null ? ` for ${year}` : ""}{" "}
      yet.
      {showAddPeriod
        ? " Add a pay cycle below."
        : " Use Add a pay period above."}
    </p>
  );

  return (
    <div className="space-y-4">
      {showHeader ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Plan by pay period. Home overview uses budget here + actual from
              Ledger.
              {monthKey != null
                ? ` · ${monthKey}`
                : year != null
                  ? ` · ${year}`
                  : ""}
            </p>
          </div>
          {showYearPicker && onYearChange ? (
            <label className="text-xs text-ink-muted">
              Year
              <select
                value={year}
                onChange={(e) => onYearChange(Number(e.target.value))}
                className="mt-1 block rounded-lg border border-paper-line bg-white px-2 py-1 text-sm text-ink"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}

      <datalist id={listId}>
        {particulars.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>

      <Modal
        open={createFor != null}
        title="Create particular"
        onClose={closeCreateParticular}
      >
        <form onSubmit={saveCreateParticular} className="space-y-4">
          <p className="text-sm text-ink-muted">
            Saves to Menu → Particulars so you can reuse it in Ledger and
            Budget.
          </p>
          <label className="block text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Particular
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. WATER, LOAD, MEDICINE"
              className="mt-1.5 w-full rounded-xl border border-paper-line bg-white px-3 py-2.5 text-base font-normal text-ink"
              required
              autoFocus
            />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Type
            </legend>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCreateIsExpense(true)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                  createIsExpense
                    ? "border-ink bg-ink text-paper"
                    : "border-paper-line bg-white text-ink"
                }`}
              >
                Expense
              </button>
              <button
                type="button"
                onClick={() => setCreateIsExpense(false)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                  !createIsExpense
                    ? "border-ink bg-ink text-paper"
                    : "border-paper-line bg-white text-ink"
                }`}
              >
                Income
              </button>
            </div>
          </fieldset>
          <button
            type="submit"
            className="w-full rounded-full bg-ink py-3 text-base font-semibold text-paper"
          >
            Save particular
          </button>
        </form>
      </Modal>

      {blocks.length === 0 ? (
        emptyMessage
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-5 md:hidden">
            {blocks.map((block) => (
              <section
                key={block.period.id}
                className="overflow-hidden rounded-2xl border border-paper-line bg-white/80"
              >
                <div className="border-b border-paper-line bg-gradient-to-b from-paper-soft to-white px-4 py-4">
                  <p className="font-display text-lg font-semibold tracking-tight">
                    {block.label}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="text-xs font-medium text-ink-muted">
                      Start
                      <input
                        type="date"
                        value={block.period.start}
                        onChange={(e) =>
                          upsertBudgetPeriod({
                            ...block.period,
                            start: e.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-paper-line bg-white px-3 py-2.5 text-base text-ink"
                      />
                    </label>
                    <label className="text-xs font-medium text-ink-muted">
                      End
                      <input
                        type="date"
                        value={block.period.end}
                        onChange={(e) =>
                          upsertBudgetPeriod({
                            ...block.period,
                            end: e.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-paper-line bg-white px-3 py-2.5 text-base text-ink"
                      />
                    </label>
                  </div>
                  <p className="mt-3 text-sm text-ink-muted">
                    Close · budget{" "}
                    <span className="font-semibold text-ink">
                      {phpSmart(block.closingBudget)}
                    </span>{" "}
                    · actual{" "}
                    <span className="font-semibold text-ink">
                      {phpSmart(block.closingActual)}
                    </span>
                  </p>
                  <button
                    type="button"
                    className="mt-3 text-sm font-semibold text-danger"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove period ${block.label} and all its lines?`,
                        )
                      ) {
                        removeBudgetPeriod(block.period.id);
                      }
                    }}
                  >
                    Remove period
                  </button>
                </div>

                {block.lines.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-ink-muted">
                    No lines in this period.
                  </p>
                ) : (
                  <ul className="divide-y divide-paper-line">
                    {block.lines.map((row) => (
                      <li
                        key={row.id}
                        className={`space-y-3 px-4 py-3 tone-${row.tone}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <ParticularCell
                            listId={listId}
                            value={row.particular}
                            tone={row.tone}
                            known={isKnownParticular(row.particular)}
                            onChange={(particular) =>
                              setParticular(row, particular)
                            }
                            onCreate={() => openCreateParticular(row)}
                          />
                          <button
                            type="button"
                            className="shrink-0 text-sm font-semibold text-ink-muted hover:text-danger"
                            onClick={() => {
                              if (window.confirm("Remove this line?")) {
                                removeBudgetLine(row.id);
                              }
                            }}
                          >
                            Remove
                          </button>
                        </div>

                        <label className="block text-xs text-ink-muted">
                          Due
                          <input
                            type="date"
                            value={row.due}
                            onChange={(e) =>
                              patchLine(row, { due: e.target.value })
                            }
                            className="mt-1 w-full rounded-xl border border-paper-line bg-white px-3 py-2.5 text-base text-ink"
                          />
                        </label>

                        {(() => {
                          const flow = lineFlow(row);
                          if (flow === "income") {
                            return (
                              <div className="grid grid-cols-2 gap-3">
                                <label className="block rounded-2xl border border-paper-line bg-white/90 p-3 text-xs text-ink-muted">
                                  Budget in
                                  <div className="mt-1.5 rounded-xl border border-paper-line bg-paper/50 px-2.5 py-2">
                                    <NumInput
                                      value={row.income}
                                      blankZero
                                      onChange={(income) =>
                                        patchLine(row, {
                                          income: income ?? 0,
                                          expense: 0,
                                        })
                                      }
                                    />
                                  </div>
                                </label>
                                <label className="block rounded-2xl border border-paper-line bg-white/90 p-3 text-xs text-ink-muted">
                                  Actual in
                                  <div className="mt-1.5 rounded-xl border border-paper-line bg-paper/50 px-2.5 py-2">
                                    <NumInput
                                      value={row.actual}
                                      nullable
                                      onChange={(actual) =>
                                        patchLine(row, { actual })
                                      }
                                    />
                                  </div>
                                </label>
                              </div>
                            );
                          }
                          if (flow === "expense") {
                            return (
                              <div className="grid grid-cols-2 gap-3">
                                <label className="block rounded-2xl border border-paper-line bg-white/90 p-3 text-xs text-ink-muted">
                                  Budget out
                                  <div className="mt-1.5 rounded-xl border border-paper-line bg-paper/50 px-2.5 py-2">
                                    <NumInput
                                      value={row.expense}
                                      blankZero
                                      onChange={(expense) =>
                                        patchLine(row, {
                                          expense: expense ?? 0,
                                          income: 0,
                                        })
                                      }
                                    />
                                  </div>
                                </label>
                                <label className="block rounded-2xl border border-paper-line bg-white/90 p-3 text-xs text-ink-muted">
                                  Actual out
                                  <div className="mt-1.5 rounded-xl border border-paper-line bg-paper/50 px-2.5 py-2">
                                    <NumInput
                                      value={row.actual}
                                      nullable
                                      onChange={(actual) =>
                                        patchLine(row, { actual })
                                      }
                                    />
                                  </div>
                                </label>
                              </div>
                            );
                          }
                          return (
                            <div className="space-y-2 rounded-2xl border border-dashed border-paper-line bg-white/60 p-3">
                              <p className="text-sm text-ink-muted">
                                Choose an income or expense particular above to
                                show Budget / Actual fields.
                              </p>
                            </div>
                          );
                        })()}
                        <div className="flex justify-between text-sm text-ink-muted">
                          <span>
                            Budget bal{" "}
                            <span className="font-semibold text-ink">
                              {phpSmart(row.budgetBalance)}
                            </span>
                          </span>
                          <span>
                            Actual bal{" "}
                            <span className="font-semibold text-ink">
                              {phpSmart(row.remBalance)}
                            </span>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="border-t border-paper-line px-4 py-3">
                  <button
                    type="button"
                    className="w-full rounded-full border border-ink/15 bg-white py-3 text-base font-semibold text-ink"
                    onClick={() => addBudgetLine(block.period.id)}
                  >
                    + Add line
                  </button>
                </div>
              </section>
            ))}
          </div>

          {/* Desktop spreadsheet */}
          <div className="budget-sheet-wrap hidden md:block">
            <table className="budget-sheet">
              <thead>
                <tr className="group-head">
                  <th rowSpan={2}>Period</th>
                  <th rowSpan={2}>Actual due</th>
                  <th rowSpan={2}>Particular</th>
                  <th colSpan={3} className="group">
                    Budget
                  </th>
                  <th colSpan={2} className="group">
                    Actual
                  </th>
                  <th rowSpan={2} />
                </tr>
                <tr className="sub-head">
                  <th className="num">Income</th>
                  <th className="num">Expenses</th>
                  <th className="num">Balance</th>
                  <th className="num">Amount</th>
                  <th className="num">Rem. balance</th>
                </tr>
              </thead>
              {blocks.map((block, blockIndex) => (
                <tbody key={block.period.id} className="period-block">
                  {block.lines.length === 0 ? (
                    <tr>
                      <td className="period-cell">{block.label}</td>
                      <td colSpan={7} className="empty-cell">
                        No lines in this period.
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => addBudgetLine(block.period.id)}
                          className="link-btn"
                        >
                          Add line
                        </button>
                      </td>
                    </tr>
                  ) : (
                    block.lines.map((row, rowIndex) => (
                      <tr key={row.id} className={`tone-${row.tone}`}>
                        {rowIndex === 0 ? (
                          <td
                            className="period-cell"
                            rowSpan={block.lines.length}
                          >
                            <div className="period-label">{block.label}</div>
                            <div className="mt-2 flex flex-col gap-1">
                              <label className="muted">
                                Start
                                <input
                                  type="date"
                                  value={block.period.start}
                                  onChange={(e) =>
                                    upsertBudgetPeriod({
                                      ...block.period,
                                      start: e.target.value,
                                    })
                                  }
                                  className="cell-input mt-0.5"
                                />
                              </label>
                              <label className="muted">
                                End
                                <input
                                  type="date"
                                  value={block.period.end}
                                  onChange={(e) =>
                                    upsertBudgetPeriod({
                                      ...block.period,
                                      end: e.target.value,
                                    })
                                  }
                                  className="cell-input mt-0.5"
                                />
                              </label>
                            </div>
                            <button
                              type="button"
                              className="link-btn danger"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Remove period ${block.label} and all its lines?`,
                                  )
                                ) {
                                  removeBudgetPeriod(block.period.id);
                                }
                              }}
                            >
                              Remove period
                            </button>
                          </td>
                        ) : null}
                        <td>
                          <input
                            type="date"
                            value={row.due}
                            onChange={(e) =>
                              patchLine(row, { due: e.target.value })
                            }
                            className="cell-input"
                            title={row.due ? shortDue(row.due) : ""}
                          />
                        </td>
                        <td>
                          <ParticularCell
                            listId={listId}
                            value={row.particular}
                            tone={row.tone}
                            known={isKnownParticular(row.particular)}
                            onChange={(particular) =>
                              setParticular(row, particular)
                            }
                            onCreate={() => openCreateParticular(row)}
                          />
                        </td>
                        <td className="num">
                          {lineFlow(row) === "expense" ? (
                            <span className="text-ink-muted">—</span>
                          ) : (
                            <NumInput
                              value={row.income}
                              blankZero
                              onChange={(income) =>
                                patchLine(row, {
                                  income: income ?? 0,
                                  expense: 0,
                                })
                              }
                            />
                          )}
                        </td>
                        <td className="num">
                          {lineFlow(row) === "income" ? (
                            <span className="text-ink-muted">—</span>
                          ) : (
                            <NumInput
                              value={row.expense}
                              blankZero
                              onChange={(expense) =>
                                patchLine(row, {
                                  expense: expense ?? 0,
                                  income: 0,
                                })
                              }
                            />
                          )}
                        </td>
                        <td className="num balance">
                          {phpSmart(row.budgetBalance)}
                        </td>
                        <td className="num">
                          <NumInput
                            value={row.actual}
                            nullable
                            onChange={(actual) => patchLine(row, { actual })}
                          />
                        </td>
                        <td className="num balance">
                          {phpSmart(row.remBalance)}
                        </td>
                        <td className="actions">
                          <button
                            type="button"
                            className="link-btn danger"
                            onClick={() => {
                              if (window.confirm("Remove this line?")) {
                                removeBudgetLine(row.id);
                              }
                            }}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                  <tr className="period-foot">
                    <td colSpan={5}>
                      {blockIndex === blocks.length - 1 ? (
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => addBudgetLine(block.period.id)}
                        >
                          + Add line to {block.label}
                        </button>
                      ) : (
                        <span className="muted">
                          Closes at {phpSmart(block.closingBudget)} budget ·{" "}
                          {phpSmart(block.closingActual)} actual
                        </span>
                      )}
                    </td>
                    <td className="num balance">
                      {phpSmart(block.closingBudget)}
                    </td>
                    <td />
                    <td className="num balance">
                      {phpSmart(block.closingActual)}
                    </td>
                    <td>
                      {blockIndex === blocks.length - 1 ? null : (
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => addBudgetLine(block.period.id)}
                        >
                          + Line
                        </button>
                      )}
                    </td>
                  </tr>
                </tbody>
              ))}
            </table>
          </div>
        </>
      )}

      {showAddPeriod ? (
        <form
          onSubmit={addPeriod}
          className="space-y-3 rounded-2xl border border-dashed border-paper-line p-4"
        >
          <h3 className="font-display text-base font-semibold">
            Add a pay period
          </h3>
          <p className="text-xs text-ink-muted">
            Example: Oct 25 → Oct 31 becomes{" "}
            {start && end ? periodLabel(start, end) : "OCT 25 - OCT 31"}.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-ink-muted">
              Start
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="mt-1 w-full rounded-xl border border-paper-line px-3 py-2 text-sm text-ink"
                required
              />
            </label>
            <label className="block text-xs text-ink-muted">
              End
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="mt-1 w-full rounded-xl border border-paper-line px-3 py-2 text-sm text-ink"
                required
              />
            </label>
          </div>
          <button
            type="submit"
            className="rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold"
          >
            Add period
          </button>
        </form>
      ) : null}
    </div>
  );
}

function ParticularCell({
  listId,
  value,
  tone,
  known,
  onChange,
  onCreate,
}: {
  listId: string;
  value: string;
  tone: ParticularTone;
  known: boolean;
  onChange: (v: string) => void;
  onCreate: () => void;
}) {
  const trimmed = value.trim();
  const showCreate = trimmed.length > 0 && !known;

  return (
    <div className="w-full min-w-0">
      <div className={`particular-chip tone-${tone} w-full`}>
        <input
          list={listId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Particular"
          className="particular-input"
        />
      </div>
      {showCreate ? (
        <button
          type="button"
          onClick={onCreate}
          className="mt-1 text-xs font-semibold text-gold-deep underline-offset-2 hover:underline"
        >
          Create “{trimmed}” · save to setup
        </button>
      ) : null}
    </div>
  );
}

function NumInput({
  value,
  onChange,
  blankZero,
  nullable,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  blankZero?: boolean;
  nullable?: boolean;
}) {
  const display =
    value == null ? "" : blankZero && value === 0 ? "" : String(value);

  return (
    <input
      inputMode="decimal"
      value={display}
      placeholder=""
      onChange={(e) => {
        const raw = e.target.value.trim();
        if (raw === "") {
          onChange(nullable ? null : 0);
          return;
        }
        const n = Number(raw.replace(/,/g, ""));
        if (Number.isFinite(n)) onChange(n);
      }}
      className="cell-input num-input w-full"
    />
  );
}
