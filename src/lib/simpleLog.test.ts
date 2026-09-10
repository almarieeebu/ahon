import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { emptyAccount, presetState } from "@/lib/defaults";
import {
  applySimpleLog,
  applySimpleUpdate,
  applyUpdateTransaction,
  buildSimpleTransaction,
  copyBudgetMonth,
  monthHasPlan,
  payBudgetLine,
  pickDailyPrompt,
  previousMonthWithPlan,
  shouldShowWalletPicker,
  unpaidPlanLines,
} from "@/lib/simpleLog";
import { accountBalances } from "@/lib/selectors";
import type { AppState, BudgetLine, BudgetPeriod } from "@/lib/types";

function withPlan(state: AppState): AppState {
  const period: BudgetPeriod = {
    id: "august",
    start: "2026-08-01",
    end: "2026-08-31",
  };
  const lines: BudgetLine[] = [
    {
      id: "pay",
      periodId: "august",
      due: "2026-08-15",
      particular: "PAYCHECK",
      particularId: "p-paycheck",
      income: 25000,
      expense: 0,
      actual: null,
      status: "unpaid",
      order: 0,
    },
    {
      id: "electric",
      periodId: "august",
      due: "2026-08-10",
      particular: "ELECTRICITY",
      particularId: "p-electric",
      income: 0,
      expense: 2000,
      actual: null,
      status: "unpaid",
      order: 1,
    },
    {
      id: "debt",
      periodId: "august",
      due: "2026-08-20",
      particular: "DEBT PAYMENT",
      particularId: "p-debt",
      income: 0,
      expense: 1500,
      actual: null,
      status: "unpaid",
      order: 2,
    },
  ];
  return {
    ...state,
    budgetPeriods: [period],
    budgetLines: lines,
    settings: {
      ...state.settings,
      monthlyIncome: 25000,
      paydayDays: [15, 30],
      setupComplete: true,
    },
  };
}

describe("simple logging", () => {
  it("maps spent Food to groceries from cash", () => {
    const state = presetState();
    state.accounts[0].openingBalance = 5000;
    const tx = buildSimpleTransaction(state, {
      direction: "out",
      amount: 150,
      chipId: "food",
    });
    assert.ok(tx);
    assert.equal(tx?.kind, "expense");
    assert.equal(tx?.particularId, "p-groceries");
    assert.equal(tx?.fromId, "cash-on-hand");
    assert.equal(tx?.amount, 150);
  });

  it("maps Utang to a payment when a liability exists", () => {
    const state = presetState();
    const card = emptyAccount("liability", "Credit card");
    card.mode = "revolving";
    card.openingBalance = 8000;
    state.accounts.push(card);
    const tx = buildSimpleTransaction(state, {
      direction: "out",
      amount: 500,
      chipId: "utang",
    });
    assert.equal(tx?.kind, "payment");
    assert.equal(tx?.toId, card.id);
    assert.equal(tx?.fromId, "cash-on-hand");
  });

  it("maps Utang to an expense when there is no debt account", () => {
    const state = presetState();
    const tx = buildSimpleTransaction(state, {
      direction: "out",
      amount: 500,
      chipId: "utang",
    });
    assert.equal(tx?.kind, "expense");
    assert.equal(tx?.particularId, "p-debt");
  });

  it("hides the wallet picker when there is only one cash account", () => {
    const state = presetState();
    assert.equal(shouldShowWalletPicker(state), false);
    const gcash = emptyAccount("cash", "GCash");
    state.accounts.push(gcash);
    assert.equal(shouldShowWalletPicker(state), true);
  });

  it("applies a simple log and drops cash", () => {
    const state = presetState();
    state.accounts[0].openingBalance = 5000;
    const next = applySimpleLog(state, {
      direction: "out",
      amount: 200,
      chipId: "food",
      date: "2026-08-02",
    });
    assert.ok(next);
    assert.equal(next?.transactions.length, 1);
    const bal = accountBalances(next!);
    assert.equal(bal["cash-on-hand"], 4800);
  });
});

describe("payBudgetLine", () => {
  it("logs income and marks the paycheck line paid", () => {
    const state = withPlan(presetState());
    state.accounts[0].openingBalance = 1000;
    const next = payBudgetLine(state, "pay", "2026-08-15");
    assert.ok(next);
    const line = next?.budgetLines.find((item) => item.id === "pay");
    assert.equal(line?.status, "paid");
    assert.equal(line?.actual, 25000);
    assert.equal(next?.transactions[0]?.kind, "income");
    assert.equal(accountBalances(next!)["cash-on-hand"], 26000);
  });

  it("logs an expense and marks a bill paid", () => {
    const state = withPlan(presetState());
    state.accounts[0].openingBalance = 5000;
    const next = payBudgetLine(state, "electric", "2026-08-10");
    const line = next?.budgetLines.find((item) => item.id === "electric");
    assert.equal(line?.status, "paid");
    assert.equal(line?.actual, 2000);
    assert.equal(next?.transactions[0]?.kind, "expense");
    assert.equal(accountBalances(next!)["cash-on-hand"], 3000);
  });

  it("does nothing when the line is already paid", () => {
    const state = withPlan(presetState());
    const paid = payBudgetLine(state, "electric", "2026-08-10");
    assert.ok(paid);
    const again = payBudgetLine(paid!, "electric", "2026-08-11");
    assert.equal(again, null);
  });
});

