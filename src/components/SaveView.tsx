"use client";

import { FormEvent, useState } from "react";
import { Modal } from "@/components/Modal";
import { useFinance } from "@/context/FinanceContext";
import { emptyAccount } from "@/lib/defaults";
import { pctExact, phpSmart, todayIso } from "@/lib/money";
import { byKind } from "@/lib/selectors";

type TigumAction = "pick" | "move" | "goal";

export function SaveView() {
  const { state, balances, addTransaction, upsertAccount, setCurrentBalance } =
    useFinance();
  const banks = byKind(state, "cash");
  const pots = byKind(state, "savings");

  const [modalOpen, setModalOpen] = useState(false);
  const [action, setAction] = useState<TigumAction>("pick");

  function closeModal() {
    setModalOpen(false);
    setAction("pick");
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm text-ink-muted">
          Track each savings goal: target, current, and progress. Move pesos
          from any bank or wallet.
        </p>
        <button
          type="button"
          onClick={() => {
            setAction("pick");
            setModalOpen(true);
          }}
          className="rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-paper"
        >
          Tigum actions
        </button>
      </div>

      <div className="sheet-wrap sheet-stack">
        <table className="sheet">
          <thead>
            <tr>
              <th>Goal</th>
              <th className="num">Target Amount</th>
              <th className="num">Current Amount</th>
              <th className="num">Progress</th>
            </tr>
          </thead>
          <tbody>
            {pots.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty">
                  No savings goals yet.
                </td>
              </tr>
            ) : (
              pots.map((pot) => {
                const current = balances[pot.id] ?? 0;
                const hasTarget = pot.goal > 0;
                const hasCurrent = current > 0;
                return (
                  <tr key={pot.id}>
                    <td>
                      <input
                        defaultValue={pot.name}
                        key={`${pot.id}-name`}
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (next && next !== pot.name) {
                            upsertAccount({ ...pot, name: next });
                          }
                        }}
                        className="w-full bg-transparent text-sm outline-none"
                      />
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        min={0}
                        defaultValue={hasTarget ? pot.goal : ""}
                        placeholder="—"
                        key={`${pot.id}-goal-${pot.goal}`}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          const next = Number.isFinite(n) ? n : 0;
                          if (next !== pot.goal) {
                            upsertAccount({ ...pot, goal: next });
                          }
                        }}
                        className="w-full bg-transparent text-right text-sm outline-none"
                      />
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        min={0}
                        defaultValue={
                          hasCurrent ? Math.round(current * 100) / 100 : ""
                        }
                        placeholder="—"
                        key={`${pot.id}-bal-${Math.round(current * 100)}`}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          const next = Number.isFinite(n) ? n : 0;
                          if (next !== current) setCurrentBalance(pot.id, next);
                        }}
                        className="w-full bg-transparent text-right text-sm outline-none"
                      />
                    </td>
                    <td className="num">
                      {hasTarget && hasCurrent
                        ? pctExact(current, pot.goal)
                        : ""}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={modalOpen}
        title={
          action === "pick"
            ? "Tigum actions"
            : action === "move"
              ? "Move cash to a goal"
              : "New savings goal"
        }
        onClose={closeModal}
      >
        {action === "pick" ? (
          <div className="grid gap-2">
            <button
              type="button"
              disabled={banks.length === 0 || pots.length === 0}
              onClick={() => setAction("move")}
              className="rounded-xl border border-paper-line bg-white px-4 py-3 text-left text-sm font-semibold disabled:opacity-40"
            >
              Move cash to a goal
            </button>
            <button
              type="button"
              onClick={() => setAction("goal")}
              className="rounded-xl border border-paper-line bg-white px-4 py-3 text-left text-sm font-semibold"
            >
              New savings goal
            </button>
          </div>
        ) : null}

        {action === "move" ? (
          <MoveForm
            banks={banks}
            pots={pots}
            balances={balances}
            onBack={() => setAction("pick")}
            onMove={(payload) => {
              addTransaction({
                date: todayIso(),
                kind: "transfer",
                amount: payload.amount,
                category: "savings",
                particular: "",
                particularId: null,
                fromId: payload.fromId,
                toId: payload.toId,
                note: "Tigum",
              });
              closeModal();
            }}
          />
        ) : null}

        {action === "goal" ? (
          <NewGoalForm
            onBack={() => setAction("pick")}
            onAdd={(account) => {
              upsertAccount(account);
              closeModal();
            }}
          />
        ) : null}
      </Modal>
    </section>
  );
}

function MoveForm({
  banks,
  pots,
  balances,
  onMove,
  onBack,
}: {
  banks: ReturnType<typeof byKind>;
  pots: ReturnType<typeof byKind>;
  balances: Record<string, number>;
  onMove: (payload: { fromId: string; toId: string; amount: number }) => void;
  onBack: () => void;
}) {
  const [fromId, setFromId] = useState(banks[0]?.id ?? "");
  const [toId, setToId] = useState(pots[0]?.id ?? "");
  const [amount, setAmount] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!fromId || !toId || !Number.isFinite(value) || value <= 0) return;
    onMove({
      fromId,
      toId,
      amount: Math.round(value * 100) / 100,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="text-xs font-semibold text-ink-muted"
      >
        ← Back
      </button>
      <label className="block text-xs font-semibold uppercase tracking-wide text-ink-muted">
        From account
        <select
          value={fromId}
          onChange={(e) => setFromId(e.target.value)}
          className="mt-1 w-full rounded-xl border border-paper-line bg-white px-3 py-2 text-sm font-normal text-ink"
        >
          {banks.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {phpSmart(balances[a.id] ?? 0)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Goal
        <select
          value={toId}
          onChange={(e) => setToId(e.target.value)}
          className="mt-1 w-full rounded-xl border border-paper-line bg-white px-3 py-2 text-sm font-normal text-ink"
        >
          {pots.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Amount
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 w-full rounded-xl border border-paper-line px-3 py-2 text-sm font-normal text-ink"
          placeholder="1000"
          required
        />
      </label>
      <button
        type="submit"
        className="w-full rounded-full bg-ink py-2.5 text-sm font-semibold text-paper"
      >
        Move to tigum
      </button>
    </form>
  );
}

function NewGoalForm({
  onAdd,
  onBack,
}: {
  onAdd: (account: ReturnType<typeof emptyAccount>) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const potName = name.trim();
    const goalAmt = Number(goal);
    if (!potName) return;
    const account = emptyAccount("savings", potName);
    account.goal = Number.isFinite(goalAmt) ? goalAmt : 0;
    onAdd(account);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="text-xs font-semibold text-ink-muted"
      >
        ← Back
      </button>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Christmas, bahay repairs"
        className="w-full rounded-xl border border-paper-line px-3 py-2 text-sm"
        required
      />
      <label className="block text-xs text-ink-muted">
        Target amount (optional)
        <input
          type="number"
          min={0}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          className="mt-1 w-full rounded-xl border border-paper-line px-3 py-2 text-sm text-ink"
        />
      </label>
      <button
        type="submit"
        className="w-full rounded-full bg-ink py-2.5 text-sm font-semibold text-paper"
      >
        Add goal
      </button>
    </form>
  );
}
