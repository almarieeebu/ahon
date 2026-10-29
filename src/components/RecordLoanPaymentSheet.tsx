"use client";

import { useId, useRef, useState } from "react";
import { FieldError } from "@/components/AddLoanSheet";
import { Modal } from "@/components/Modal";
import { useFinance } from "@/context/FinanceContext";
import { parseAmount, phpSmart, todayIso, uid } from "@/lib/money";
import {
  applyLoanPayment,
  checkLoanPayment,
  installmentShortfall,
  liabilityRemaining,
} from "@/lib/payments";
import { UNTRACKED_PAYMENT_SOURCE } from "@/lib/paymentSource";
import { longDate, nextUnpaid } from "@/lib/schedule";
import { byKind, isBalanceKnown } from "@/lib/selectors";

const fieldLabel = "text-xs font-semibold uppercase tracking-wide text-ink-muted";
const inputBox =
  "mt-1.5 w-full rounded-xl border border-paper-line bg-white px-3 py-2.5 text-sm text-ink";

type Errors = { loan?: string; amount?: string; from?: string; date?: string };

/**
 * Record payment toward one explicit loan (prefilled from the card it was
 * opened on). Partial payments are fine; paying more than is owed needs a
 * review step. Never falls back to another loan.
 */
export function RecordLoanPaymentSheet({
  loanId,
  onClose,
  onAddLoan,
}: {
  /** null = closed. */
  loanId: string | null;
  onClose: () => void;
  onAddLoan?: () => void;
}) {
  if (loanId == null) return null;
  return <PaymentForm key={loanId} loanId={loanId} onClose={onClose} onAddLoan={onAddLoan} />;
}

