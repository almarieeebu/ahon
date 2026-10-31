import { describe, expect, it } from "vitest";
import {
  accountFlowLabel,
  accountGroups,
  activityTotals,
  DEFAULT_ACTIVITY_FILTER,
  filterActivity,
  isCustomDate,
  matchesDate,
  parseActivityFilter,
  txFlow,
} from "@/lib/activityFilter";
import type { Account, Transaction } from "@/lib/types";

function tx(p: Partial<Transaction>): Transaction {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    date: "2026-10-15",
    kind: "expense",
    amount: 100,
    category: "food",
    particular: "",
    particularId: null,
    fromId: null,
    toId: null,
    note: "",
    ...p,
  };
}

const rows = [
  tx({ id: "e1", date: "2026-10-01", kind: "expense", amount: 50, fromId: "cash" }),
  tx({ id: "e2", date: "2026-10-31", kind: "expense", amount: 70, fromId: "ub" }),
  tx({ id: "i1", date: "2026-10-15", kind: "income", amount: 1000, toId: "ub" }),
  tx({ id: "t1", date: "2026-10-20", kind: "transfer", category: "transfer", amount: 100, fromId: "ub", toId: "cash" }),
  tx({ id: "p1", date: "2026-10-25", kind: "payment", amount: 300, fromId: "cash", toId: "loan" }),
  tx({ id: "s1", date: "2026-09-30", kind: "expense", amount: 9, fromId: "cash" }),
];

const ids = (list: Transaction[]) => list.map((t) => t.id);

describe("filterActivity", () => {
  it("defaults to the header month", () => {
    expect(ids(filterActivity(rows, DEFAULT_ACTIVITY_FILTER, "2026-10"))).toEqual([
      "e1", "e2", "i1", "t1", "p1",
    ]);
    expect(ids(filterActivity(rows, DEFAULT_ACTIVITY_FILTER, "2026-09"))).toEqual(["s1"]);
  });

  it("filters one day, independent of the month", () => {
    const f = { ...DEFAULT_ACTIVITY_FILTER, date: { mode: "day" as const, from: "2026-09-30" } };
    expect(ids(filterActivity(rows, f, "2026-10"))).toEqual(["s1"]);
  });

  it("filters an inclusive range across months, and swaps a reversed range", () => {
    const f = { ...DEFAULT_ACTIVITY_FILTER, date: { mode: "range" as const, from: "2026-09-30", to: "2026-10-15" } };
    expect(ids(filterActivity(rows, f, "2026-10"))).toEqual(["e1", "i1", "s1"]);
    const rev = { ...f, date: { mode: "range" as const, from: "2026-10-15", to: "2026-09-30" } };
    expect(ids(filterActivity(rows, rev, "2026-10"))).toEqual(["e1", "i1", "s1"]);
  });

  it("treats an open-ended range as from/until", () => {
    expect(matchesDate(rows[1], { mode: "range", from: "2026-10-30", to: "" }, "2026-01")).toBe(true);
    expect(matchesDate(rows[0], { mode: "range", from: "2026-10-30", to: "" }, "2026-01")).toBe(false);
    expect(matchesDate(rows[5], { mode: "range", from: "", to: "2026-09-30" }, "2026-01")).toBe(true);
  });

  it("falls back to the month when the day/range has no dates yet", () => {
    expect(matchesDate(rows[5], { mode: "day", from: "" }, "2026-10")).toBe(false);
    expect(matchesDate(rows[0], { mode: "range", from: "", to: "" }, "2026-10")).toBe(true);
    expect(isCustomDate({ mode: "day", from: "" })).toBe(false);
    expect(isCustomDate({ mode: "range", from: "", to: "2026-10-01" })).toBe(true);
  });

  it("filters by account on either side", () => {
    const f = { ...DEFAULT_ACTIVITY_FILTER, accountId: "cash" };
    expect(ids(filterActivity(rows, f, "2026-10"))).toEqual(["e1", "t1", "p1"]);
  });

  it("combines account, date and kind", () => {
    const f = {
      kind: "spending" as const,
      accountId: "cash",
      date: { mode: "range" as const, from: "2026-09-01", to: "2026-10-31" },
    };
    expect(ids(filterActivity(rows, f, "2026-10"))).toEqual(["e1", "s1"]);
  });
});

