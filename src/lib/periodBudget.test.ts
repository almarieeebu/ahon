import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { emptyAccount, presetState } from "@/lib/defaults";
import {
  addMonthsToKey,
  copyBudgetTargets,
  createBudget,
  deriveBudget,
  legacyEntriesToReview,
  monthBounds,
  previousBudgetMonth,
  reconcileLegacyActuals,
  setLegacyReview,
  shiftIsoByMonths,
} from "@/lib/periodBudget";
import { applyRemoveTransaction } from "@/lib/payments";
import { applyUpdateTransaction, unpaidPlanLines } from "@/lib/simpleLog";
import type { AppState, BudgetLine, Transaction } from "@/lib/types";

let seq = 0;
function tx(patch: Partial<Transaction> & Pick<Transaction, "kind" | "amount" | "date">): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    category: "",
    particular: "",
    particularId: null,
    fromId: "cash-on-hand",
    toId: null,
    note: "",
    ...patch,
  };
}

/** October 2026 budget: Food ₱5,000, Transport ₱1,000, a ₱2,000 bill. */
function withBudget(): { state: AppState; periodId: string; billId: string } {
  const base = presetState();
  const card = { ...emptyAccount("liability", "Visa"), id: "card" };
  const result = createBudget(
    { ...base, accounts: [...base.accounts, card] },
    {
      id: "oct",
      monthKey: "2026-10",
      limits: [
        { categoryId: "cat-food", amount: "5000" },
        { categoryId: "cat-transport", amount: 1000 },
      ],
      expectedIncome: "30000",
      bills: [{ name: "Electricity", amount: "2000", due: "2026-10-15" }],
    },
  );
  assert.ok(result.ok);
  const bill = result.state.budgetLines.find((l) => l.lineType === "bill");
  assert.ok(bill);
  return { state: result.state, periodId: result.periodId, billId: bill.id };
}

function add(state: AppState, ...rows: Transaction[]): AppState {
  return { ...state, transactions: [...state.transactions, ...rows] };
}

describe("month boundaries", () => {
  it("handles month ends and leap years", () => {
    assert.deepEqual(monthBounds("2026-10"), { start: "2026-10-01", end: "2026-10-31" });
    assert.deepEqual(monthBounds("2026-02"), { start: "2026-02-01", end: "2026-02-28" });
    assert.deepEqual(monthBounds("2028-02"), { start: "2028-02-01", end: "2028-02-29" });
    assert.deepEqual(monthBounds("2100-02").end, "2100-02-28");
    assert.equal(addMonthsToKey("2026-12", 1), "2027-01");
    assert.equal(addMonthsToKey("2026-01", -1), "2025-12");
    assert.equal(shiftIsoByMonths("2028-01-31", 1), "2028-02-29");
    assert.equal(shiftIsoByMonths("2026-01-31", 1), "2026-02-28");
    assert.equal(shiftIsoByMonths("2026-03-31", -1), "2026-02-28");
  });
});