function PaymentForm({
  loanId,
  onClose,
  onAddLoan,
}: {
  loanId: string;
  onClose: () => void;
  onAddLoan?: () => void;
}) {
  const { state, balances, recordLoanPayment } = useFinance();
  const baseId = useId();
  const loans = byKind(state, "liability");
  const cash = byKind(state, "cash");
  const payFrom = [...cash, ...byKind(state, "savings")];

  const [target, setTarget] = useState(loans.some((l) => l.id === loanId) ? loanId : "");
  const [amount, setAmount] = useState("");
  const [fromId, setFromId] = useState(cash.length === 1 ? cash[0].id : "");
  const [date, setDate] = useState(todayIso());
  const [errors, setErrors] = useState<Errors>({});
  const [review, setReview] = useState<{ excess: number; remaining: number } | null>(null);
  const [saved, setSaved] = useState<{ name: string; amount: number; remaining: number } | null>(null);
  const idRef = useRef(uid());
  const savingRef = useRef(false);

  const loan = loans.find((l) => l.id === target);
  const next = loan?.mode === "installment" ? nextUnpaid(loan.schedule) : undefined;
  const nextDue = next ? installmentShortfall(next) : 0;
  const owed = loan ? liabilityRemaining(state, loan.id) : 0;

  function errId(field: keyof Errors) {
    return `${baseId}-${field}-error`;
  }

  function validate(): { amount: number; from: string | null } | null {
    const found: Errors = {};
    if (!target) found.loan = "Choose which loan this payment is for.";
    const parsed = parseAmount(amount);
    if (!parsed.ok) found.amount = parsed.error;
    if (!fromId) {
      found.from = "Choose where the money came from, or “Paid from money Ahon does not track”.";
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) found.date = "Enter a valid date.";
    setErrors(found);
    if (Object.keys(found).length > 0 || !parsed.ok) return null;
    return { amount: parsed.value, from: fromId === UNTRACKED_PAYMENT_SOURCE ? null : fromId };
  }

  function save(confirmOverpay = false) {
    if (savingRef.current) return;
    const valid = validate();
    if (!valid) return;
    const check = checkLoanPayment(state, {
      liabilityId: target,
      amount: valid.amount,
      confirmOverpay,
    });
    if (check.reason === "overpay" && !confirmOverpay) {
      setReview({ excess: check.excess, remaining: check.remaining });
      return;
    }
    if (check.error) {
      setErrors({ loan: check.error });
      return;
    }
    const input = {
      liabilityId: target,
      amount: valid.amount,
      fromId: valid.from,
      date,
      id: idRef.current,
      confirmOverpay,
    };
    const preview = applyLoanPayment(state, input);
    if (!preview) {
      setErrors({ amount: "Could not save this payment. Check the details." });
      return;
    }
    savingRef.current = true;
    recordLoanPayment(input);
    setReview(null);
    setSaved({
      name: loan?.name ?? "this loan",
      amount: valid.amount,
      remaining: liabilityRemaining(preview, target),
    });
  }

  function another() {
    idRef.current = uid();
    savingRef.current = false;
    setAmount("");
    setDate(todayIso());
    setSaved(null);
    setErrors({});
  }

  if (loans.length === 0) {
    return (
      <Modal open title="Record payment" onClose={onClose}>
        <div className="space-y-3 text-sm">
          <p className="text-ink-muted" data-testid="pay-no-loans">
            You have no loans yet. Add the loan first, then record the payment.
          </p>
          {onAddLoan ? (
            <button
              type="button"
              onClick={onAddLoan}
              className="rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-paper"
            >
              Add loan
            </button>
          ) : null}
        </div>
      </Modal>
    );
  }

  return (
    <Modal open title={saved ? "Payment saved" : "Record payment"} onClose={onClose}>
      {saved ? (
        <div className="space-y-4">
          <div
            role="status"
            aria-live="polite"
            data-testid="pay-result"
            className="rounded-xl border border-ok/30 bg-ok/5 p-4 text-sm text-ink"
          >
            <p className="font-semibold">
              Paid {phpSmart(saved.amount)} on {saved.name}.
            </p>
            <p className="mt-1">
              {saved.remaining > 0
                ? `${phpSmart(saved.remaining)} still owed.`
                : "Nothing left to pay on this loan."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={another}
              className="rounded-full border border-ink/20 bg-white px-4 py-2.5 text-sm font-semibold text-ink"
            >
              Record another
            </button>
            <button
              type="button"
              data-testid="pay-done"
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
          <label className="block">
            <span className={fieldLabel}>Loan</span>
            <select
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setReview(null);
              }}
              data-testid="pay-loan"
              aria-invalid={Boolean(errors.loan)}
              aria-describedby={errors.loan ? errId("loan") : undefined}
              className={inputBox}
            >
              <option value="">Choose a loan</option>
              {loans.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {phpSmart(liabilityRemaining(state, l.id))} owed
                </option>
              ))}
            </select>
            <FieldError id={errId("loan")} message={errors.loan} />
          </label>

          {loan ? (
            <p className="text-sm text-ink-muted">
              {phpSmart(owed)} still owed on {loan.name}.
              {next
                ? ` Next scheduled payment: ${phpSmart(nextDue)} due ${longDate(next.due)}.`
                : ""}
            </p>
          ) : null}

          <label className="block">
            <span className={fieldLabel}>Amount paid (₱)</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setReview(null);
              }}
              data-testid="pay-amount"
              aria-invalid={Boolean(errors.amount)}
              aria-describedby={errors.amount ? errId("amount") : undefined}
              className={inputBox}
            />
            <FieldError id={errId("amount")} message={errors.amount} />
          </label>
          {next && nextDue > 0 ? (
            <button
              type="button"
              onClick={() => setAmount(String(nextDue))}
              data-testid="pay-use-next"
              className="text-xs font-semibold text-gold-deep"
            >
              Use the scheduled amount ({phpSmart(nextDue)})
            </button>
          ) : null}

          <label className="block">
            <span className={fieldLabel}>Paid from</span>
            <select
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
              data-testid="pay-from"
              aria-invalid={Boolean(errors.from)}
              aria-describedby={errors.from ? errId("from") : undefined}
              className={inputBox}
            >
              <option value="">Choose where it came from</option>
              {payFrom.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {isBalanceKnown(a) ? ` · ${phpSmart(balances[a.id] ?? 0)}` : " (balance incomplete)"}
                </option>
              ))}
              <option value={UNTRACKED_PAYMENT_SOURCE}>
                Paid from money Ahon does not track
              </option>
            </select>
            {fromId === UNTRACKED_PAYMENT_SOURCE ? (
              <span className="mt-1 block text-xs text-gold-deep">
                The debt goes down; no wallet changes.
              </span>
            ) : null}
            <FieldError id={errId("from")} message={errors.from} />
          </label>

          <label className="block">
            <span className={fieldLabel}>Date paid</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              data-testid="pay-date"
              aria-invalid={Boolean(errors.date)}
              aria-describedby={errors.date ? errId("date") : undefined}
              className={inputBox}
            />
            <FieldError id={errId("date")} message={errors.date} />
          </label>

          {review ? (
            <div
              role="alert"
              data-testid="pay-overpay"
              className="space-y-3 rounded-xl border border-gold-deep/40 bg-gold-deep/10 p-3 text-sm text-ink"
            >
              <p>
                This is {phpSmart(review.excess)} more than the {phpSmart(review.remaining)} still
                owed. Record it anyway?
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="pay-confirm-overpay"
                  onClick={() => save(true)}
                  className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper"
                >
                  Record anyway
                </button>
                <button
                  type="button"
                  onClick={() => setReview(null)}
                  className="rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-semibold text-ink"
                >
                  Change amount
                </button>
              </div>
            </div>
          ) : null}

          <p role="status" aria-live="polite" className="sr-only">
            {Object.values(errors).filter(Boolean).join(" ")}
          </p>

          <button
            type="submit"
            data-testid="pay-save"
            className="w-full rounded-full bg-ink py-3 text-sm font-semibold text-paper"
          >
            Save payment
          </button>
        </form>
      )}
    </Modal>
  );
}
