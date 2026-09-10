import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { monthAffordability } from "@/lib/affordability";
import { buildFinanceAlerts } from "@/lib/alerts";
import { moneyNeededBeforePayday } from "@/lib/cashPlan";
import { emptyAccount, emptyState, presetState } from "@/lib/defaults";
import { accountBalances } from "@/lib/selectors";
import type { AppState, Transaction } from "@/lib/types";

function baseState(): AppState {
  const state = emptyState();
  const cash = emptyAccount("cash", "Cash");
  cash.openingBalance = 10000;
  const card = emptyAccount("liability", "CC");
  card.liabilityType = "credit-card";
  card.mode = "revolving";
  card.openingBalance = 30000;
  card.plannedPayment = 5000;
  card.dueDay = 15;
  state.accounts = [cash, card];
  state.settings.monthlyIncome = 40000;
  return state;
}

describe("accountBalances payment source", () => {
  it("reduces cash and debt when payment has fromId", () => {
    const state = baseState();
    const cashId = state.accounts[0].id;
    const cardId = state.accounts[1].id;
    state.transactions = [
      {
        id: "1",
        date: "2026-08-01",
        kind: "payment",
        amount: 5000,
        category: "debt",
        particular: "",
        particularId: null,
        fromId: cashId,
        toId: cardId,
        note: "",
      },
    ];
    const bal = accountBalances(state);
    assert.equal(bal[cashId], 5000);
    assert.equal(bal[cardId], 25000);
  });

  it("reduces debt only when payment is untracked (fromId null)", () => {
    const state = baseState();
    const cashId = state.accounts[0].id;
    const cardId = state.accounts[1].id;
    state.transactions = [
      {
        id: "1",
        date: "2026-08-01",
        kind: "payment",
        amount: 5000,
        category: "debt",
        particular: "",
        particularId: null,
        fromId: null,
        toId: cardId,
        note: "Paid from untracked source",
      },
    ];
    const bal = accountBalances(state);
    assert.equal(bal[cashId], 10000);
    assert.equal(bal[cardId], 25000);
  });
});

describe("balance adjustment audit trail", () => {
  it("changes cash via adjustment without rewriting openingBalance", () => {
    const state = baseState();
    const cash = state.accounts[0];
    const opening = cash.openingBalance;
    const tx: Transaction = {
      id: "adj",
      date: "2026-08-10",
      kind: "adjustment",
      amount: 2000,
      category: "adjustment",
      particular: "Balance adjustment",
      particularId: null,
      fromId: cash.id,
      toId: null,
      note: "Bank reconciliation",
    };
    state.transactions = [tx];
    const bal = accountBalances(state);
    assert.equal(cash.openingBalance, opening);
    assert.equal(bal[cash.id], 8000);
  });
});

describe("monthly survival", () => {
  it("covers income vs debt dues when solvent", () => {
    const state = baseState();
    state.settings.monthlyIncome = 40000;
    const snap = monthAffordability(state, "2026-08", 10000);
    assert.equal(snap.debtPayments, 5000);
    assert.equal(snap.income, 40000);
    assert.ok(snap.gap > 0);
  });

  it("shows monthly deficit when short", () => {
    const state = baseState();
    state.settings.monthlyIncome = 10000;
    state.accounts[1].plannedPayment = 17000;
    const snap = monthAffordability(state, "2026-08", 0);
    assert.equal(snap.verdict, "no");
    assert.equal(snap.survivalMode, true);
    assert.ok(snap.gap < 0);
  });

  it("sets aside due bills, debt, and a reserve before payday", () => {
    const state = baseState();
    state.settings.paydayDays = [15, 30];
    state.settings.emergencyReserve = 1000;
    state.budgetPeriods = [
      { id: "august", start: "2026-08-01", end: "2026-08-31" },
    ];
    state.budgetLines = [
      {
        id: "electricity",
        periodId: "august",
        due: "2026-08-10",
        particular: "Electricity",
        particularId: null,
        income: 0,
        expense: 2000,
        actual: null,
        status: "unpaid",
        order: 0,
      },
    ];

    const plan = moneyNeededBeforePayday(state, 10000, "2026-08-01");

    assert.equal(plan.end, "2026-08-15");
    assert.equal(plan.bills, 2000);
    assert.equal(plan.debtMinimums, 5000);
    assert.equal(plan.reserve, 1000);
    assert.equal(plan.totalNeeded, 8000);
    assert.equal(plan.safeToUse, 2000);
  });

  it("only offers debt extra that current cash can spare before payday", () => {
    const state = baseState();
    const alerts = buildFinanceAlerts(state, {
      monthKey: "2026-08",
      today: "2026-08-01",
    });
    const extra = alerts.find((alert) => alert.kind === "extra_cash_debt");

    // Though this month has a ₱35,000 surplus, ₱5,000 is due in the next
    // 14 days. Only the remaining ₱5,000 cash can be optional debt extra.
    assert.equal(extra?.amount, 5000);
  });
});

describe("first-run starter data", () => {
  it("includes common household names without sample amounts", () => {
    const state = presetState();

    assert.equal(state.settings.setupComplete, false);
    assert.ok(state.accounts.some((account) => account.id === "cash-on-hand"));
    assert.ok(state.accounts.some((account) => account.id === "tigum-emergency"));
    assert.ok(state.categories.some((category) => category.id === "cat-rent"));
    assert.ok(state.categories.some((category) => category.id === "cat-health"));
    assert.ok(state.categories.some((category) => category.id === "cat-others"));
    assert.ok(state.particulars.some((particular) => particular.id === "p-groceries"));
    assert.ok(state.particulars.some((particular) => particular.id === "p-misc"));
    assert.ok(state.categories.every((category) => category.planned === 0));
  });
});