describe("createBudget", () => {
  it("creates the calendar month automatically", () => {
    const { state, periodId } = withBudget();
    const period = state.budgetPeriods.find((p) => p.id === periodId);
    assert.deepEqual(period, { id: "oct", start: "2026-10-01", end: "2026-10-31" });
    const rows = state.budgetLines.filter((l) => l.periodId === periodId);
    assert.equal(rows.filter((l) => l.lineType === "limit").length, 2);
    assert.equal(rows.find((l) => l.lineType === "income")?.income, 30000);
    assert.ok(rows.every((l) => l.actual == null));
  });

  it("creates February with the right last day", () => {
    const leap = createBudget(presetState(), {
      monthKey: "2028-02",
      limits: [{ categoryId: "cat-food", amount: 100 }],
    });
    assert.ok(leap.ok);
    assert.equal(leap.state.budgetPeriods[0].end, "2028-02-29");
  });

  it("requires a category and a valid limit", () => {
    const empty = createBudget(presetState(), {
      monthKey: "2026-10",
      limits: [{ categoryId: "", amount: "" }],
    });
    assert.equal(empty.ok, false);
    const bad = createBudget(presetState(), {
      monthKey: "2026-10",
      limits: [{ categoryId: "cat-food", amount: "-5" }],
    });
    assert.ok(!bad.ok && bad.errors.limits?.[0]?.amount);
    const nan = createBudget(presetState(), {
      monthKey: "2026-10",
      limits: [{ categoryId: "cat-food", amount: "abc" }],
    });
    assert.equal(nan.ok, false);
    const dup = createBudget(presetState(), {
      monthKey: "2026-10",
      limits: [
        { categoryId: "cat-food", amount: 1 },
        { categoryId: "cat-food", amount: 2 },
      ],
    });
    assert.ok(!dup.ok && dup.errors.limits?.[1]?.category);
  });

  it("is idempotent by id and refuses a second budget for the month", () => {
    const { state } = withBudget();
    const again = createBudget(state, {
      id: "oct",
      monthKey: "2026-10",
      limits: [{ categoryId: "cat-food", amount: 1 }],
    });
    assert.ok(again.ok);
    assert.equal(again.state, state);
    const other = createBudget(state, {
      monthKey: "2026-10",
      limits: [{ categoryId: "cat-food", amount: 1 }],
    });
    assert.ok(!other.ok && other.errors.form);
  });

  it("accepts custom dates (advanced) and checks them", () => {
    const custom = createBudget(presetState(), {
      monthKey: "2026-10",
      limits: [{ categoryId: "cat-food", amount: 1 }],
      custom: { start: "2026-10-15", end: "2026-11-14" },
    });
    assert.ok(custom.ok);
    assert.equal(custom.state.budgetPeriods[0].end, "2026-11-14");
    const backwards = createBudget(presetState(), {
      monthKey: "2026-10",
      limits: [{ categoryId: "cat-food", amount: 1 }],
      custom: { start: "2026-10-15", end: "2026-10-01" },
    });
    assert.ok(!backwards.ok && backwards.errors.custom);
  });

  it("does not offer category limits as bills to pay", () => {
    const { state } = withBudget();
    const unpaid = unpaidPlanLines(state, "2026-10");
    assert.ok(unpaid.every((l) => l.lineType !== "limit"));
    assert.ok(unpaid.some((l) => l.lineType === "bill"));
  });
});

