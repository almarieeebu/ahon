"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { RecordForm } from "@/components/RecordForm";
import { useFinance } from "@/context/FinanceContext";
import { phpSmart } from "@/lib/money";
import {
  applySimpleLog,
  applySimpleUpdate,
  cashAccounts,
  chipIdForParticular,
  chipsForDirection,
  logSaveFeedback,
  moreParticulars,
  shouldShowWalletPicker,
  type LogSaveFeedback,
  type SimpleDirection,
} from "@/lib/simpleLog";
import type { Transaction } from "@/lib/types";

type Prefill = {
  direction?: SimpleDirection;
  chipId?: string;
  particularId?: string;
};

export function SimpleLogSheet({
  open,
  onClose,
  prefill,
  initial,
  onManageParticulars,
  onManageCategories,
}: {
  open: boolean;
  onClose: () => void;
  prefill?: Prefill;
  initial?: Transaction | null;
  onManageParticulars?: () => void;
  onManageCategories?: () => void;
}) {
  const { state, logSimple, updateSimple } = useFinance();
  const editing = Boolean(initial);
  const [direction, setDirection] = useState<SimpleDirection>("out");
  const [amount, setAmount] = useState("");
  const [chipId, setChipId] = useState("");
  const [particularId, setParticularId] = useState("");
  const [fromId, setFromId] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [feedback, setFeedback] = useState<LogSaveFeedback | null>(null);

  const chips = chipsForDirection(direction);
  const extra = useMemo(
    () => moreParticulars(state, direction),
    [direction, state],
  );
  const wallets = useMemo(() => cashAccounts(state), [state.accounts]);
  const showWallet = shouldShowWalletPicker(state);
  const defaultWalletId = wallets[0]?.id ?? "";

  useEffect(() => {
    if (!open) return;
    const nextDirection: SimpleDirection =
      initial?.kind === "income" || prefill?.direction === "in" ? "in" : "out";
    const nextParticular =
      initial?.particularId ?? prefill?.particularId ?? "";
    const nextChip =
      chipIdForParticular(nextDirection, nextParticular) ||
      prefill?.chipId ||
      (nextDirection === "in" ? "paycheck" : "food");
    setDirection(nextDirection);
    setAmount(initial ? String(initial.amount) : "");
    setChipId(nextChip);
    setParticularId(nextParticular && !chipIdForParticular(nextDirection, nextParticular) ? nextParticular : "");
    setFromId(
      nextDirection === "in"
        ? (initial?.toId ?? defaultWalletId)
        : (initial?.fromId ?? defaultWalletId),
    );
    setShowMore(Boolean(nextParticular && !chipIdForParticular(nextDirection, nextParticular)));
    setAdvanced(false);
    setFeedback(null);
  }, [open, initial?.id, prefill?.chipId, prefill?.direction, prefill?.particularId, defaultWalletId]);

  function save() {
    const value = Number(amount);
    const draft = {
      direction,
      amount: value,
      chipId: particularId ? undefined : chipId || chips[0]?.id,
      particularId: particularId || null,
      fromId: direction === "out" ? fromId || null : null,
      toId: direction === "in" ? fromId || null : null,
      date: initial?.date,
    };
    const next = initial
      ? applySimpleUpdate(state, initial.id, draft)
      : applySimpleLog(state, draft);
    if (!next) return;
    if (initial) updateSimple(initial.id, draft);
    else logSimple(draft);
    setFeedback(logSaveFeedback(next));
  }

  if (!open) return null;

  if (feedback) {
    return (
      <Modal open title={editing ? "Updated" : "Logged"} onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">Cash left</p>
          <p className="font-display text-3xl font-semibold text-ink">
            {phpSmart(feedback.cashLeft)}
          </p>
          <p
            className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${
              feedback.tone === "need"
                ? "border-danger/25 bg-danger/5 text-danger"
                : feedback.tone === "tight"
                  ? "border-gold-deep/30 bg-gold-deep/5 text-gold-deep"
                  : "border-ok/30 bg-ok/5 text-ok"
            }`}
          >
            {feedback.sentence}
          </p>
          <button
            type="button"
            data-testid="log-done"
            onClick={onClose}
            className="w-full rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper"
          >
            Done
          </button>
        </div>
      </Modal>
    );
  }

  if (advanced) {
    return (
      <Modal open title="More details" onClose={onClose}>
        <RecordForm
          initial={initial}
          onSaved={onClose}
          onManageParticulars={onManageParticulars}
          onManageCategories={onManageCategories}
        />
        <button
          type="button"
          onClick={() => setAdvanced(false)}
          className="mt-3 w-full text-center text-sm font-semibold text-ink-muted underline-offset-2 hover:underline"
        >
          Back to simple log
        </button>
      </Modal>
    );
  }

  return (
    <Modal open title={editing ? "Update log" : "Log money"} onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="sr-only">In or spent</legend>
          {(
            [
              ["in", "Money in"],
              ["out", "Spent"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setDirection(id);
                setParticularId("");
                setChipId(id === "in" ? "paycheck" : "food");
                setShowMore(false);
              }}
              className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
                direction === id
                  ? "border-ink bg-ink text-paper"
                  : "border-paper-line bg-white text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </fieldset>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Amount (₱)
          </span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-paper-line bg-white px-4 py-3 font-display text-2xl outline-none"
            placeholder="0"
            required
            autoFocus
            data-testid="log-amount"
          />
        </label>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            What for?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => {
                  setChipId(chip.id);
                  setParticularId("");
                }}
                className={`rounded-full border px-3 py-2 text-sm font-semibold ${
                  chipId === chip.id && !particularId
                    ? "border-ink bg-ink text-paper"
                    : "border-paper-line bg-white text-ink"
                }`}
              >
                {chip.label}
              </button>
            ))}
            {extra.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowMore((value) => !value)}
                className="rounded-full border border-paper-line bg-paper px-3 py-2 text-sm font-semibold text-ink-muted"
              >
                More
              </button>
            ) : null}
          </div>
          {showMore ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {extra.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setParticularId(item.id);
                    setChipId("");
                  }}
                  className={`rounded-full border px-3 py-2 text-sm font-semibold ${
                    particularId === item.id
                      ? "border-ink bg-ink text-paper"
                      : "border-paper-line bg-white text-ink"
                  }`}
                >
                  {item.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {showWallet ? (
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {direction === "in" ? "Goes into" : "Paid from"}
            </span>
            <select
              value={fromId}
              onChange={(event) => setFromId(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-paper-line bg-white px-3 py-2.5 text-sm"
            >
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <button
          type="submit"
          data-testid="log-save"
          className="w-full rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper"
        >
          {editing ? "Update" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setAdvanced(true)}
          className="w-full text-center text-sm font-semibold text-ink-muted underline-offset-2 hover:underline"
        >
          More details
        </button>
      </form>
    </Modal>
  );
}
