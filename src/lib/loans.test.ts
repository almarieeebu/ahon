import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { emptyAccount, presetState } from "@/lib/defaults";
import { applyAddExistingLoan, applyNewBorrowing } from "@/lib/loans";
import {
  applyLoanPayment,
  applyRemoveTransaction,
  checkLoanPayment,
  liabilityRemaining,
} from "@/lib/payments";
import { buildMonthlySchedule, scheduledRepaymentsLeft } from "@/lib/schedule";
import { accountBalances, deriveMonth, sumKind } from "@/lib/selectors";
import { applySimpleUpdate } from "@/lib/simpleLog";
import type { AppState } from "@/lib/types";

function books(): AppState {
  const state = presetState();
  state.accounts[0].openingBalance = 10000;
  state.accounts[0].balanceKnown = true;
  state.settings.setupComplete = true;
  return state;
}

const CASH = "cash-on-hand";

function cashOf(state: AppState): number {
  return accountBalances(state)[CASH];
}

function mustOk<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  assert.equal(r.ok, true, JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
}

describe("existing loan (I already owe this)", () => {
  it("adds debt without changing cash, with only name + amount", () => {
    const state = books();
    const r = mustOk(applyAddExistingLoan(state, { name: "SSS loan", owed: "12,000" }));
    assert.equal(liabilityRemaining(r.state, r.loanId), 12000);
    assert.equal(cashOf(r.state), 10000);
    assert.equal(r.state.transactions.length, 0);
    assert.equal(sumKind(r.state, accountBalances(r.state), "liability"), 12000);
    const loan = r.state.accounts.find((a) => a.id === r.loanId)!;
    assert.equal(loan.mode, "revolving");
    assert.equal(loan.schedule, undefined);
    // Unknown interest is stored as unknown, not as a guessed rate.
    assert.equal(loan.interestKnown, false);
    assert.equal(loan.monthlyRate, 0);
    assert.equal(loan.dueDay, 0);
  });

  it("requires a name and a valid amount", () => {
    const r = applyAddExistingLoan(books(), { name: " ", owed: "abc" });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.errors.name);
      assert.ok(r.errors.owed);
    }
  });

  it("stores a known 0% rate as known", () => {
    const r = mustOk(
      applyAddExistingLoan(books(), { name: "Ate", owed: "500", monthlyRatePct: "0" }),
    );
    const loan = r.state.accounts.find((a) => a.id === r.loanId)!;
    assert.equal(loan.interestKnown, true);
    assert.equal(loan.monthlyRate, 0);
  });

  it("builds a schedule only with next due date, payment and number of payments", () => {
    const partial = mustOk(
      applyAddExistingLoan(books(), { name: "Car", owed: "9000", payment: "1000" }),
    );
    const noSchedule = partial.state.accounts.find((a) => a.id === partial.loanId)!;
    assert.equal(noSchedule.schedule, undefined);
    assert.equal(noSchedule.plannedPayment, 1000);

    const full = mustOk(
      applyAddExistingLoan(books(), {
        name: "Car",
        owed: "9000",
        payment: "1000",
        paymentsLeft: "10",
        nextDue: "2027-01-31",
      }),
    );
    const loan = full.state.accounts.find((a) => a.id === full.loanId)!;
    assert.equal(loan.mode, "installment");
    assert.equal(loan.schedule?.length, 10);
    assert.equal(loan.schedule?.[1].due, "2027-02-28");
    // Amount owed (what they told us) vs total scheduled repayments differ.
    assert.equal(liabilityRemaining(full.state, loan.id), 9000);
    assert.equal(scheduledRepaymentsLeft(loan.schedule), 10000);
    assert.equal(cashOf(full.state), 10000);
  });

  it("is idempotent for the same id (double submit)", () => {
    const once = mustOk(applyAddExistingLoan(books(), { name: "A", owed: "100", id: "loan-1" }));
    const twice = mustOk(applyAddExistingLoan(once.state, { name: "A", owed: "100", id: "loan-1" }));
    assert.equal(twice.state.accounts.filter((a) => a.id === "loan-1").length, 1);
  });
});