describe("deriveBudget", () => {
  it("counts expenses by category and shows left / over", () => {
    let { state } = withBudget();
    state = add(
      state,
      tx({ kind: "expense", amount: 1200.5, date: "2026-10-02", category: "cat-food" }),
      tx({ kind: "expense", amount: 1300, date: "2026-10-03", category: "cat-transport" }),
    );
    const b = deriveBudget(state, "oct")!;
    const food = b.categories.find((c) => c.categoryId === "cat-food")!;
    const transport = b.categories.find((c) => c.categoryId === "cat-transport")!;
    assert.equal(food.spent, 1200.5);
    assert.equal(food.left, 3799.5);
    assert.equal(transport.left, -300);
    assert.equal(b.budget, 8000);
    assert.equal(b.spent, 2500.5);
    assert.equal(b.left, 5499.5);
    assert.equal(b.expectedIncome, 30000);
  });

  it("uses the name's category when the transaction category is a label", () => {
    let { state } = withBudget();
    state = add(
      state,
      tx({ kind: "expense", amount: 50, date: "2026-10-02", category: "food", particularId: "p-groceries" }),
    );
    assert.equal(deriveBudget(state, "oct")!.categories[0].spent, 50);
  });

  it("counts credit-paid expenses when incurred and card repayments separately", () => {
    let { state } = withBudget();
    state = add(
      state,
      tx({ kind: "expense", amount: 900, date: "2026-10-05", category: "cat-food", fromId: "card" }),
      tx({ kind: "payment", amount: 900, date: "2026-10-20", category: "debt", fromId: "cash-on-hand", toId: "card" }),
    );
    const b = deriveBudget(state, "oct")!;
    assert.equal(b.categories.find((c) => c.categoryId === "cat-food")!.spent, 900);
    assert.equal(b.spent, 900);
    assert.deepEqual(b.repayments, { total: 900, count: 1 });
    // The repayment is in cash-out once, not as a second expense.
    assert.equal(b.cashOut, 1800);
    assert.equal(b.unbudgeted.total, 0);
  });

  it("excludes transfers, balance adjustments and borrowing", () => {
    let { state } = withBudget();
    state = add(
      state,
      tx({ kind: "transfer", amount: 500, date: "2026-10-05", toId: "gcash" }),
      tx({ kind: "adjustment", amount: 70, date: "2026-10-05", category: "adjustment" }),
      tx({ kind: "borrow", amount: 10000, date: "2026-10-06", fromId: "card", toId: "cash-on-hand" }),
    );
    const b = deriveBudget(state, "oct")!;
    assert.equal(b.spent, 0);
    assert.equal(b.cashOut, 0);
    assert.equal(b.incomeReceived, 0);
  });

  it("puts spending with no budget category under Unbudgeted spending", () => {
    let { state } = withBudget();
    state = add(
      state,
      tx({ kind: "expense", amount: 300, date: "2026-10-09", category: "cat-health" }),
      tx({ kind: "expense", amount: 40, date: "2026-10-09", category: "misc-label" }),
    );
    const b = deriveBudget(state, "oct")!;
    assert.equal(b.unbudgeted.total, 340);
    assert.equal(b.unbudgeted.rows[0].categoryId, "cat-health");
    assert.equal(b.unbudgeted.rows[1].name, "No category");
    assert.equal(b.spent, 340);
  });

  it("ignores activity outside the budget dates, including backdated rows", () => {
    let { state } = withBudget();
    state = add(
      state,
      tx({ kind: "expense", amount: 100, date: "2026-09-30", category: "cat-food" }),
      tx({ kind: "expense", amount: 200, date: "2026-11-01", category: "cat-food" }),
      tx({ kind: "expense", amount: 300, date: "2026-10-31", category: "cat-food" }),
      // Backdated today into the first day still counts.
      tx({ kind: "expense", amount: 5, date: "2026-10-01", category: "cat-food" }),
    );
    assert.equal(deriveBudget(state, "oct")!.spent, 305);
  });

  it("marks a linked bill paid and counts it once", () => {
    const built = withBudget();
    const billId = built.billId;
    let state = built.state;
    state = add(
      state,
      tx({ kind: "expense", amount: 2100, date: "2026-10-14", category: "cat-electric", budgetLineId: billId }),
    );
    const b = deriveBudget(state, "oct")!;
    const bill = b.bills[0];
    assert.equal(bill.paid, true);
    assert.equal(bill.paidAmount, 2100);
    assert.equal(b.unbudgeted.total, 0);
    assert.equal(b.spent, 2100);
  });

  it("does not link a bill by amount or name", () => {
    let { state } = withBudget();
    state = add(
      state,
      tx({ kind: "expense", amount: 2000, date: "2026-10-14", category: "cat-electric", particular: "Electricity" }),
    );
    const b = deriveBudget(state, "oct")!;
    assert.equal(b.bills[0].paid, false);
    assert.equal(b.unbudgeted.total, 2000);
  });

  it("updates when a transaction is edited or deleted", () => {
    let { state } = withBudget();
    const row = tx({ kind: "expense", amount: 400, date: "2026-10-03", category: "cat-food" });
    state = add(state, row);
    assert.equal(deriveBudget(state, "oct")!.spent, 400);
    const edited = applyUpdateTransaction(state, { ...row, amount: 650 })!;
    assert.equal(deriveBudget(edited, "oct")!.categories[0].spent, 650);
    const moved = applyUpdateTransaction(state, { ...row, date: "2026-11-02" })!;
    assert.equal(deriveBudget(moved, "oct")!.spent, 0);
    const removed = applyRemoveTransaction(state, row.id);
    assert.equal(deriveBudget(removed, "oct")!.spent, 0);
  });

  it("never adds legacy actuals to spending", () => {
    const built = withBudget();
    const billId = built.billId;
    let state = built.state;
    state = {
      ...state,
      budgetLines: state.budgetLines.map((l) => (l.id === billId ? { ...l, actual: 1999 } : l)),
    };
    const b = deriveBudget(state, "oct")!;
    assert.equal(b.spent, 0);
    assert.equal(b.bills[0].paid, false);
  });
});

