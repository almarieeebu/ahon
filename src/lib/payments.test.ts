import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { emptyAccount, presetState } from "@/lib/defaults";
import { migrateState } from "@/lib/migrate";
import { MAX_AMOUNT, parseAmount } from "@/lib/money";
import {
  applyBorrow,
  applyRemoveTransaction,
  checkLoanPayment,
  createWallet,
  liabilityRemaining,
} from "@/lib/payments";
import { summarizeMonthOverview } from "@/lib/periodBudget";
import { buildMonthEndSchedule } from "@/lib/schedule";
import { accountBalances, deriveMonth } from "@/lib/selectors";
import {
  applySimpleLog,
  applySimpleUpdate,
  billLinesForMonth,
  buildSimpleTransaction,
  payBudgetLine,
  simpleDraftErrors,
} from "@/lib/simpleLog";
import type { Account, AppState, BudgetLine } from "@/lib/types";

function books(): AppState {
  const state = presetState();
  state.accounts[0].openingBalance = 10000;
  state.accounts[0].balanceKnown = true;
  state.settings.setupComplete = true;
  return state;
}

function revolving(name: string, owed: number): Account {
  const card = emptyAccount("liability", name);
  card.mode = "revolving";
  card.openingBalance = owed;
  return card;
}

function installmentLoan(name: string, monthly: number, months: number): Account {
  const loan = emptyAccount("liability", name);
  loan.mode = "installment";
  loan.schedule = buildMonthEndSchedule("2026-08", months, monthly);
  loan.openingBalance = monthly * months;
  return loan;
}

function withBill(state: AppState): AppState {
  const line: BudgetLine = {
    id: "meralco",
    periodId: "aug",
    due: "2026-08-10",
    particular: "ELECTRICITY",
    particularId: "p-electric",
    income: 0,
    expense: 2000,
    actual: null,
    status: "unpaid",
    order: 0,
  };
  return {
    ...state,
    budgetPeriods: [{ id: "aug", start: "2026-08-01", end: "2026-08-31" }],
    budgetLines: [line],
  };
}