describe("new borrowing (I received this money now)", () => {
  it("raises cash and debt together and is not income", () => {
    const state = books();
    const r = mustOk(
      applyNewBorrowing(state, { name: "Salary loan", amount: "5000", walletId: CASH, date: "2026-10-05" }),
    );
    assert.equal(cashOf(r.state), 15000);
    assert.equal(liabilityRemaining(r.state, r.loanId), 5000);
    const flow = deriveMonth(r.state, "2026-10");
    assert.equal(flow.income, 0);
    assert.equal(flow.expense, 0);
    assert.equal(r.state.transactions[0].kind, "borrow");
    assert.equal(r.state.transactions[0].fromId, r.loanId);
  });

  it("requires a receiving wallet and can create one inline", () => {
    const missing = applyNewBorrowing(books(), { name: "Loan", amount: "100" });
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.ok(missing.errors.wallet);

    const r = mustOk(
      applyNewBorrowing(books(), {
        name: "Loan",
        amount: "100",
        newWallet: { name: "GCash", balance: "" },
      }),
    );
    const wallet = r.state.accounts.find((a) => a.id === r.walletId)!;
    assert.equal(wallet.name, "GCash");
    assert.equal(wallet.balanceKnown, false);
    assert.equal(accountBalances(r.state)[wallet.id], 100);
  });

  it("deleting the borrow entry removes both the cash and the debt", () => {
    const r = mustOk(applyNewBorrowing(books(), { name: "Loan", amount: "800", walletId: CASH }));
    const after = applyRemoveTransaction(r.state, r.state.transactions[0].id);
    assert.equal(cashOf(after), 10000);
    assert.equal(liabilityRemaining(after, r.loanId), 0);
  });
});

describe("recording loan payments", () => {
  function withCard() {
    return mustOk(applyAddExistingLoan(books(), { name: "Card", owed: "3000" }));
  }

  it("partial payment lowers debt and the chosen wallet only", () => {
    const { state, loanId } = withCard();
    const other = mustOk(applyAddExistingLoan(state, { name: "Other", owed: "500" }));
    const paid = applyLoanPayment(other.state, { liabilityId: loanId, amount: 1000, fromId: CASH });
    assert.ok(paid);
    assert.equal(liabilityRemaining(paid, loanId), 2000);
    assert.equal(liabilityRemaining(paid, other.loanId), 500);
    assert.equal(cashOf(paid), 9000);
  });

  it("untracked source lowers debt but no wallet", () => {
    const { state, loanId } = withCard();
    const paid = applyLoanPayment(state, { liabilityId: loanId, amount: 500, fromId: null });
    assert.ok(paid);
    assert.equal(liabilityRemaining(paid, loanId), 2500);
    assert.equal(cashOf(paid), 10000);
  });

  it("overpayment needs explicit confirmation", () => {
    const { state, loanId } = withCard();
    assert.equal(checkLoanPayment(state, { liabilityId: loanId, amount: 3500 }).reason, "overpay");
    assert.equal(applyLoanPayment(state, { liabilityId: loanId, amount: 3500, fromId: CASH }), null);
    const ok = applyLoanPayment(state, {
      liabilityId: loanId,
      amount: 3500,
      fromId: CASH,
      confirmOverpay: true,
    });
    assert.ok(ok);
    assert.equal(liabilityRemaining(ok, loanId), 0);
  });

  it("never applies without an explicit loan", () => {
    const { state } = withCard();
    assert.equal(applyLoanPayment(state, { liabilityId: "", amount: 100, fromId: CASH }), null);
    assert.equal(applyLoanPayment(state, { liabilityId: "nope", amount: 100, fromId: CASH }), null);
  });

  it("same payment id twice saves once", () => {
    const { state, loanId } = withCard();
    const once = applyLoanPayment(state, { liabilityId: loanId, amount: 100, fromId: CASH, id: "p1" })!;
    const twice = applyLoanPayment(once, { liabilityId: loanId, amount: 100, fromId: CASH, id: "p1" })!;
    assert.equal(twice.transactions.length, 1);
  });
});