describe("copyBudgetMonth", () => {
  it("copies last month's plan into a new month unpaid", () => {
    const state = withPlan(presetState());
    const next = copyBudgetMonth(state, "2026-08", "2026-09");
    assert.ok(next);
    assert.equal(monthHasPlan(next!, "2026-09"), true);
    assert.equal(previousMonthWithPlan(next!, "2026-09"), "2026-08");
    const rows = unpaidPlanLines(next!, "2026-09");
    assert.equal(rows.length, 3);
    assert.ok(rows.every((row) => row.status === "unpaid" && row.actual == null));
    assert.ok(rows.some((row) => row.due === "2026-09-10"));
    const late = rows.find((row) => row.particularId === "p-debt");
    assert.equal(late?.due, "2026-09-20");
  });

  it("does not copy over an existing month", () => {
    const state = withPlan(presetState());
    assert.equal(copyBudgetMonth(state, "2026-07", "2026-08"), null);
  });
});

describe("daily prompts", () => {
  it("asks for a first log when nothing has been recorded", () => {
    const state = withPlan(presetState());
    const prompt = pickDailyPrompt(state, {
      today: "2026-08-02",
      hour: 10,
    });
    assert.equal(prompt?.kind, "first-log");
  });

  it("asks about sweldo on payday when no income is logged", () => {
    const state = withPlan(presetState());
    state.transactions = [
      {
        id: "old",
        date: "2026-08-01",
        kind: "expense",
        amount: 50,
        category: "cat-food",
        particular: "GROCERIES",
        particularId: "p-groceries",
        fromId: "cash-on-hand",
        toId: null,
        note: "",
      },
    ];
    const prompt = pickDailyPrompt(state, {
      today: "2026-08-15",
      hour: 10,
    });
    assert.equal(prompt?.kind, "payday");
  });

  it("offers a weekly grocery catch-up after quiet days", () => {
    const state = withPlan(presetState());
    state.transactions = [
      {
        id: "old",
        date: "2026-08-01",
        kind: "expense",
        amount: 50,
        category: "cat-food",
        particular: "GROCERIES",
        particularId: "p-groceries",
        fromId: "cash-on-hand",
        toId: null,
        note: "",
      },
    ];
    const prompt = pickDailyPrompt(state, {
      today: "2026-08-05",
      hour: 10,
      dismissedIds: [],
    });
    assert.equal(prompt?.kind, "catchup");
  });
});

describe("log updates", () => {
  it("changes the amount and cash balance when a log is updated", () => {
    const state = presetState();
    state.accounts[0].openingBalance = 5000;
    const logged = applySimpleLog(state, {
      direction: "out",
      amount: 150,
      chipId: "food",
      date: "2026-08-02",
    });
    assert.ok(logged);
    const id = logged!.transactions[0].id;
    const updated = applySimpleUpdate(logged!, id, {
      direction: "out",
      amount: 200,
      chipId: "food",
      date: "2026-08-02",
    });
    assert.ok(updated);
    assert.equal(updated!.transactions[0].amount, 200);
    assert.equal(updated!.transactions.length, 1);
    assert.equal(accountBalances(updated!)["cash-on-hand"], 4800);
  });

  it("keeps the same id when applyUpdateTransaction runs", () => {
    const state = presetState();
    const logged = applySimpleLog(state, {
      direction: "in",
      amount: 1000,
      chipId: "paycheck",
      date: "2026-08-15",
    });
    const tx = logged!.transactions[0];
    const next = applyUpdateTransaction(logged!, { ...tx, amount: 2500 });
    assert.equal(next?.transactions[0].id, tx.id);
    assert.equal(next?.transactions[0].amount, 2500);
    assert.equal(accountBalances(next!)["cash-on-hand"], 2500);
  });

  it("does not update a missing or adjustment row", () => {
    const state = presetState();
    assert.equal(
      applyUpdateTransaction(state, {
        id: "missing",
        date: "2026-08-01",
        kind: "expense",
        amount: 1,
        category: "cat-food",
        particular: "GROCERIES",
        particularId: "p-groceries",
        fromId: "cash-on-hand",
        toId: null,
        note: "",
      }),
      null,
    );
    state.transactions = [
      {
        id: "adj",
        date: "2026-08-01",
        kind: "adjustment",
        amount: 10,
        category: "adjustment",
        particular: "Balance adjustment",
        particularId: null,
        fromId: "cash-on-hand",
        toId: null,
        note: "",
      },
    ];
    assert.equal(
      applySimpleUpdate(state, "adj", {
        direction: "out",
        amount: 20,
        chipId: "food",
      }),
      null,
    );
  });

  it("keeps the original date and note when those fields are omitted", () => {
    const state = presetState();
    const logged = applySimpleLog(state, {
      direction: "out",
      amount: 150,
      chipId: "food",
      date: "2026-08-02",
    });
    const withNote = applyUpdateTransaction(logged!, {
      ...logged!.transactions[0],
      note: "palengke",
    });
    const updated = applySimpleUpdate(withNote!, logged!.transactions[0].id, {
      direction: "out",
      amount: 180,
      chipId: "food",
    });
    assert.equal(updated!.transactions[0].date, "2026-08-02");
    assert.equal(updated!.transactions[0].note, "palengke");
    assert.equal(updated!.transactions[0].amount, 180);
  });
});