describe("amount validation", () => {
  it("rejects empty, NaN, zero, negative and huge amounts", () => {
    for (const bad of ["", "  ", "abc", "1.2.3", "0", "0.001", "-5", "1e3x", String(MAX_AMOUNT * 10)]) {
      assert.equal(parseAmount(bad).ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
    }
    assert.equal(parseAmount(Number.NaN).ok, false);
    assert.equal(parseAmount(Number.POSITIVE_INFINITY).ok, false);
  });

  it("rounds to centavos and accepts commas and peso signs", () => {
    assert.deepEqual(parseAmount("150.555"), { ok: true, value: 150.56 });
    assert.deepEqual(parseAmount("₱1,250.5"), { ok: true, value: 1250.5 });
    assert.deepEqual(parseAmount(0.1 + 0.2), { ok: true, value: 0.3 });
  });

  it("never stores an invalid amount through the simple log", () => {
    const state = books();
    for (const amount of [0, -10, Number.NaN, MAX_AMOUNT * 2]) {
      assert.equal(
        applySimpleLog(state, { direction: "out", amount, chipId: "food" }),
        null,
      );
    }
    const next = applySimpleLog(state, { direction: "out", amount: 99.999, chipId: "food" });
    assert.equal(next?.transactions[0].amount, 100);
  });
});

describe("expense recording", () => {
  it("requires a category instead of defaulting to Food", () => {
    const state = books();
    const draft = { direction: "out" as const, amount: 150 };
    assert.equal(buildSimpleTransaction(state, draft), null);
    assert.match(simpleDraftErrors(state, draft).category ?? "", /category/i);
  });

  it("uses today, the default wallet, and keeps the note", () => {
    const state = books();
    const next = applySimpleLog(state, {
      direction: "out",
      amount: 80,
      chipId: "transport",
      note: " jeep ",
    });
    const tx = next!.transactions[0];
    assert.equal(tx.fromId, "cash-on-hand");
    assert.match(tx.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(tx.note, "jeep");
  });

  it("does not duplicate when the same submission is applied twice", () => {
    const state = books();
    const draft = { id: "entry-1", direction: "out" as const, amount: 150, chipId: "food" };
    const once = applySimpleLog(state, draft)!;
    const twice = applySimpleLog(once, draft)!;
    assert.equal(twice.transactions.length, 1);
    assert.equal(twice.transactions[0].id, "entry-1");
    assert.equal(accountBalances(twice)["cash-on-hand"], 9850);
  });

  it("asks for a wallet when none exists and creates one inline", () => {
    const state = books();
    state.accounts = state.accounts.filter((a) => a.kind !== "cash");
    const draft = { direction: "out" as const, amount: 50, chipId: "food" };
    assert.match(simpleDraftErrors(state, draft).wallet ?? "", /wallet/i);

    const created = createWallet(state, "GCash", "");
    assert.ok(!("error" in created));
    if ("error" in created) return;
    const wallet = created.state.accounts.find((a) => a.id === created.accountId)!;
    assert.equal(wallet.balanceKnown, false);
    assert.equal(wallet.openingBalance, 0);
    const next = applySimpleLog(created.state, { ...draft, fromId: wallet.id });
    assert.equal(next?.transactions[0].fromId, wallet.id);

    const known = createWallet(state, "Cash", "1,500.256");
    assert.ok(!("error" in known));
    if (!("error" in known)) {
      const account = known.state.accounts.find((a) => a.id === known.accountId)!;
      assert.equal(account.balanceKnown, true);
      assert.equal(account.openingBalance, 1500.26);
    }
    assert.ok("error" in createWallet(state, "  ", ""));
    assert.ok("error" in createWallet(state, "Cash", "lots"));
  });
});

describe("bills are never auto-selected", () => {
  it("requires choosing which bill under the Bills chip", () => {
    const state = withBill(books());
    const draft = { direction: "out" as const, amount: 2000, chipId: "bills", date: "2026-08-10" };
    assert.equal(buildSimpleTransaction(state, draft), null);
    assert.match(simpleDraftErrors(state, draft).category ?? "", /bill/i);
    // Picking the bill name does not link (or pay) the planned bill.
    const named = applySimpleLog(state, { ...draft, particularId: "p-water" })!;
    assert.equal(named.transactions[0].particularId, "p-water");
    assert.equal(named.transactions[0].budgetLineId, null);
    assert.equal(named.budgetLines[0].status, "unpaid");
  });

  it("links a planned bill only by explicit id and unlinks on delete", () => {
    const state = withBill(books());
    assert.deepEqual(billLinesForMonth(state, "2026-08").map((l) => l.id), ["meralco"]);
    const linked = applySimpleLog(state, {
      direction: "out",
      amount: 1980,
      chipId: "bills",
      budgetLineId: "meralco",
      date: "2026-08-09",
    })!;
    const tx = linked.transactions[0];
    assert.equal(tx.budgetLineId, "meralco");
    assert.equal(tx.particularId, "p-electric");
    assert.equal(linked.budgetLines[0].status, "paid");

    const removed = applyRemoveTransaction(linked, tx.id);
    assert.equal(removed.budgetLines[0].status, "unpaid");
    assert.equal(accountBalances(removed)["cash-on-hand"], 10000);
  });
});

describe("loan payments need an explicit loan", () => {
  it("never falls back to the first loan", () => {
    const state = books();
    const first = revolving("BDO card", 5000);
    const second = revolving("Utang kay mama", 3000);
    state.accounts.push(first, second);

    const draft = { direction: "out" as const, amount: 500, chipId: "utang" };
    assert.equal(buildSimpleTransaction(state, draft), null);
    assert.match(simpleDraftErrors(state, draft).loan ?? "", /choose which loan/i);

    const paid = applySimpleLog(state, { ...draft, liabilityId: second.id })!;
    assert.equal(paid.transactions[0].toId, second.id);
    const bal = accountBalances(paid);
    assert.equal(bal[first.id], 5000);
    assert.equal(bal[second.id], 2500);
    assert.equal(bal["cash-on-hand"], 9500);
  });

  it("rejects an archived or unknown loan id", () => {
    const state = books();
    const card = revolving("Old card", 1000);
    card.archived = true;
    state.accounts.push(card, revolving("Live", 1000));
    const check = checkLoanPayment(state, { liabilityId: card.id, amount: 100 });
    assert.equal(check.reason, "unknown-loan");
  });

  it("does not apply a planned debt line to an unrelated loan", () => {
    const state = books();
    const card = revolving("BDO card", 5000);
    state.accounts.push(card);
    state.budgetPeriods = [{ id: "aug", start: "2026-08-01", end: "2026-08-31" }];
    state.budgetLines = [
      {
        id: "debt",
        periodId: "aug",
        due: "2026-08-20",
        particular: "DEBT PAYMENT",
        particularId: "p-debt",
        income: 0,
        expense: 1500,
        actual: null,
        status: "unpaid",
        order: 0,
      },
    ];
    const next = payBudgetLine(state, "debt", "2026-08-20")!;
    const tx = next.transactions[0];
    assert.equal(tx.kind, "expense");
    assert.equal(tx.budgetLineId, "debt");
    assert.equal(accountBalances(next)[card.id], 5000);

    const explicit = payBudgetLine(state, "debt", "2026-08-20", card.id)!;
    assert.equal(explicit.transactions[0].kind, "payment");
    assert.equal(explicit.transactions[0].toId, card.id);
    assert.equal(accountBalances(explicit)[card.id], 3500);
  });
});

describe("overpayment", () => {
  it("is flagged and needs explicit confirmation", () => {
    const state = books();
    const card = revolving("BDO card", 1000);
    state.accounts.push(card);

    const check = checkLoanPayment(state, { liabilityId: card.id, amount: 1200 });
    assert.equal(check.reason, "overpay");
    assert.equal(check.remaining, 1000);
    assert.equal(check.excess, 200);

    const draft = {
      direction: "out" as const,
      amount: 1200,
      chipId: "utang",
      liabilityId: card.id,
    };
    assert.equal(applySimpleLog(state, draft), null);
    assert.match(simpleDraftErrors(state, draft).loan ?? "", /more than/i);

    const confirmed = applySimpleLog(state, { ...draft, confirmOverpay: true })!;
    assert.equal(confirmed.transactions.length, 1);
    assert.equal(liabilityRemaining(confirmed, card.id), 0);
  });

  it("does not count the payment being edited against itself", () => {
    const state = books();
    const card = revolving("BDO card", 1000);
    state.accounts.push(card);
    const paid = applySimpleLog(state, {
      direction: "out",
      amount: 1000,
      chipId: "utang",
      liabilityId: card.id,
    })!;
    const id = paid.transactions[0].id;
    const edited = applySimpleUpdate(paid, id, {
      direction: "out",
      amount: 900,
      chipId: "utang",
      liabilityId: card.id,
    })!;
    assert.equal(edited.transactions[0].amount, 900);
    assert.equal(liabilityRemaining(edited, card.id), 100);
  });
});

describe("editing and deleting payments", () => {
  it("delete reverses wallet and revolving loan balances", () => {
    const state = books();
    const card = revolving("BDO card", 5000);
    state.accounts.push(card);
    const paid = applySimpleLog(state, {
      direction: "out",
      amount: 1500,
      chipId: "utang",
      liabilityId: card.id,
    })!;
    assert.equal(accountBalances(paid)["cash-on-hand"], 8500);
    const removed = applyRemoveTransaction(paid, paid.transactions[0].id);
    assert.equal(accountBalances(removed)["cash-on-hand"], 10000);
    assert.equal(accountBalances(removed)[card.id], 5000);
    assert.equal(removed.transactions.length, 0);
  });

  it("delete marks the installment unpaid and restores what is owed", () => {
    const state = books();
    const loan = installmentLoan("SSS loan", 1000, 3);
    state.accounts.push(loan);
    const paid = applySimpleLog(state, {
      direction: "out",
      amount: 1000,
      chipId: "utang",
      liabilityId: loan.id,
    })!;
    const tx = paid.transactions[0];
    assert.ok(tx.installmentId);
    assert.equal(liabilityRemaining(paid, loan.id), 2000);
    assert.equal(accountBalances(paid)["cash-on-hand"], 9000);

    const removed = applyRemoveTransaction(paid, tx.id);
    const schedule = removed.accounts.find((a) => a.id === loan.id)!.schedule!;
    assert.ok(schedule.every((row) => row.status === "unpaid"));
    assert.equal(liabilityRemaining(removed, loan.id), 3000);
    assert.equal(accountBalances(removed)["cash-on-hand"], 10000);
  });

  it("deleting an earlier installment payment keeps later balances right", () => {
    let state = books();
    const loan = installmentLoan("Pag-IBIG", 1000, 3);
    state.accounts.push(loan);
    for (let i = 0; i < 2; i += 1) {
      state = applySimpleLog(state, {
        direction: "out",
        amount: 1000,
        chipId: "utang",
        liabilityId: loan.id,
      })!;
    }
    assert.equal(liabilityRemaining(state, loan.id), 1000);
    const removed = applyRemoveTransaction(state, state.transactions[0].id);
    assert.equal(liabilityRemaining(removed, loan.id), 2000);
  });

  it("moving a payment to another loan reverses the first loan", () => {
    const state = books();
    const loan = installmentLoan("SSS loan", 1000, 3);
    const card = revolving("BDO card", 4000);
    state.accounts.push(loan, card);
    const paid = applySimpleLog(state, {
      direction: "out",
      amount: 1000,
      chipId: "utang",
      liabilityId: loan.id,
    })!;
    const id = paid.transactions[0].id;
    const moved = applySimpleUpdate(paid, id, {
      direction: "out",
      amount: 1000,
      chipId: "utang",
      liabilityId: card.id,
    })!;
    assert.equal(liabilityRemaining(moved, loan.id), 3000);
    assert.equal(liabilityRemaining(moved, card.id), 3000);
    assert.equal(moved.transactions[0].installmentId, undefined);
    assert.equal(accountBalances(moved)["cash-on-hand"], 9000);
  });
});

describe("loan proceeds", () => {
  it("raise cash and debt but are not income", () => {
    const state = books();
    const loan = revolving("Lending app", 0);
    state.accounts.push(loan);
    const next = applyBorrow(state, {
      liabilityId: loan.id,
      amount: 5000,
      toId: "cash-on-hand",
      date: "2026-08-03",
    })!;
    const bal = accountBalances(next);
    assert.equal(bal["cash-on-hand"], 15000);
    assert.equal(bal[loan.id], 5000);
    assert.equal(next.transactions[0].kind, "borrow");
    assert.equal(deriveMonth(next, "2026-08").income, 0);
    assert.equal(deriveMonth(next, "2026-08").expense, 0);
    assert.equal(summarizeMonthOverview(next, "2026-08").actualIn, 0);
  });

  it("requires an explicit, live loan", () => {
    const state = books();
    assert.equal(
      applyBorrow(state, { liabilityId: "nope", amount: 100, toId: "cash-on-hand" }),
      null,
    );
  });
});

describe("data model compatibility", () => {
  it("treats legacy accounts as known balances and keeps new links", () => {
    const legacy = {
      version: 5,
      settings: { setupComplete: true },
      accounts: [
        {
          id: "cash",
          name: "Cash",
          kind: "cash",
          openingBalance: 0,
          monthlyRate: 0,
          dueDay: 0,
          plannedPayment: 0,
          goal: 0,
          archived: false,
        },
        {
          id: "gcash",
          name: "GCash",
          kind: "cash",
          openingBalance: 0,
          monthlyRate: 0,
          dueDay: 0,
          plannedPayment: 0,
          goal: 0,
          archived: false,
          balanceKnown: false,
        },
      ],
      transactions: [
        {
          id: "t1",
          date: "2026-08-01",
          kind: "expense",
          amount: 10,
          category: "cat-food",
          particular: "",
          particularId: null,
          fromId: "cash",
          toId: null,
          note: "",
          budgetLineId: "line-1",
        },
      ],
    };
    const state = migrateState(legacy)!;
    assert.equal(state.accounts[0].balanceKnown, true);
    assert.equal(state.accounts[1].balanceKnown, false);
    assert.equal(state.transactions[0].budgetLineId, "line-1");
  });
});