describe("partial payments on a schedule loan", () => {
  function scheduled(): { state: AppState; loanId: string } {
    const state = books();
    const loan = emptyAccount("liability", "Pag-IBIG");
    loan.mode = "installment";
    loan.openingBalance = 3000;
    loan.schedule = buildMonthlySchedule("2026-11-15", 3, 1000);
    return { state: { ...state, accounts: [...state.accounts, loan] }, loanId: loan.id };
  }

  function rows(state: AppState, id: string) {
    return state.accounts.find((a) => a.id === id)!.schedule!;
  }

  it("marks an installment paid only when fully covered", () => {
    const { state, loanId } = scheduled();
    const first = applyLoanPayment(state, { liabilityId: loanId, amount: 400, fromId: CASH })!;
    assert.equal(rows(first, loanId)[0].status, "unpaid");
    assert.equal(rows(first, loanId)[0].paidAmount, 400);
    assert.equal(liabilityRemaining(first, loanId), 2600);
    assert.equal(scheduledRepaymentsLeft(rows(first, loanId)), 2600);
    assert.equal(cashOf(first), 9600);

    const second = applyLoanPayment(first, { liabilityId: loanId, amount: 600, fromId: CASH })!;
    assert.equal(rows(second, loanId)[0].status, "paid");
    assert.equal(rows(second, loanId)[0].balanceAfter, 2000);
    assert.equal(liabilityRemaining(second, loanId), 2000);
    // Both payments link the same installment.
    const ids = second.transactions.map((t) => t.installmentId);
    assert.deepEqual(ids, [rows(second, loanId)[0].id, rows(second, loanId)[0].id]);

    const third = applyLoanPayment(second, { liabilityId: loanId, amount: 1000, fromId: CASH })!;
    assert.equal(rows(third, loanId)[1].status, "paid");
    assert.equal(liabilityRemaining(third, loanId), 1000);
  });

  it("deleting a payment reverses installment status and balances", () => {
    const { state, loanId } = scheduled();
    const a = applyLoanPayment(state, { liabilityId: loanId, amount: 400, fromId: CASH, id: "a" })!;
    const b = applyLoanPayment(a, { liabilityId: loanId, amount: 600, fromId: CASH, id: "b" })!;
    const c = applyLoanPayment(b, { liabilityId: loanId, amount: 1000, fromId: CASH, id: "c" })!;

    // Remove the payment that completed row 1: row 1 drops back to partial,
    // row 2 stays paid and its balance gets the 600 back.
    const removedB = applyRemoveTransaction(c, "b");
    assert.equal(rows(removedB, loanId)[0].status, "unpaid");
    assert.equal(rows(removedB, loanId)[0].paidAmount, 400);
    assert.equal(rows(removedB, loanId)[1].status, "paid");
    assert.equal(liabilityRemaining(removedB, loanId), 1600);
    assert.equal(cashOf(removedB), 8600);

    // The next payment goes to the earlier, partly paid installment.
    const refill = applyLoanPayment(removedB, { liabilityId: loanId, amount: 600, fromId: CASH, id: "d" })!;
    assert.equal(rows(refill, loanId)[0].status, "paid");
    assert.equal(liabilityRemaining(refill, loanId), 1000);
    const unrefill = applyRemoveTransaction(refill, "d");
    assert.equal(liabilityRemaining(unrefill, loanId), 1600);

    // Remove everything: back to the start.
    const clean = applyRemoveTransaction(applyRemoveTransaction(removedB, "c"), "a");
    assert.ok(rows(clean, loanId).every((r) => r.status === "unpaid" && r.paidAmount == null));
    assert.equal(liabilityRemaining(clean, loanId), 3000);
    assert.equal(cashOf(clean), 10000);
  });

  it("an overpaid installment keeps the extra on the balance and reverses exactly", () => {
    const { state, loanId } = scheduled();
    const paid = applyLoanPayment(state, { liabilityId: loanId, amount: 1500, fromId: CASH, id: "x" })!;
    assert.equal(rows(paid, loanId)[0].status, "paid");
    assert.equal(rows(paid, loanId)[1].status, "unpaid");
    assert.equal(liabilityRemaining(paid, loanId), 1500);
    const undone = applyRemoveTransaction(paid, "x");
    assert.equal(liabilityRemaining(undone, loanId), 3000);
    assert.equal(rows(undone, loanId)[0].status, "unpaid");
  });

  it("editing a partial payment amount re-applies it to the same installment", () => {
    const { state, loanId } = scheduled();
    const paid = applyLoanPayment(state, { liabilityId: loanId, amount: 400, fromId: CASH, id: "x" })!;
    const edited = applySimpleUpdate(paid, "x", {
      direction: "out",
      amount: 1000,
      chipId: "utang",
      liabilityId: loanId,
      fromId: CASH,
    });
    assert.ok(edited);
    assert.equal(rows(edited, loanId)[0].status, "paid");
    assert.equal(rows(edited, loanId)[0].paidAmount, 1000);
    assert.equal(liabilityRemaining(edited, loanId), 2000);
  });

  it("legacy paid rows without paidAmount still reverse to unpaid", () => {
    const { state, loanId } = scheduled();
    const legacy: AppState = {
      ...state,
      accounts: state.accounts.map((a) =>
        a.id !== loanId
          ? a
          : {
              ...a,
              schedule: a.schedule!.map((r, i) =>
                i === 0 ? { ...r, status: "paid" as const, balanceAfter: 2000 } : r,
              ),
            },
      ),
      transactions: [
        {
          id: "old",
          date: "2026-11-15",
          kind: "payment",
          amount: 1000,
          category: "debt",
          particular: "",
          particularId: null,
          fromId: CASH,
          toId: loanId,
          note: "",
          installmentId: state.accounts.find((a) => a.id === loanId)!.schedule![0].id,
        },
      ],
    };
    assert.equal(liabilityRemaining(legacy, loanId), 2000);
    const removed = applyRemoveTransaction(legacy, "old");
    assert.equal(rows(removed, loanId)[0].status, "unpaid");
    assert.equal(liabilityRemaining(removed, loanId), 3000);
  });
});

describe("schedule dates", () => {
  it("clamps month-end and leap-year due dates", () => {
    const rows = buildMonthlySchedule("2028-01-31", 3, 100);
    assert.deepEqual(rows.map((r) => r.due), ["2028-01-31", "2028-02-29", "2028-03-31"]);
  });
});