describe("txFlow and activityTotals", () => {
  it("keeps wallet moves neutral unless an account is picked", () => {
    expect(txFlow(rows[3])).toBe("neutral");
    expect(txFlow(rows[3], "cash")).toBe("in");
    expect(txFlow(rows[3], "ub")).toBe("out");
    expect(txFlow(rows[2])).toBe("in");
    expect(txFlow(rows[0])).toBe("out");
    expect(txFlow(tx({ kind: "borrow", toId: "cash", fromId: "loan" }))).toBe("in");
    expect(txFlow(tx({ kind: "adjustment", toId: "cash" }))).toBe("in");
    expect(txFlow(tx({ kind: "adjustment", fromId: "cash" }))).toBe("out");
  });

  it("totals in and out for the shown rows", () => {
    const month = filterActivity(rows, DEFAULT_ACTIVITY_FILTER, "2026-10");
    expect(activityTotals(month)).toEqual({ count: 5, moneyIn: 1000, moneyOut: 420 });
    const cash = filterActivity(rows, { ...DEFAULT_ACTIVITY_FILTER, accountId: "cash" }, "2026-10");
    expect(activityTotals(cash, "cash")).toEqual({ count: 3, moneyIn: 100, moneyOut: 350 });
  });
});

describe("accountFlowLabel", () => {
  const names: Record<string, string> = { cash: "Cash", ub: "UB", loan: "Home loan" };
  const nameOf = (id: string) => names[id] ?? "Account";

  it("names the account per kind", () => {
    expect(accountFlowLabel(rows[0], nameOf)).toBe("from Cash");
    expect(accountFlowLabel(rows[2], nameOf)).toBe("to UB");
    expect(accountFlowLabel(rows[3], nameOf)).toBe("UB → Cash");
    expect(accountFlowLabel(rows[4], nameOf)).toBe("Cash → Home loan");
    expect(accountFlowLabel(tx({ kind: "payment", toId: "loan" }), nameOf)).toBe("Untracked → Home loan");
    expect(accountFlowLabel(tx({ kind: "borrow", fromId: "loan", toId: "cash" }), nameOf)).toBe("Home loan → Cash");
    expect(accountFlowLabel(tx({ kind: "expense" }), nameOf)).toBe("");
  });
});

describe("accountGroups", () => {
  it("groups live accounts by kind and drops empty groups", () => {
    const acc = (id: string, kind: Account["kind"], archived = false) =>
      ({ id, name: id, kind, archived }) as Account;
    const groups = accountGroups([acc("cash", "cash"), acc("ub", "cash"), acc("old", "cash", true), acc("loan", "liability")]);
    expect(groups.map((g) => [g.label, g.accounts.map((a) => a.id)])).toEqual([
      ["Cash & banks", ["cash", "ub"]],
      ["Loans", ["loan"]],
    ]);
  });
});

describe("parseActivityFilter", () => {
  it("restores a saved filter and rejects junk", () => {
    const saved = { kind: "income", accountId: "ub", date: { mode: "range", from: "2026-10-01", to: "2026-10-05" } };
    expect(parseActivityFilter(JSON.stringify(saved))).toEqual(saved);
    expect(parseActivityFilter("{bad")).toEqual(DEFAULT_ACTIVITY_FILTER);
    expect(parseActivityFilter(null)).toEqual(DEFAULT_ACTIVITY_FILTER);
    expect(parseActivityFilter(JSON.stringify({ kind: "nope", date: { mode: "x" } }))).toEqual(DEFAULT_ACTIVITY_FILTER);
  });
});