describe("copyBudgetTargets", () => {
  it("copies targets only, with due days moved to the new month", () => {
    const built = withBudget();
    const billId = built.billId;
    let state = built.state;
    state = add(
      state,
      tx({ kind: "expense", amount: 2000, date: "2026-10-14", budgetLineId: billId }),
    );
    state = {
      ...state,
      budgetLines: state.budgetLines.map((l) =>
        l.id === billId ? { ...l, status: "paid", actual: 2000, legacyReview: "kept" } : l,
      ),
    };
    const next = copyBudgetTargets(state, "2026-10", "2026-11")!;
    assert.ok(next);
    assert.equal(next.transactions.length, state.transactions.length);
    const period = next.budgetPeriods.find((p) => p.start === "2026-11-01")!;
    assert.equal(period.end, "2026-11-30");
    const rows = next.budgetLines.filter((l) => l.periodId === period.id);
    assert.equal(rows.length, 4);
    const bill = rows.find((l) => l.lineType === "bill")!;
    assert.equal(bill.due, "2026-11-15");
    assert.equal(bill.status, "unpaid");
    assert.equal(bill.actual, null);
    assert.equal(bill.legacyReview, undefined);
    const b = deriveBudget(next, period.id)!;
    assert.equal(b.spent, 0);
    assert.equal(b.bills[0].paid, false);
    assert.equal(b.budget, 8000);
    assert.equal(b.expectedIncome, 30000);
  });

  it("is idempotent: never creates the same month twice", () => {
    const { state } = withBudget();
    const once = copyBudgetTargets(state, "2026-10", "2026-11")!;
    assert.equal(copyBudgetTargets(once, "2026-10", "2026-11"), null);
    assert.equal(once.budgetPeriods.length, state.budgetPeriods.length + 1);
  });

  it("moves month-end dates into February correctly", () => {
    const jan = createBudget(presetState(), {
      monthKey: "2028-01",
      limits: [{ categoryId: "cat-food", amount: 1 }],
      bills: [{ name: "Rent", amount: 1, due: "2028-01-31" }],
    });
    assert.ok(jan.ok);
    const feb = copyBudgetTargets(jan.state, "2028-01", "2028-02")!;
    const period = feb.budgetPeriods.find((p) => p.start === "2028-02-01")!;
    assert.equal(period.end, "2028-02-29");
    assert.equal(
      feb.budgetLines.find((l) => l.periodId === period.id && l.lineType === "bill")!.due,
      "2028-02-29",
    );
    const mar = copyBudgetTargets(feb, "2028-02", "2028-03")!;
    assert.equal(mar.budgetPeriods.find((p) => p.start === "2028-03-01")!.end, "2028-03-31");
  });

  it("finds the latest earlier month with a budget", () => {
    const { state } = withBudget();
    assert.equal(previousBudgetMonth(state, "2026-11"), "2026-10");
    assert.equal(previousBudgetMonth(state, "2027-02"), "2026-10");
    assert.equal(previousBudgetMonth(state, "2026-10"), null);
  });
});

