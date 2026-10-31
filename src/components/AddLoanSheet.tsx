"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { Modal } from "@/components/Modal";
import { useFinance } from "@/context/FinanceContext";
import {
  applyAddExistingLoan,
  applyNewBorrowing,
  canBuildSchedule,
  type LoanFieldErrors,
} from "@/lib/loans";
import { phpSmart, todayIso, uid } from "@/lib/money";
import { liabilityRemaining } from "@/lib/payments";
import { longDate } from "@/lib/schedule";
import { byKind, isBalanceKnown } from "@/lib/selectors";
import type { LiabilityType } from "@/lib/types";

export type LoanKind = "existing" | "new";

const NEW_WALLET = "__new_wallet__";

const TYPES: { id: LiabilityType; label: string }[] = [
  { id: "other", label: "Other / not sure" },
  { id: "personal", label: "Personal or salary loan" },
  { id: "credit-card", label: "Credit card" },
  { id: "housing", label: "Housing loan" },
];

const fieldLabel = "text-xs font-semibold uppercase tracking-wide text-ink-muted";
const inputBox =
  "mt-1.5 w-full rounded-xl border border-paper-line bg-white px-3 py-2.5 text-sm text-ink";

type Saved = {
  kind: LoanKind;
  name: string;
  owed: number;
  walletName?: string;
  amount?: number;
  scheduleCount?: number;
};

/**
 * Add loan: first choose "I already owe this" (debt only, cash unchanged) or
 * "I received this money now" (debt and wallet both rise; not income).
 * Only name + amount (and the receiving wallet for new borrowing) are needed;
 * everything else is optional under More details. No preset numbers.
 */
export function AddLoanSheet({
  open,
  onClose,
  onViewLoans,
  initialKind,
  initialAmount,
}: {
  open: boolean;
  onClose: () => void;
  /** Shown after saving when opened outside the Loans page. */
  onViewLoans?: () => void;
  /** Preselect "I already owe this" or "I received this money now". */
  initialKind?: LoanKind;
  /** Prefill the amount, e.g. what was typed in Log money. */
  initialAmount?: string;
}) {
  if (!open) return null;
  return (
    <AddLoanForm
      onClose={onClose}
      onViewLoans={onViewLoans}
      initialKind={initialKind}
      initialAmount={initialAmount}
    />
  );
}

