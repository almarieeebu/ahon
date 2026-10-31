import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { emptyAccount, presetState } from "@/lib/defaults";
import { deriveBudget, summarizeMonthOverview } from "@/lib/periodBudget";
import { accountBalances } from "@/lib/selectors";
import {
  applyDeleteTransaction,
  applyTransfer,
  applyTransferUpdate,
  buildTransferTransactions,
  isWalletTransfer,
  transferDraftErrors,
  transferFeeAmount,
  transferFeeId,
} from "@/lib/simpleLog";
import type { AppState } from "@/lib/types";

function books(): AppState {
  const state = presetState();
  const ub = emptyAccount("cash", "UB");
  ub.id = "ub";
  ub.openingBalance = 5000;
  state.accounts[0].openingBalance = 200; // Cash on hand
  state.accounts.push(ub);
  state.budgetPeriods = [{ id: "oct", start: "2026-10-01", end: "2026-10-31" }];
  return state;
}

const draft = {
  id: "t1",
  amount: 1000,
  fee: 10,
  fromId: "ub",
  toId: "cash-on-hand",
  date: "2026-10-05",
  note: "ATM",
};

describe("transfers", () => {
  it("builds a transfer plus a fee expense from the source wallet", () => {
    const built = buildTransferTransactions(books(), draft)!;
    assert.equal(built.rows.length, 2);
    const [move, fee] = built.rows;
    assert.equal(move.kind, "transfer");
    assert.equal(move.amount, 1000);
    assert.equal(move.fromId, "ub");
    assert.equal(move.toId, "cash-on-hand");
    assert.equal(move.note, "ATM");
    assert.equal(fee.kind, "expense");
    assert.equal(fee.amount, 10);
    assert.equal(fee.fromId, "ub");
    assert.equal(fee.toId, null);
    assert.equal(fee.category, "cat-bank-fees");
    assert.equal(fee.note, "Transfer fee");
  });

  it("source drops by amount + fee, destination rises by amount", () => {
    const next = applyTransfer(books(), draft)!;
    const bal = accountBalances(next);
    assert.equal(bal.ub, 5000 - 1000 - 10);
    assert.equal(bal["cash-on-hand"], 200 + 1000);
    assert.ok(next.transactions.some((t) => t.id === transferFeeId("t1")));
    assert.ok(isWalletTransfer(next.transactions.find((t) => t.id === "t1")!));
    assert.equal(transferFeeAmount(next, "t1"), 10);
  });

  it("counts only the fee as spending in the budget and overview", () => {
    const next = applyTransfer(books(), draft)!;
    const b = deriveBudget(next, "oct")!;
    assert.equal(b.spent, 10);
    assert.equal(b.unbudgeted.rows[0].categoryId, "cat-bank-fees");
    assert.equal(summarizeMonthOverview(next, "2026-10").actualOut, 10);
  });

  it("no fee means one row and no spending", () => {
    const next = applyTransfer(books(), { ...draft, fee: null })!;
    assert.equal(next.transactions.length, 1);
    assert.equal(accountBalances(next).ub, 4000);
    assert.equal(deriveBudget(next, "oct")!.spent, 0);
  });

  it("is idempotent for a repeated submit", () => {
    const once = applyTransfer(books(), draft)!;
    assert.equal(applyTransfer(once, draft), once);
    assert.equal(once.transactions.length, 2);
  });

  it("validates wallets and amounts", () => {
    const state = books();
    assert.ok(transferDraftErrors(state, { ...draft, toId: "ub" }).to);
    assert.ok(transferDraftErrors(state, { ...draft, fromId: null }).from);
    assert.ok(transferDraftErrors(state, { ...draft, amount: NaN }).amount);
    assert.ok(transferDraftErrors(state, { ...draft, fee: NaN }).fee);
    assert.deepEqual(transferDraftErrors(state, { ...draft, fee: 0 }), {});
    assert.equal(applyTransfer(state, { ...draft, toId: "ub" }), null);
  });

  it("adds a fee category to older books that lack one, or reuses theirs", () => {
    const old = books();
    old.categories = old.categories.filter((c) => c.id !== "cat-bank-fees");
    old.particulars = old.particulars.filter((p) => p.id !== "p-bank-fees");
    const next = applyTransfer(old, draft)!;
    assert.ok(next.categories.some((c) => c.id === "cat-bank-fees"));
    assert.ok(next.particulars.some((p) => p.id === "p-bank-fees"));

    const custom = books();
    custom.categories = custom.categories.filter((c) => c.id !== "cat-bank-fees");
    custom.particulars = custom.particulars.filter((p) => p.id !== "p-bank-fees");
    custom.categories.push({
      id: "my-fees",
      name: "Bank fees",
      planned: 0,
      dueDay: 0,
      kind: "expense",
      tone: "default",
    });
    const reused = applyTransfer(custom, draft)!;
    assert.ok(!reused.categories.some((c) => c.id === "cat-bank-fees"));
    assert.equal(reused.transactions.find((t) => t.kind === "expense")!.category, "my-fees");
  });

  it("updates the transfer and its fee together", () => {
    const first = applyTransfer(books(), draft)!;
    const changed = applyTransferUpdate(first, "t1", { ...draft, amount: 500, fee: 15 })!;
    assert.equal(changed.transactions.length, 2);
    assert.equal(accountBalances(changed).ub, 5000 - 500 - 15);
    const noFee = applyTransferUpdate(changed, "t1", { ...draft, fee: null })!;
    assert.equal(noFee.transactions.length, 1);
    assert.equal(transferFeeAmount(noFee, "t1"), 0);
    assert.equal(accountBalances(noFee).ub, 4000);
  });
});

describe("deleting a transfer", () => {
  it("also deletes its fee row and restores both wallets", () => {
    const next = applyTransfer(books(), draft)!;
    const after = applyDeleteTransaction(next, "t1");
    assert.ok(!after.transactions.some((t) => t.id === "t1"));
    assert.ok(!after.transactions.some((t) => t.id === transferFeeId("t1")));
    const bal = accountBalances(after);
    assert.equal(bal.ub, 5000);
    assert.equal(bal["cash-on-hand"], 200);
  });

  it("leaves other rows alone when deleting a non-transfer", () => {
    const next = applyTransfer(books(), draft)!;
    const after = applyDeleteTransaction(next, transferFeeId("t1"));
    assert.ok(after.transactions.some((t) => t.id === "t1"));
    assert.equal(transferFeeAmount(after, "t1"), 0);
  });

  it("works for a transfer without a fee", () => {
    const next = applyTransfer(books(), { ...draft, fee: 0 })!;
    const after = applyDeleteTransaction(next, "t1");
    assert.equal(after.transactions.length, books().transactions.length);
  });
});