describe("legacy actuals", () => {
  function legacyState(): AppState {
    const state = presetState();
    const line = (id: string, actual: number | null, patch: Partial<BudgetLine> = {}): BudgetLine => ({
      id,
      periodId: "old",
      due: "2026-08-10",
      particular: id.toUpperCase(),
      particularId: null,
      income: 0,
      expense: 1000,
      actual,
      status: "unpaid",
      order: 0,
      ...patch,
    });
    return {
      ...state,
      budgetPeriods: [{ id: "old", start: "2026-08-01", end: "2026-08-15" }],
      budgetLines: [
        line("linked", 1000, { order: 0 }),
        line("partial", 1500, { order: 1 }),
        line("loose", 800, { order: 2 }),
        line("nothing", null, { order: 3 }),
      ],
      transactions: [
        tx({ kind: "expense", amount: 1000, date: "2026-08-10", budgetLineId: "linked" }),
        tx({ kind: "expense", amount: 500, date: "2026-08-10", budgetLineId: "partial" }),
        // Same amount and name as "loose" but no link: must NOT match.
        tx({ kind: "expense", amount: 800, date: "2026-08-10", particular: "LOOSE" }),
      ],
    };
  }

  it("reconciles only explicitly linked amounts", () => {
    const report = reconcileLegacyActuals(legacyState());
    const byId = Object.fromEntries(report.map((r) => [r.lineId, r.status]));
    assert.deepEqual(byId, { linked: "reconciled", partial: "mismatch", loose: "unlinked" });
    assert.deepEqual(
      legacyEntriesToReview(legacyState()).map((r) => r.lineId),
      ["partial", "loose"],
    );
  });

  it("is pure and idempotent; stored amounts stay as they were", () => {
    const state = legacyState();
    const snapshot = JSON.stringify(state);
    const first = reconcileLegacyActuals(state);
    const second = reconcileLegacyActuals(state);
    assert.deepEqual(first, second);
    assert.equal(JSON.stringify(state), snapshot);
  });

  it("records review choices without touching the amount or activity", () => {
    const state = legacyState();
    const kept = setLegacyReview(state, "loose", "kept");
    assert.equal(setLegacyReview(kept, "loose", "kept"), kept);
    const line = kept.budgetLines.find((l) => l.id === "loose")!;
    assert.equal(line.actual, 800);
    assert.equal(line.legacyReview, "kept");
    assert.equal(kept.transactions.length, state.transactions.length);
    const hidden = setLegacyReview(kept, "loose", "hidden");
    assert.equal(reconcileLegacyActuals(hidden).find((r) => r.lineId === "loose")!.review, "hidden");
    const undone = setLegacyReview(hidden, "loose", null);
    assert.equal(undone.budgetLines.find((l) => l.id === "loose")!.legacyReview, undefined);
    assert.equal(undone.budgetLines.find((l) => l.id === "loose")!.actual, 800);
    // Rows without a legacy amount are left alone.
    assert.equal(setLegacyReview(state, "nothing", "hidden"), state);
  });

  it("keeps a legacy amount when its linked payment is deleted", () => {
    const state = legacyState();
    const linkedTx = state.transactions.find((t) => t.budgetLineId === "linked")!;
    const next = applyRemoveTransaction(state, linkedTx.id);
    assert.equal(next.budgetLines.find((l) => l.id === "linked")!.actual, 1000);
    assert.equal(
      reconcileLegacyActuals(next).find((r) => r.lineId === "linked")!.status,
      "unlinked",
    );
  });

  it("reads legacy rows as bills in the derived budget", () => {
    const b = deriveBudget(legacyState(), "old")!;
    assert.equal(b.bills.length, 4);
    assert.equal(b.bills.find((x) => x.lineId === "linked")!.paid, true);
    assert.equal(b.bills.find((x) => x.lineId === "loose")!.paid, false);
    // Spent comes from activity only: 1000 + 500 linked + 800 unlinked.
    assert.equal(b.spent, 2300);
  });
});
