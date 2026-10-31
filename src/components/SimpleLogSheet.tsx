"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { RecordForm } from "@/components/RecordForm";
import { useFinance } from "@/context/FinanceContext";
import { parseAmount, phpSmart, todayIso, uid } from "@/lib/money";
import {
  applyRemoveTransaction,
  checkLoanPayment,
  createWallet,
} from "@/lib/payments";
import { byKind, incompleteBalanceAccounts, isBalanceKnown } from "@/lib/selectors";
import {
  applySimpleLog,
  applySimpleUpdate,
  billLinesForMonth,
  billParticulars,
  cashAccounts,
  chipIdForParticular,
  chipsForDirection,
  defaultCashAccount,
  logSaveFeedback,
  moreParticulars,
  simpleDraftErrors,
  type LogSaveFeedback,
  type SimpleDirection,
  type SimpleDraftErrors,
  type SimpleLogDraft,
} from "@/lib/simpleLog";
import type { Transaction } from "@/lib/types";

type Prefill = {
  direction?: SimpleDirection;
  chipId?: string;
  particularId?: string;
};

type Saved = {
  id: string;
  amount: number;
  feedback: LogSaveFeedback;
  incomplete: boolean;
};

const fieldLabel =
  "text-xs font-semibold uppercase tracking-wide text-ink-muted";
const inputBox =
  "mt-1.5 w-full rounded-xl border border-paper-line bg-white px-3 py-2.5 text-sm";

