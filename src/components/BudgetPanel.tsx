"use client";

import { FormEvent, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { useFinance } from "@/context/FinanceContext";
import { emptyCategory } from "@/lib/defaults";
import { dueLabel, php, phpSmart } from "@/lib/money";
import { budgetTotal, deriveMonth } from "@/lib/selectors";
import type { Category, ParticularTone } from "@/lib/types";

type CatKind = Category["kind"];

const TONES: { id: ParticularTone; label: string }[] = [
  { id: "paycheck", label: "Paycheck" },
  { id: "housing", label: "Housing" },
  { id: "loan", label: "Loan" },
  { id: "utility", label: "Utility" },
  { id: "food", label: "Food" },
  { id: "personal", label: "Personal" },
  { id: "allowance", label: "Allowance" },
  { id: "default", label: "Default" },
];

export function BudgetPanel({ showActuals = false }: { showActuals?: boolean }) {
  const {
    state,
    month,
    upsertCategory,
    removeCategory,
    moveCategory,
  } = useFinance();
  const flow = showActuals ? deriveMonth(state, month) : null;

  const incomeCats = useMemo(
    () => state.categories.filter((c) => (c.kind ?? "expense") === "income"),
    [state.categories],
  );
  const expenseCats = useMemo(
    () => state.categories.filter((c) => (c.kind ?? "expense") === "expense"),
    [state.categories],
  );

  return (
    <div className="space-y-8">
      <CategorySection
        title="Income categories"
        blurb="Used when you log payday / income."
        kind="income"
        categories={incomeCats}
        showActuals={showActuals}
        flowByCategory={flow?.byCategory}
        totalBudget={budgetTotal(state, "income")}
        onUpsert={upsertCategory}
        onRemove={removeCategory}
        onMove={moveCategory}
      />
      <CategorySection
        title="Expense categories"
        blurb="Used when you log expenses, tigum moves, and bayad."
        kind="expense"
        categories={expenseCats}
        showActuals={showActuals}
        flowByCategory={flow?.byCategory}
        totalBudget={budgetTotal(state, "expense")}
        onUpsert={upsertCategory}
        onRemove={removeCategory}
        onMove={moveCategory}
      />
    </div>
  );
}

function CategorySection({
  title,
  blurb,
  kind,
  categories,
  showActuals,
  flowByCategory,
  totalBudget,
  onUpsert,
  onRemove,
  onMove,
}: {
  title: string;
  blurb: string;
  kind: CatKind;
  categories: Category[];
  showActuals: boolean;
  flowByCategory?: Record<string, number>;
  totalBudget: number;
  onUpsert: (category: Category) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
}) {
  const defaultTone: ParticularTone =
    kind === "income" ? "paycheck" : "default";
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [planned, setPlanned] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [tone, setTone] = useState<ParticularTone>(defaultTone);

  const totalActual = showActuals
    ? categories.reduce(
        (sum, c) => sum + (flowByCategory?.[c.id] ?? 0),
        0,
      )
    : 0;

  function closeAdd() {
    setAddOpen(false);
    setName("");
    setPlanned("");
    setDueDay("");
    setTone(defaultTone);
  }

  function addLine(event: FormEvent) {
    event.preventDefault();
    const lineName = name.trim();
    if (!lineName) return;
    const category = emptyCategory(lineName, kind, tone);
    category.planned = Number(planned) || 0;
    const day = Number(dueDay);
    category.dueDay = Number.isFinite(day) ? Math.min(31, Math.max(0, day)) : 0;
    onUpsert(category);
    closeAdd();
  }

  function upsertWithTone(c: Category, patch: Partial<Category> = {}) {
    onUpsert({
      ...c,
      kind,
      ...patch,
      tone: patch.tone ?? c.tone ?? "default",
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-ink-muted">{blurb}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setTone(defaultTone);
            setAddOpen(true);
          }}
          className="shrink-0 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper"
        >
          Add
        </button>
      </div>

      {categories.length === 0 ? (
        <p className="sheet-empty">
          {kind === "income"
            ? "No income categories yet. Add salary, side hustle, or remittance."
            : "No expense categories yet. Add rent, food, or whatever you actually pay."}
        </p>
      ) : (
        <ul className="space-y-3">
          {categories.map((c, index) => {
            const actual = flowByCategory?.[c.id] ?? 0;
            const diff =
              kind === "income" ? actual - c.planned : c.planned - actual;
            const over =
              showActuals &&
              kind === "expense" &&
              actual > c.planned &&
              c.planned > 0;
            const rowTone = c.tone ?? "default";
            return (
              <li
                key={c.id}
                className="rounded-2xl border border-paper-line bg-white/70 p-4"
              >
                <input
                  defaultValue={c.name}
                  key={`${c.id}-name`}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next && next !== c.name) {
                      upsertWithTone(c, { name: next });
                    }
                  }}
                  className="w-full bg-transparent font-display text-base font-semibold outline-none"
                />

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    Tone
                    <select
                      value={rowTone}
                      onChange={(e) =>
                        upsertWithTone(c, {
                          tone: e.target.value as ParticularTone,
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-paper-line bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-ink"
                    >
                      {TONES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    Budget
                    <input
                      type="number"
                      min={0}
                      defaultValue={c.planned || ""}
                      placeholder="0"
                      key={`${c.id}-planned-${c.planned}`}
                      onBlur={(e) => {
                        const n = Number(e.target.value);
                        const next = Number.isFinite(n) ? n : 0;
                        if (next !== c.planned) {
                          upsertWithTone(c, { planned: next });
                        }
                      }}
                      className="mt-1 w-full rounded-xl border border-paper-line bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-ink"
                    />
                  </label>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                    Due day
                    <input
                      type="number"
                      min={0}
                      max={31}
                      defaultValue={c.dueDay || ""}
                      placeholder="—"
                      key={`${c.id}-due-${c.dueDay}`}
                      onBlur={(e) => {
                        const n = Number(e.target.value);
                        const next = Number.isFinite(n)
                          ? Math.min(31, Math.max(0, n))
                          : 0;
                        if (next !== c.dueDay) {
                          upsertWithTone(c, { dueDay: next });
                        }
                      }}
                      className="mt-1 w-full rounded-xl border border-paper-line bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-ink"
                    />
                    <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-ink-muted">
                      {dueLabel(c.dueDay)}
                    </span>
                  </label>
                  {showActuals ? (
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                      Actual
                      <p
                        className={`mt-1 font-display text-sm font-semibold normal-case tracking-normal ${over ? "text-danger" : "text-ink"}`}
                      >
                        {actual ? phpSmart(actual) : "—"}
                        {actual || c.planned ? (
                          <span className="ml-2 text-xs font-medium text-ink-muted">
                            Δ {phpSmart(diff)}
                          </span>
                        ) : null}
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-paper-line pt-3">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => onMove(c.id, -1)}
                    className="text-[11px] font-semibold text-ink-muted disabled:opacity-30"
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    disabled={index === categories.length - 1}
                    onClick={() => onMove(c.id, 1)}
                    className="text-[11px] font-semibold text-ink-muted disabled:opacity-30"
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove ${c.name} from ${kind} categories?`,
                        )
                      ) {
                        onRemove(c.id);
                      }
                    }}
                    className="ml-auto text-[11px] font-semibold text-danger"
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
          <li className="rounded-2xl border border-paper-line bg-paper-soft/60 px-4 py-3 text-sm font-semibold">
            Total budget{" "}
            <span className="font-display">{php(totalBudget)}</span>
            {showActuals && totalActual ? (
              <span className="ml-2 font-normal text-ink-muted">
                · actual {phpSmart(totalActual)}
              </span>
            ) : null}
          </li>
        </ul>
      )}

      <Modal
        open={addOpen}
        title={`Add ${kind === "income" ? "income" : "expense"} category`}
        onClose={closeAdd}
      >
        <form onSubmit={addLine} className="space-y-4">
          <label className="block text-xs text-ink-muted">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                kind === "income"
                  ? "e.g. Salary, freelance, remittance"
                  : "e.g. Water, load, baon, medicine"
              }
              className="mt-1 w-full rounded-xl border border-paper-line px-3 py-2 text-sm text-ink"
              required
            />
          </label>
          <label className="block text-xs text-ink-muted">
            Tone
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as ParticularTone)}
              className="mt-1 w-full rounded-xl border border-paper-line bg-white px-3 py-2 text-sm text-ink"
            >
              {TONES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-ink-muted">
              Budget
              <input
                type="number"
                min={0}
                value={planned}
                onChange={(e) => setPlanned(e.target.value)}
                placeholder="0"
                className="mt-1 w-full rounded-xl border border-paper-line px-3 py-2 text-sm text-ink"
              />
            </label>
            <label className="block text-xs text-ink-muted">
              Due day (optional)
              <input
                type="number"
                min={0}
                max={31}
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                placeholder="—"
                className="mt-1 w-full rounded-xl border border-paper-line px-3 py-2 text-sm text-ink"
              />
            </label>
          </div>
          <button
            type="submit"
            className="w-full rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-paper"
          >
            Save category
          </button>
        </form>
      </Modal>
    </div>
  );
}