function AddLoanForm({
  onClose,
  onViewLoans,
  initialKind,
  initialAmount,
}: {
  onClose: () => void;
  onViewLoans?: () => void;
  initialKind?: LoanKind;
  initialAmount?: string;
}) {
  const { state, addExistingLoan, addNewBorrowing } = useFinance();
  const baseId = useId();
  const wallets = [...byKind(state, "cash"), ...byKind(state, "savings")];

  const [kind, setKind] = useState<LoanKind | "">(initialKind ?? "");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(initialAmount ?? "");
  const [walletChoice, setWalletChoice] = useState(
    wallets.length === 1 ? wallets[0].id : "",
  );
  const [newWalletName, setNewWalletName] = useState("");
  const [newWalletBalance, setNewWalletBalance] = useState("");
  const [date, setDate] = useState(todayIso());
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [nextDue, setNextDue] = useState("");
  const [payment, setPayment] = useState("");
  const [paymentsLeft, setPaymentsLeft] = useState("");
  const [rate, setRate] = useState("");
  const [type, setType] = useState<LiabilityType>("other");
  const [errors, setErrors] = useState<LoanFieldErrors & { kind?: string }>({});
  const [saved, setSaved] = useState<Saved | null>(null);
  // Fixed ids per attempt: a double tap or retry cannot add the loan twice.
  const ids = useRef({ loan: uid(), tx: uid() });
  const savingRef = useRef(false);

  const walletId = wallets.length === 0 ? NEW_WALLET : walletChoice;
  const creatingWallet = walletId === NEW_WALLET;

  function errId(field: string) {
    return `${baseId}-${field}-error`;
  }

  function resetForAnother() {
    ids.current = { loan: uid(), tx: uid() };
    savingRef.current = false;
    setKind("");
    setName("");
    setAmount("");
    setNextDue("");
    setPayment("");
    setPaymentsLeft("");
    setRate("");
    setType("other");
    setDetailsOpen(false);
    setDate(todayIso());
    setErrors({});
    setSaved(null);
  }

  function save() {
    if (savingRef.current) return;
    if (!kind) {
      setErrors({ kind: "Choose one: I already owe this, or I received this money now." });
      return;
    }
    const details = {
      nextDue,
      payment,
      paymentsLeft: kind === "existing" ? paymentsLeft : "",
      monthlyRatePct: rate,
      liabilityType: type,
    };
    if (kind === "existing") {
      const input = { ...details, name, owed: amount, id: ids.current.loan };
      const result = applyAddExistingLoan(state, input);
      if (!result.ok) {
        setErrors(result.errors);
        if (result.errors.nextDue || result.errors.payment || result.errors.paymentsLeft || result.errors.monthlyRatePct) {
          setDetailsOpen(true);
        }
        return;
      }
      savingRef.current = true;
      addExistingLoan(input);
      const loan = result.state.accounts.find((a) => a.id === result.loanId);
      setErrors({});
      setSaved({
        kind,
        name: name.trim(),
        owed: liabilityRemaining(result.state, result.loanId),
        scheduleCount: loan?.schedule?.length,
      });
      return;
    }
    const input = {
      ...details,
      name,
      amount,
      date,
      walletId: creatingWallet ? undefined : walletId || undefined,
      newWallet: creatingWallet
        ? { name: newWalletName, balance: newWalletBalance }
        : undefined,
      id: ids.current.loan,
      txId: ids.current.tx,
    };
    const result = applyNewBorrowing(state, input);
    if (!result.ok) {
      setErrors(result.errors);
      if (result.errors.nextDue || result.errors.payment || result.errors.monthlyRatePct) {
        setDetailsOpen(true);
      }
      return;
    }
    savingRef.current = true;
    addNewBorrowing(input);
    const wallet = result.state.accounts.find((a) => a.id === result.walletId);
    const borrowed = result.state.transactions.find((t) => t.id === ids.current.tx);
    setErrors({});
    setSaved({
      kind,
      name: name.trim(),
      owed: liabilityRemaining(result.state, result.loanId),
      walletName: wallet?.name,
      amount: borrowed?.amount,
    });
  }

  const errorList = Object.values(errors).filter(Boolean);
  const scheduleReady =
    kind === "existing" && canBuildSchedule({ nextDue, payment, paymentsLeft });

  return (
    <Modal open title={saved ? "Loan added" : "Add loan"} onClose={onClose}>
      {saved ? (
        <div className="space-y-4">
          <div
            role="status"
            aria-live="polite"
            data-testid="loan-saved"
            className="rounded-xl border border-ok/30 bg-ok/5 p-4 text-sm text-ink"
          >
            <p className="font-semibold">
              {saved.name} added. You owe {phpSmart(saved.owed)}.
            </p>
            {saved.kind === "new" ? (
              <p className="mt-1 text-ink-muted">
                {phpSmart(saved.amount ?? 0)} was added to {saved.walletName ?? "your wallet"} and
                to what you owe. It is not counted as income.
              </p>
            ) : (
              <p className="mt-1 text-ink-muted">
                Your cash did not change.
                {saved.scheduleCount
                  ? ` A schedule of ${saved.scheduleCount} payments was made.`
                  : ""}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {onViewLoans ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onViewLoans();
                }}
                className="rounded-full border border-ink/20 bg-white px-4 py-2.5 text-sm font-semibold text-ink"
              >
                View loans
              </button>
            ) : null}
            <button
              type="button"
              onClick={resetForAnother}
              className="rounded-full border border-ink/20 bg-white px-4 py-2.5 text-sm font-semibold text-ink"
            >
              Add another loan
            </button>
            <button
              type="button"
              data-testid="loan-done"
              onClick={onClose}
              className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
          className="space-y-4"
        >
          <fieldset aria-describedby={errors.kind ? errId("kind") : undefined}>
            <legend className={fieldLabel}>Which is it?</legend>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              <KindOption
                checked={kind === "existing"}
                onChange={() => setKind("existing")}
                testId="loan-kind-existing"
                title="I already owe this"
                body="A loan or utang you have now. Your cash does not change."
              />
              <KindOption
                checked={kind === "new"}
                onChange={() => setKind("new")}
                testId="loan-kind-new"
                title="I received this money now"
                body="You just borrowed. Your wallet and what you owe both go up."
              />
            </div>
            <FieldError id={errId("kind")} message={errors.kind} />
          </fieldset>

          {kind ? (
            <>
              <label className="block">
                <span className={fieldLabel}>Loan name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-testid="loan-name"
                  placeholder="e.g. SSS loan, Utang kay Ate"
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? errId("name") : undefined}
                  className={inputBox}
                />
                <FieldError id={errId("name")} message={errors.name} />
              </label>

              <label className="block">
                <span className={fieldLabel}>
                  {kind === "existing" ? "Amount still owed (₱)" : "Amount received (₱)"}
                </span>
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  data-testid="loan-amount"
                  aria-invalid={Boolean(errors.owed || errors.amount)}
                  aria-describedby={
                    errors.owed || errors.amount ? errId("amount") : undefined
                  }
                  className={inputBox}
                />
                <FieldError id={errId("amount")} message={errors.owed ?? errors.amount} />
              </label>

              {kind === "new" ? (
                <>
                  {wallets.length > 0 ? (
                    <label className="block">
                      <span className={fieldLabel}>Received into</span>
                      <select
                        value={walletChoice}
                        onChange={(e) => setWalletChoice(e.target.value)}
                        data-testid="loan-wallet"
                        aria-invalid={Boolean(errors.wallet)}
                        aria-describedby={errors.wallet ? errId("wallet") : undefined}
                        className={inputBox}
                      >
                        <option value="">Choose a wallet</option>
                        {wallets.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                            {isBalanceKnown(w) ? "" : " (balance incomplete)"}
                          </option>
                        ))}
                        <option value={NEW_WALLET}>+ New wallet</option>
                      </select>
                    </label>
                  ) : (
                    <p className="text-sm text-ink-muted">
                      You have no wallet yet. Name the one that received the money.
                    </p>
                  )}
                  {creatingWallet ? (
                    <div className="grid gap-3 rounded-xl border border-paper-line bg-white/70 p-3 sm:grid-cols-2">
                      <label className="block">
                        <span className={fieldLabel}>Wallet name</span>
                        <input
                          value={newWalletName}
                          onChange={(e) => setNewWalletName(e.target.value)}
                          data-testid="loan-new-wallet-name"
                          placeholder="e.g. Cash, GCash"
                          aria-invalid={Boolean(errors.wallet)}
                          aria-describedby={errors.wallet ? errId("wallet") : undefined}
                          className={inputBox}
                        />
                      </label>
                      <label className="block">
                        <span className={fieldLabel}>Balance before this (optional)</span>
                        <input
                          inputMode="decimal"
                          value={newWalletBalance}
                          onChange={(e) => setNewWalletBalance(e.target.value)}
                          className={inputBox}
                        />
                        <span className="mt-1 block text-[11px] text-ink-muted">
                          Blank is fine; the balance shows as incomplete, not ₱0.
                        </span>
                      </label>
                    </div>
                  ) : null}
                  <FieldError id={errId("wallet")} message={errors.wallet} />

                  <label className="block">
                    <span className={fieldLabel}>Date received</span>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      aria-invalid={Boolean(errors.date)}
                      aria-describedby={errors.date ? errId("date") : undefined}
                      className={inputBox}
                    />
                    <FieldError id={errId("date")} message={errors.date} />
                  </label>
                </>
              ) : null}

              <button
                type="button"
                onClick={() => setDetailsOpen((v) => !v)}
                aria-expanded={detailsOpen}
                data-testid="loan-details-toggle"
                className="text-sm font-semibold text-gold-deep"
              >
                {detailsOpen ? "Hide more details" : "More details (optional)"}
              </button>

              {detailsOpen ? (
                <div className="space-y-3 rounded-xl border border-paper-line bg-white/70 p-3">
                  <p className="text-xs text-ink-muted">
                    All optional. Leave blank anything you do not know.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className={fieldLabel}>Next due date</span>
                      <input
                        type="date"
                        value={nextDue}
                        onChange={(e) => setNextDue(e.target.value)}
                        data-testid="loan-next-due"
                        aria-invalid={Boolean(errors.nextDue)}
                        aria-describedby={errors.nextDue ? errId("nextDue") : undefined}
                        className={inputBox}
                      />
                      <FieldError id={errId("nextDue")} message={errors.nextDue} />
                    </label>
                    <label className="block">
                      <span className={fieldLabel}>Regular payment (₱)</span>
                      <input
                        inputMode="decimal"
                        value={payment}
                        onChange={(e) => setPayment(e.target.value)}
                        data-testid="loan-payment"
                        aria-invalid={Boolean(errors.payment)}
                        aria-describedby={errors.payment ? errId("payment") : undefined}
                        className={inputBox}
                      />
                      <FieldError id={errId("payment")} message={errors.payment} />
                    </label>
                    {kind === "existing" ? (
                      <label className="block">
                        <span className={fieldLabel}>Payments left</span>
                        <input
                          inputMode="numeric"
                          value={paymentsLeft}
                          onChange={(e) => setPaymentsLeft(e.target.value)}
                          data-testid="loan-payments-left"
                          aria-invalid={Boolean(errors.paymentsLeft)}
                          aria-describedby={
                            errors.paymentsLeft ? errId("paymentsLeft") : undefined
                          }
                          className={inputBox}
                        />
                        <FieldError id={errId("paymentsLeft")} message={errors.paymentsLeft} />
                      </label>
                    ) : null}
                    <label className="block">
                      <span className={fieldLabel}>Interest per month (%)</span>
                      <input
                        inputMode="decimal"
                        value={rate}
                        onChange={(e) => setRate(e.target.value)}
                        placeholder="Not known"
                        aria-invalid={Boolean(errors.monthlyRatePct)}
                        aria-describedby={`${baseId}-rate-hint${errors.monthlyRatePct ? ` ${errId("rate")}` : ""}`}
                        className={inputBox}
                      />
                      <span id={`${baseId}-rate-hint`} className="mt-1 block text-[11px] text-ink-muted">
                        Blank means not known (not 0%).
                      </span>
                      <FieldError id={errId("rate")} message={errors.monthlyRatePct} />
                    </label>
                    <label className="block">
                      <span className={fieldLabel}>Kind of loan</span>
                      <select
                        value={type}
                        onChange={(e) => setType(e.target.value as LiabilityType)}
                        className={inputBox}
                      >
                        {TYPES.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {kind === "existing" ? (
                    <p className="text-xs text-ink-muted" aria-live="polite">
                      {scheduleReady
                        ? `Ahon will list ${paymentsLeft} payments of ${payment} starting ${nextDue ? longDate(nextDue) : ""}.`
                        : "Add the next due date, regular payment and payments left to get a payment schedule."}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

          <p role="status" aria-live="polite" className="sr-only">
            {errorList.length > 0 ? `Please fix: ${errorList.join(" ")}` : ""}
          </p>

          <button
            type="submit"
            data-testid="loan-save"
            className="w-full rounded-full bg-ink py-3 text-sm font-semibold text-paper"
          >
            Add loan
          </button>
        </form>
      )}
    </Modal>
  );
}

function KindOption({
  checked,
  onChange,
  testId,
  title,
  body,
}: {
  checked: boolean;
  onChange: () => void;
  testId: string;
  title: string;
  body: ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-left text-sm focus-within:outline focus-within:outline-2 focus-within:outline-gold-deep ${
        checked ? "border-ink bg-ink/5" : "border-paper-line bg-white"
      }`}
    >
      <input
        type="radio"
        name="loan-kind"
        checked={checked}
        onChange={onChange}
        data-testid={testId}
        className="mt-1 size-4 shrink-0"
      />
      <span>
        <span className="block font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-xs text-ink-muted">{body}</span>
      </span>
    </label>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={id} className="mt-1 block text-xs font-semibold text-danger">
      {message}
    </span>
  );
}