export function SimpleLogSheet({
  open,
  onClose,
  prefill,
  initial,
  onManageParticulars,
  onManageCategories,
  onAddLoan,
  onAddBorrowed,
  title,
}: {
  open: boolean;
  onClose: () => void;
  prefill?: Prefill;
  initial?: Transaction | null;
  onManageParticulars?: () => void;
  onManageCategories?: () => void;
  /** Shown when Utang is picked but no loan exists yet. */
  onAddLoan?: () => void;
  /**
   * Money in: "Borrowed (utang)" chip. Borrowed cash is a loan, not income,
   * so this closes the sheet and opens Add loan with the amount typed so far.
   */
  onAddBorrowed?: (amount: string) => void;
  /** Heading for a new entry, e.g. "Add expense". */
  title?: string;
}) {
  const { state, logSimple, updateSimple, upsertAccount } = useFinance();
  const formId = useId();
  const [editId, setEditId] = useState<string | null>(initial?.id ?? null);
  const [direction, setDirection] = useState<SimpleDirection>("out");
  const [amount, setAmount] = useState("");
  const [chipId, setChipId] = useState("");
  const [particularId, setParticularId] = useState("");
  const [walletChoice, setWalletId] = useState("");
  const [liabilityId, setLiabilityId] = useState("");
  const [budgetLineId, setBudgetLineId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [confirmOverpay, setConfirmOverpay] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [newWalletName, setNewWalletName] = useState("");
  const [newWalletBalance, setNewWalletBalance] = useState("");
  const [walletError, setWalletError] = useState("");
  // One id per entry: a double tap or retry re-sends the same id, and
  // applySimpleLog ignores an id it has already stored.
  const [submissionId, setSubmissionId] = useState(uid);
  const savingRef = useRef<string | null>(null);

  const editing = Boolean(editId);
  const chips = chipsForDirection(direction);
  const extra = useMemo(() => moreParticulars(state, direction), [direction, state]);
  const bills = useMemo(() => billParticulars(state), [state]);
  const wallets = useMemo(() => cashAccounts(state), [state]);
  const loans = useMemo(() => byKind(state, "liability"), [state]);
  const defaultWalletId = defaultCashAccount(state)?.id ?? "";
  const isUtang = direction === "out" && chipId === "utang" && !particularId;
  const isBills = direction === "out" && chipId === "bills";
  const billLines = useMemo(() => {
    const rows = billLinesForMonth(state, (date || todayIso()).slice(0, 7));
    const linked = state.budgetLines.find((line) => line.id === budgetLineId);
    return linked && !rows.some((row) => row.id === linked.id) ? [linked, ...rows] : rows;
  }, [state, date, budgetLineId]);

  function resetFields(source: Transaction | null | undefined, keepDirection?: SimpleDirection) {
    const nextDirection: SimpleDirection =
      keepDirection ??
      (source?.kind === "income" || (!source && prefill?.direction === "in") ? "in" : "out");
    const nextParticular =
      source?.particularId ?? (!source && !keepDirection ? prefill?.particularId : "") ?? "";
    const fromChip = chipIdForParticular(nextDirection, nextParticular, state);
    const nextChip =
      source?.kind === "payment"
        ? "utang"
        : fromChip || (!source && !keepDirection ? (prefill?.chipId ?? "") : "");
    const isChipParticular =
      Boolean(nextParticular) &&
      chipsForDirection(nextDirection).some((c) => c.particularId === nextParticular);
    setDirection(nextDirection);
    setAmount(source ? String(source.amount) : "");
    setChipId(nextChip);
    setParticularId(nextParticular && !isChipParticular ? nextParticular : "");
    setShowMore(Boolean(nextParticular && !fromChip && source?.kind !== "payment"));
    setWalletId(
      (nextDirection === "in" ? source?.toId : source?.fromId) ?? defaultWalletId,
    );
    setLiabilityId(source?.kind === "payment" ? (source.toId ?? "") : "");
    setBudgetLineId(source?.budgetLineId ?? "");
    setDate(source?.date ?? todayIso());
    setNote(source?.note ?? "");
    setConfirmOverpay(false);
    setDetailsOpen(Boolean(source?.note || source?.budgetLineId));
    setSubmitted(false);
    setWalletError("");
  }

  // Reset when the sheet opens or a different row/prefill arrives. Done
  // during render (React's "adjust state on prop change" pattern), not in an
  // effect, so the first paint already shows the right values.
  const openKey = open
    ? [initial?.id ?? "", prefill?.direction ?? "", prefill?.chipId ?? "", prefill?.particularId ?? ""].join("|")
    : null;
  const [lastOpenKey, setLastOpenKey] = useState<string | null>(null);
  if (openKey !== lastOpenKey) {
    setLastOpenKey(openKey);
    if (openKey != null) {
      setEditId(initial?.id ?? null);
      setAdvanced(false);
      setSaved(null);
      setSaving(false);
      setSubmissionId(uid());
      resetFields(initial);
    }
  }

  // Selected wallet, or the default when none / an archived one is chosen.
  const walletId =
    walletChoice && wallets.some((w) => w.id === walletChoice) ? walletChoice : defaultWalletId;

  const parsedAmount = parseAmount(amount);
  const draft: SimpleLogDraft = {
    id: editing ? undefined : submissionId,
    direction,
    amount: parsedAmount.ok ? parsedAmount.value : NaN,
    chipId: particularId ? undefined : chipId || undefined,
    particularId: particularId || null,
    fromId: direction === "out" ? walletId || null : null,
    toId: direction === "in" ? walletId || null : null,
    date,
    note,
    liabilityId: isUtang ? liabilityId || null : null,
    budgetLineId: !isUtang && budgetLineId ? budgetLineId : null,
    confirmOverpay,
  };

  // Validate edits against the books without the row being edited.
  const base = useMemo(
    () => (editId ? applyRemoveTransaction(state, editId) : state),
    [state, editId],
  );
  const errors: SimpleDraftErrors = simpleDraftErrors(base, draft);
  if (!parsedAmount.ok) errors.amount = parsedAmount.error;
  const loanCheck = isUtang
    ? checkLoanPayment(base, {
        liabilityId: liabilityId || null,
        amount: Number.isFinite(draft.amount) ? draft.amount : 0,
        confirmOverpay: true,
      })
    : null;
  const overpay = loanCheck && loanCheck.excess > 0 ? loanCheck : null;
  const noLoans = isUtang && loans.length === 0;
  const visibleErrors = submitted ? errors : {};
  const errorList = Object.values(visibleErrors).filter(Boolean);

  function errId(field: keyof SimpleDraftErrors) {
    return `${formId}-${field}-error`;
  }

  function save() {
    setSubmitted(true);
    // Same entry already being saved (double tap): ignore.
    if (savingRef.current === submissionId) return;
    if (Object.keys(errors).length > 0) return;
    savingRef.current = submissionId;
    setSaving(true);
    const next = editId
      ? applySimpleUpdate(state, editId, draft)
      : applySimpleLog(state, draft);
    if (!next) {
      savingRef.current = null;
      setSaving(false);
      return;
    }
    const id = editId ?? submissionId;
    if (editId) updateSimple(editId, draft);
    else logSimple(draft);
    setSaved({
      id,
      amount: draft.amount,
      feedback: logSaveFeedback(next),
      incomplete: incompleteBalanceAccounts(next).length > 0,
    });
    setSaving(false);
  }

  function addWallet() {
    const result = createWallet(state, newWalletName, newWalletBalance);
    if ("error" in result) {
      setWalletError(result.error);
      return;
    }
    const account = result.state.accounts.find((a) => a.id === result.accountId);
    if (!account) return;
    upsertAccount(account);
    setWalletId(account.id);
    setNewWalletName("");
    setNewWalletBalance("");
    setWalletError("");
  }

  if (!open) return null;

  if (saved) {
    return (
      <Modal open title={editing ? "Updated" : "Saved"} onClose={onClose}>
        <div className="space-y-4">
          <p role="status" aria-live="polite" className="text-sm font-semibold text-ok">
            {editing ? "Entry updated" : "Saved"}: {phpSmart(saved.amount)}
          </p>
          <div>
            <p className="text-sm text-ink-muted">Cash left</p>
            <p className="font-display text-3xl font-semibold text-ink">
              {phpSmart(saved.feedback.cashLeft)}
            </p>
            {saved.incomplete ? (
              <p className="mt-1 text-xs font-semibold text-gold-deep">
                Balance incomplete — a wallet&apos;s starting balance was not entered.
              </p>
            ) : null}
          </div>
          <p
            className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${
              saved.feedback.tone === "need"
                ? "border-danger/25 bg-danger/5 text-danger"
                : saved.feedback.tone === "tight"
                  ? "border-gold-deep/30 bg-gold-deep/5 text-gold-deep"
                  : "border-ok/30 bg-ok/5 text-ok"
            }`}
          >
            {saved.feedback.sentence}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="log-edit-saved"
              onClick={() => {
                setEditId(saved.id);
                setSaved(null);
                savingRef.current = null;
                setSubmitted(false);
              }}
              className="rounded-full border border-paper-line bg-white px-4 py-2.5 text-sm font-semibold text-ink"
            >
              Edit
            </button>
            <button
              type="button"
              data-testid="log-add-another"
              onClick={() => {
                setEditId(null);
                setSaved(null);
                savingRef.current = null;
                setSubmissionId(uid());
                resetFields(null, direction);
              }}
              className="rounded-full border border-paper-line bg-white px-4 py-2.5 text-sm font-semibold text-ink"
            >
              Add another
            </button>
          </div>
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

  if (advanced && initial) {
    return (
      <Modal open title="More details" onClose={onClose}>
        <RecordForm
          initial={{
            ...initial,
            amount: parsedAmount.ok ? parsedAmount.value : initial.amount,
            date,
            note,
          }}
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

  const selectedWallet = wallets.find((w) => w.id === walletId);
  const manageNew = direction === "in" ? onManageParticulars : onManageCategories;

  return (
    <Modal
      open
      title={editing ? "Update log" : (title ?? "Log money")}
      onClose={onClose}
    >
      <form
        className="space-y-5"
        noValidate
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
              aria-pressed={direction === id}
              onClick={() => {
                if (direction === id) return;
                setDirection(id);
                setParticularId("");
                setChipId("");
                setShowMore(false);
                setBudgetLineId("");
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

        <label className="block" htmlFor={`${formId}-amount`}>
          <span className={fieldLabel}>Amount (₱)</span>
          <input
            id={`${formId}-amount`}
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className={`mt-1.5 w-full rounded-xl border bg-white px-4 py-3 font-display text-2xl outline-none ${
              visibleErrors.amount ? "border-danger" : "border-paper-line"
            }`}
            placeholder="0"
            required
            autoFocus
            aria-invalid={Boolean(visibleErrors.amount)}
            aria-describedby={visibleErrors.amount ? errId("amount") : undefined}
            data-testid="log-amount"
          />
          {visibleErrors.amount ? (
            <span id={errId("amount")} className="mt-1 block text-xs font-semibold text-danger">
              {visibleErrors.amount}
            </span>
          ) : null}
        </label>

        <fieldset
          aria-describedby={visibleErrors.category ? errId("category") : undefined}
        >
          <legend className={fieldLabel}>
            {direction === "in" ? "Where from?" : "Category"}{" "}
            <span className="normal-case tracking-normal">(required)</span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                aria-pressed={chipId === chip.id && (!particularId || chip.id === "bills")}
                onClick={() => {
                  setChipId(chip.id);
                  setParticularId("");
                  setConfirmOverpay(false);
                }}
                className={`rounded-full border px-3 py-2 text-sm font-semibold ${
                  chipId === chip.id && (!particularId || chip.id === "bills")
                    ? "border-ink bg-ink text-paper"
                    : "border-paper-line bg-white text-ink"
                }`}
              >
                {chip.label}
              </button>
            ))}
            {direction === "in" && onAddBorrowed && !editing ? (
              <button
                type="button"
                data-testid="log-borrowed"
                onClick={() => {
                  const typed = amount.trim();
                  onClose();
                  onAddBorrowed(typed);
                }}
                className="rounded-full border border-paper-line bg-white px-3 py-2 text-sm font-semibold text-ink"
              >
                Borrowed (utang)
              </button>
            ) : null}
            {extra.length > 0 ? (
              <button
                type="button"
                aria-expanded={showMore}
                onClick={() => setShowMore((value) => !value)}
                className="rounded-full border border-paper-line bg-paper px-3 py-2 text-sm font-semibold text-ink-muted"
              >
                More
              </button>
            ) : null}
            {manageNew && !editing ? (
              <button
                type="button"
                data-testid="log-new-category"
                aria-label={direction === "in" ? "Add a new source" : "Add a new category"}
                onClick={() => {
                  onClose();
                  manageNew();
                }}
                className="rounded-full border border-dashed border-paper-line bg-paper px-3 py-2 text-sm font-semibold text-ink-muted"
              >
                + New
              </button>
            ) : null}
          </div>
          {showMore ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {extra.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={particularId === item.id}
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
          {visibleErrors.category ? (
            <p id={errId("category")} className="mt-1 text-xs font-semibold text-danger">
              {visibleErrors.category}
            </p>
          ) : null}
        </fieldset>

        {isBills ? (
          <label className="block" htmlFor={`${formId}-bill-name`}>
            <span className={fieldLabel}>Which bill?</span>
            <select
              id={`${formId}-bill-name`}
              value={particularId}
              onChange={(event) => setParticularId(event.target.value)}
              className={inputBox}
              data-testid="log-bill-name"
            >
              <option value="">Choose a bill</option>
              {bills.map((bill) => (
                <option key={bill.id} value={bill.id}>
                  {bill.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {isUtang ? (
          noLoans ? (
            <div
              className="rounded-xl border border-gold-deep/30 bg-gold-deep/5 px-3 py-2.5 text-sm text-ink"
              data-testid="log-no-loans"
            >
              <p>You have no loans yet. Add the loan first, then record the payment.</p>
              {onAddLoan ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onAddLoan();
                  }}
                  className="mt-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper"
                >
                  Add loan
                </button>
              ) : null}
            </div>
          ) : (
            <label className="block" htmlFor={`${formId}-loan`}>
              <span className={fieldLabel}>Which loan? (required)</span>
              <select
                id={`${formId}-loan`}
                value={liabilityId}
                onChange={(event) => {
                  setLiabilityId(event.target.value);
                  setConfirmOverpay(false);
                }}
                className={inputBox}
                aria-invalid={Boolean(visibleErrors.loan)}
                aria-describedby={visibleErrors.loan ? errId("loan") : undefined}
                data-testid="log-loan"
              >
                <option value="">Choose a loan</option>
                {loans.map((loan) => (
                  <option key={loan.id} value={loan.id}>
                    {loan.name}
                  </option>
                ))}
              </select>
              {overpay ? (
                <span className="mt-2 block rounded-xl border border-gold-deep/30 bg-gold-deep/5 px-3 py-2 text-sm text-ink">
                  Only {phpSmart(overpay.remaining)} is still owed. This is{" "}
                  {phpSmart(overpay.excess)} more.
                  <span className="mt-1.5 flex items-center gap-2">
                    <input
                      id={`${formId}-overpay`}
                      type="checkbox"
                      checked={confirmOverpay}
                      onChange={(event) => setConfirmOverpay(event.target.checked)}
                      data-testid="log-confirm-overpay"
                    />
                    <label htmlFor={`${formId}-overpay`} className="font-semibold">
                      Yes, record the full amount
                    </label>
                  </span>
                </span>
              ) : null}
              {visibleErrors.loan && !overpay ? (
                <span id={errId("loan")} className="mt-1 block text-xs font-semibold text-danger">
                  {visibleErrors.loan}
                </span>
              ) : null}
            </label>
          )
        ) : null}

        {wallets.length === 0 ? (
          <div className="rounded-xl border border-paper-line bg-white/70 p-3">
            <p className="text-sm font-semibold text-ink">Add a wallet to record this</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              Where the money is kept, like Cash or GCash. Leave the balance blank if
              you are not sure.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="block text-xs text-ink-muted" htmlFor={`${formId}-wallet-name`}>
                Wallet name
                <input
                  id={`${formId}-wallet-name`}
                  value={newWalletName}
                  onChange={(event) => setNewWalletName(event.target.value)}
                  className={inputBox}
                  placeholder="Cash"
                  data-testid="log-new-wallet-name"
                />
              </label>
              <label className="block text-xs text-ink-muted" htmlFor={`${formId}-wallet-balance`}>
                Starting balance (optional)
                <input
                  id={`${formId}-wallet-balance`}
                  inputMode="decimal"
                  value={newWalletBalance}
                  onChange={(event) => setNewWalletBalance(event.target.value)}
                  className={inputBox}
                  placeholder="Not sure"
                />
              </label>
            </div>
            {walletError ? (
              <p role="alert" className="mt-1 text-xs font-semibold text-danger">
                {walletError}
              </p>
            ) : null}
            <button
              type="button"
              onClick={addWallet}
              className="mt-2 rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold text-ink"
              data-testid="log-new-wallet-add"
            >
              Add wallet
            </button>
          </div>
        ) : wallets.length === 1 ? (
          <p className="text-sm text-ink-muted" data-testid="log-wallet-default">
            {direction === "in" ? "Goes into" : "Paid from"}:{" "}
            <span className="font-semibold text-ink">{selectedWallet?.name ?? wallets[0].name}</span>
            {selectedWallet && !isBalanceKnown(selectedWallet) ? (
              <span className="ml-1 text-xs font-semibold text-gold-deep">(balance incomplete)</span>
            ) : null}
          </p>
        ) : (
          <label className="block" htmlFor={`${formId}-wallet`}>
            <span className={fieldLabel}>{direction === "in" ? "Goes into" : "Paid from"}</span>
            <select
              id={`${formId}-wallet`}
              value={walletId}
              onChange={(event) => setWalletId(event.target.value)}
              className={inputBox}
              aria-invalid={Boolean(visibleErrors.wallet)}
              data-testid="log-wallet"
            >
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name}
                  {isBalanceKnown(wallet) ? "" : " (balance incomplete)"}
                </option>
              ))}
            </select>
          </label>
        )}
        {visibleErrors.wallet ? (
          <p className="-mt-3 text-xs font-semibold text-danger">{visibleErrors.wallet}</p>
        ) : null}

        <div>
          <button
            type="button"
            aria-expanded={detailsOpen}
            aria-controls={`${formId}-details`}
            onClick={() => setDetailsOpen((value) => !value)}
            className="text-sm font-semibold text-ink underline-offset-2 hover:underline"
            data-testid="log-details-toggle"
          >
            {detailsOpen ? "Hide details" : "Add date, note or bill"}
          </button>
          {/* Hidden, not unmounted: values typed here are kept when collapsed. */}
          <div id={`${formId}-details`} hidden={!detailsOpen} className="mt-3 space-y-4">
            <label className="block" htmlFor={`${formId}-date`}>
              <span className={fieldLabel}>Date</span>
              <input
                id={`${formId}-date`}
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className={inputBox}
                data-testid="log-date"
              />
              {visibleErrors.date ? (
                <span className="mt-1 block text-xs font-semibold text-danger">
                  {visibleErrors.date}
                </span>
              ) : null}
            </label>
            <label className="block" htmlFor={`${formId}-note`}>
              <span className={fieldLabel}>Note (optional)</span>
              <input
                id={`${formId}-note`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className={inputBox}
                placeholder="e.g. palengke, Meralco"
                data-testid="log-note"
              />
            </label>
            {direction === "out" && !isUtang ? (
              <label className="block" htmlFor={`${formId}-bill-link`}>
                <span className={fieldLabel}>Planned bill (optional)</span>
                <select
                  id={`${formId}-bill-link`}
                  value={budgetLineId}
                  onChange={(event) => setBudgetLineId(event.target.value)}
                  className={inputBox}
                  data-testid="log-bill-link"
                >
                  <option value="">Not linked to a planned bill</option>
                  {billLines.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.particular || "Planned bill"}
                      {line.due ? ` · due ${line.due}` : ""} · {phpSmart(line.expense)}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-ink-muted">
                  Linking marks that planned bill as paid.
                </span>
              </label>
            ) : null}
          </div>
        </div>

        <div role="status" aria-live="polite" className="sr-only">
          {errorList.length > 0 ? `Please fix: ${errorList.join(" ")}` : ""}
        </div>

        <button
          type="submit"
          data-testid="log-save"
          disabled={saving}
          aria-disabled={saving}
          className="w-full rounded-full bg-ink px-5 py-3 text-sm font-semibold text-paper disabled:opacity-60"
        >
          {saving ? "Saving…" : editing ? "Update" : "Save"}
        </button>
        {editing && initial && initial.id === editId ? (
          <button
            type="button"
            onClick={() => setAdvanced(true)}
            className="w-full text-center text-sm font-semibold text-ink-muted underline-offset-2 hover:underline"
          >
            More details
          </button>
        ) : null}
      </form>
    </Modal>
  );
}
