import { monthAffordability } from "./affordability";
import { moneyNeededBeforePayday, nextPayday } from "./cashPlan";
import { monthKey, todayIso, uid } from "./money";
import { periodOverlapsMonth, summarizeMonthBudget } from "./periodBudget";
import { findParticular, resolveParticularRef } from "./refs";
import { nextUnpaid, scheduleRemaining } from "./schedule";
import { accountBalances, byKind, liveAccounts } from "./selectors";
import type {
  Account,
  AppState,
  BudgetLine,
  BudgetPeriod,
  Transaction,
} from "./types";

export type SimpleDirection = "in" | "out";

export type SimpleChip = {
  id: string;
  label: string;
  particularId: string;
};

export const SPEND_CHIPS: SimpleChip[] = [
  { id: "food", label: "Food", particularId: "p-groceries" },
  { id: "bills", label: "Bills", particularId: "p-electric" },
  { id: "load", label: "Load", particularId: "p-mobile" },
  { id: "transport", label: "Transport", particularId: "p-transport" },
  { id: "utang", label: "Utang", particularId: "p-debt" },
  { id: "other", label: "Other", particularId: "p-misc" },
];

export const INCOME_CHIPS: SimpleChip[] = [
  { id: "paycheck", label: "Paycheck / sweldo", particularId: "p-paycheck" },
];

const BILL_PARTICULAR_IDS = new Set([
  "p-rent",
  "p-electric",
  "p-water",
  "p-internet",
]);

export type SimpleLogDraft = {
  direction: SimpleDirection;
  amount: number;
  chipId?: string;
  particularId?: string | null;
  fromId?: string | null;
  toId?: string | null;
  date?: string;
};

export type LogSaveFeedback = {
  cashLeft: number;
  sentence: string;
  tone: "ok" | "tight" | "need";
};

export type DailyPrompt =
  | { id: "first-log"; kind: "first-log" }
  | { id: "payday"; kind: "payday" }
  | { id: `bill:${string}`; kind: "bill"; line: BudgetLine }
  | { id: "catchup"; kind: "catchup" }
  | { id: "gastos"; kind: "gastos" };

export type PromptDismissState = {
  day: string;
  ids: string[];
};

export const PROMPT_STORAGE_KEY = "ahon.prompt.dismissed.v1";
export const RITUAL_STORAGE_KEY = "ahon.ritual.seen.v1";

export function defaultCashAccount(state: AppState): Account | undefined {
  return (
    liveAccounts(state).find((account) => account.id === "cash-on-hand") ??
    byKind(state, "cash")[0]
  );
}

export function cashAccounts(state: AppState): Account[] {
  return byKind(state, "cash");
}

export function shouldShowWalletPicker(state: AppState): boolean {
  return cashAccounts(state).length > 1;
}

export function chipsForDirection(direction: SimpleDirection): SimpleChip[] {
  return direction === "in" ? INCOME_CHIPS : SPEND_CHIPS;
}

export function moreParticulars(
  state: AppState,
  direction: SimpleDirection,
): { id: string; name: string }[] {
  const chips = chipsForDirection(direction);
  const used = new Set(chips.map((chip) => chip.particularId));
  const wantKind = direction === "in" ? "income" : "expense";
  return state.particulars.filter((particular) => {
    if (used.has(particular.id)) return false;
    const category = state.categories.find((item) => item.id === particular.categoryId);
    const kind = category?.kind ?? "expense";
    return kind === wantKind;
  });
}

export function unpaidPlanLines(state: AppState, month: string): BudgetLine[] {
  return summarizeMonthBudget(state, month).lines.filter(
    (line) =>
      line.status !== "paid" && ((line.income || 0) > 0 || (line.expense || 0) > 0),
  );
}

export function monthHasPlan(state: AppState, month: string): boolean {
  return unpaidPlanLines(state, month).length > 0 ||
    summarizeMonthBudget(state, month).lines.some(
      (line) => (line.income || 0) > 0 || (line.expense || 0) > 0,
    );
}

export function monthsWithPlannedLines(state: AppState): string[] {
  const keys = new Set<string>();
  for (const period of state.budgetPeriods) {
    let cursor = period.start.slice(0, 7);
    const endKey = period.end.slice(0, 7);
    while (cursor && cursor <= endKey) {
      keys.add(cursor);
      const [year, month] = cursor.split("-").map(Number);
      cursor =
        month === 12
          ? `${year + 1}-01`
          : `${year}-${String(month + 1).padStart(2, "0")}`;
    }
  }
  for (const line of state.budgetLines) {
    if ((line.income || 0) <= 0 && (line.expense || 0) <= 0) continue;
    if (line.due) keys.add(line.due.slice(0, 7));
  }
  return [...keys].filter(Boolean).sort();
}

export function previousMonthWithPlan(
  state: AppState,
  toKey: string,
): string | null {
  const months = monthsWithPlannedLines(state).filter((key) => key < toKey);
  return months[months.length - 1] ?? null;
}

function monthEnd(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return `${key}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
}

function shiftIso(iso: string, fromKey: string, toKey: string): string {
  if (!iso) return "";
  const day = Number((iso.startsWith(fromKey) ? iso : `${fromKey}-01`).slice(-2));
  const last = Number(monthEnd(toKey).slice(-2));
  const safe = Number.isFinite(day) && day > 0 ? Math.min(day, last) : 1;
  return `${toKey}-${String(safe).padStart(2, "0")}`;
}

function unpaidBillLine(
  state: AppState,
  month: string,
): BudgetLine | undefined {
  return unpaidPlanLines(state, month).find((line) => {
    if ((line.expense || 0) <= 0) return false;
    if (isDebtLine(state, line)) return false;
    if (line.particularId && BILL_PARTICULAR_IDS.has(line.particularId)) return true;
    return true;
  });
}

function isDebtLine(state: AppState, line: BudgetLine): boolean {
  const particular = findParticular(state.particulars, {
    id: line.particularId,
    name: line.particular,
  });
  if (particular?.id === "p-debt" || particular?.categoryId === "cat-debt") {
    return true;
  }
  const category = state.categories.find(
    (item) => item.id === (particular?.categoryId ?? ""),
  );
  return category?.tone === "loan" || category?.id === "cat-debt";
}

function matchingLiability(state: AppState, line?: BudgetLine): Account | undefined {
  const debts = byKind(state, "liability");
  if (debts.length === 0) return undefined;
  const name = (line?.particular || "").trim().toLowerCase();
  if (name) {
    const hit = debts.find((debt) => debt.name.trim().toLowerCase() === name);
    if (hit) return hit;
  }
  return debts[0];
}

function resolveChipParticular(
  state: AppState,
  draft: SimpleLogDraft,
): { particularId: string | null; particular: string; category: string } {
  if (draft.particularId) {
    const ref = resolveParticularRef(state.particulars, draft.particularId, "");
    const particular = state.particulars.find((item) => item.id === ref.particularId);
    return {
      particularId: ref.particularId,
      particular: ref.particular,
      category: particular?.categoryId ?? (draft.direction === "in" ? "cat-salary" : "cat-others"),
    };
  }

  const chips = chipsForDirection(draft.direction);
  const chip = chips.find((item) => item.id === draft.chipId) ?? chips[0];
  let particularId = chip?.particularId ?? null;

  if (draft.direction === "out" && chip?.id === "bills") {
    const bill = unpaidBillLine(state, (draft.date ?? todayIso()).slice(0, 7));
    if (bill?.particularId) particularId = bill.particularId;
  }

  const ref = resolveParticularRef(state.particulars, particularId, chip?.label ?? "");
  const particular = state.particulars.find((item) => item.id === ref.particularId);
  return {
    particularId: ref.particularId,
    particular: ref.particular || chip?.label || "",
    category:
      particular?.categoryId ??
      (draft.direction === "in" ? "cat-salary" : "cat-others"),
  };
}

export function buildSimpleTransaction(
  state: AppState,
  draft: SimpleLogDraft,
): Omit<Transaction, "id"> | null {
  const amount = Math.round(draft.amount * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const cash = defaultCashAccount(state);
  const date = draft.date ?? todayIso();
  const tags = resolveChipParticular(state, draft);
  const fromCash =
    draft.fromId && cashAccounts(state).some((account) => account.id === draft.fromId)
      ? draft.fromId
      : (cash?.id ?? null);

  if (draft.direction === "in") {
    const toId =
      draft.toId && cashAccounts(state).some((account) => account.id === draft.toId)
        ? draft.toId
        : (cash?.id ?? null);
    return {
      date,
      kind: "income",
      amount,
      category: tags.category || "cat-salary",
      particular: tags.particular,
      particularId: tags.particularId,
      fromId: null,
      toId,
      note: "",
    };
  }

  const chip = SPEND_CHIPS.find((item) => item.id === draft.chipId);
  const debt = matchingLiability(state);
  if (chip?.id === "utang" && debt) {
    return {
      date,
      kind: "payment",
      amount,
      category: "debt",
      particular: tags.particular,
      particularId: tags.particularId,
      fromId: fromCash,
      toId: draft.toId && byKind(state, "liability").some((item) => item.id === draft.toId)
        ? draft.toId
        : debt.id,
      note: "",
    };
  }

  if (!fromCash) return null;
  return {
    date,
    kind: "expense",
    amount,
    category: tags.category || "cat-others",
    particular: tags.particular,
    particularId: tags.particularId,
    fromId: fromCash,
    toId: null,
    note: "",
  };
}

export function applySimpleLog(state: AppState, draft: SimpleLogDraft): AppState | null {
  const payload = buildSimpleTransaction(state, draft);
  if (!payload) return null;
  const ref = resolveParticularRef(
    state.particulars,
    payload.particularId,
    payload.particular,
  );
  return {
    ...state,
    transactions: [
      ...state.transactions,
      { ...payload, ...ref, id: uid() },
    ],
  };
}

export function applyUpdateTransaction(
  state: AppState,
  tx: Transaction,
): AppState | null {
  if (!state.transactions.some((row) => row.id === tx.id)) return null;
  const ref = resolveParticularRef(
    state.particulars,
    tx.particularId,
    tx.particular,
  );
  return {
    ...state,
    transactions: state.transactions.map((row) =>
      row.id === tx.id ? { ...tx, ...ref } : row,
    ),
  };
}

export function applySimpleUpdate(
  state: AppState,
  id: string,
  draft: SimpleLogDraft,
): AppState | null {
  const payload = buildSimpleTransaction(state, draft);
  if (!payload) return null;
  const current = state.transactions.find((row) => row.id === id);
  if (!current || current.kind === "adjustment") return null;
  const ref = resolveParticularRef(
    state.particulars,
    payload.particularId,
    payload.particular,
  );
  return applyUpdateTransaction(state, {
    ...current,
    ...payload,
    ...ref,
    id,
    date: draft.date ?? current.date,
    note: current.note,
    installmentId: current.installmentId,
  });
}

export function chipIdForParticular(
  direction: SimpleDirection,
  particularId: string | null | undefined,
): string {
  const chips = chipsForDirection(direction);
  return chips.find((chip) => chip.particularId === particularId)?.id ?? "";
}

function paymentFromLine(
  state: AppState,
  line: BudgetLine,
  amount: number,
  date: string,
  cashId: string | null,
): { accounts: Account[]; transaction: Transaction } | null {
  const debt = matchingLiability(state, line);
  if (!debt) return null;

  if (debt.mode === "installment" && debt.schedule?.length) {
    const next = nextUnpaid(debt.schedule);
    if (next) {
      const before = scheduleRemaining(debt.openingBalance, debt.schedule);
      const after = Math.max(0, Math.round((before - next.amount) * 100) / 100);
      const accounts = state.accounts.map((account) =>
        account.id !== debt.id
          ? account
          : {
              ...account,
              schedule: account.schedule?.map((row) =>
                row.id === next.id
                  ? { ...row, status: "paid" as const, balanceAfter: after }
                  : row,
              ),
            },
      );
      const ref = resolveParticularRef(
        state.particulars,
        line.particularId,
        line.particular,
      );
      return {
        accounts,
        transaction: {
          id: uid(),
          date,
          kind: "payment",
          amount: next.amount,
          category: "debt",
          particular: ref.particular,
          particularId: ref.particularId,
          fromId: cashId,
          toId: debt.id,
          note: `${debt.name} · ${next.due}`,
          installmentId: next.id,
        },
      };
    }
  }

  const ref = resolveParticularRef(
    state.particulars,
    line.particularId,
    line.particular,
  );
  return {
    accounts: state.accounts,
    transaction: {
      id: uid(),
      date,
      kind: "payment",
      amount,
      category: "debt",
      particular: ref.particular,
      particularId: ref.particularId,
      fromId: cashId,
      toId: debt.id,
      note: "",
    },
  };
}

export function payBudgetLine(
  state: AppState,
  lineId: string,
  today = todayIso(),
): AppState | null {
  const line = state.budgetLines.find((item) => item.id === lineId);
  if (!line || line.status === "paid") return null;

  const amount = Math.round(
    ((line.income || 0) > 0 && (line.expense || 0) <= 0
      ? line.income
      : line.expense || line.income || 0) * 100,
  ) / 100;
  if (amount <= 0) return null;

  const cash = defaultCashAccount(state);
  const cashId = cash?.id ?? null;
  const isIncome = (line.income || 0) > 0 && (line.expense || 0) <= 0;
  let accounts = state.accounts;
  let transaction: Transaction;

  if (isIncome) {
    const ref = resolveParticularRef(
      state.particulars,
      line.particularId,
      line.particular,
    );
    transaction = {
      id: uid(),
      date: today,
      kind: "income",
      amount,
      category:
        state.particulars.find((item) => item.id === ref.particularId)?.categoryId ??
        "cat-salary",
      particular: ref.particular,
      particularId: ref.particularId,
      fromId: null,
      toId: cashId,
      note: "",
    };
  } else if (isDebtLine(state, line)) {
    const paid = paymentFromLine(state, line, amount, today, cashId);
    if (!paid) {
      const ref = resolveParticularRef(
        state.particulars,
        line.particularId,
        line.particular,
      );
      if (!cashId) return null;
      transaction = {
        id: uid(),
        date: today,
        kind: "expense",
        amount,
        category: "cat-debt",
        particular: ref.particular,
        particularId: ref.particularId,
        fromId: cashId,
        toId: null,
        note: "",
      };
    } else {
      accounts = paid.accounts;
      transaction = paid.transaction;
    }
  } else {
    if (!cashId) return null;
    const ref = resolveParticularRef(
      state.particulars,
      line.particularId,
      line.particular,
    );
    transaction = {
      id: uid(),
      date: today,
      kind: "expense",
      amount,
      category:
        state.particulars.find((item) => item.id === ref.particularId)?.categoryId ??
        "cat-others",
      particular: ref.particular,
      particularId: ref.particularId,
      fromId: cashId,
      toId: null,
      note: "",
    };
  }

  return {
    ...state,
    accounts,
    budgetLines: state.budgetLines.map((item) =>
      item.id === lineId
        ? { ...item, status: "paid", actual: transaction.amount }
        : item,
    ),
    transactions: [...state.transactions, transaction],
  };
}

export function copyBudgetMonth(
  state: AppState,
  fromKey: string,
  toKey: string,
): AppState | null {
  if (!fromKey || !toKey || fromKey === toKey) return null;
  if (state.budgetPeriods.some((period) => periodOverlapsMonth(period, toKey))) {
    return null;
  }

  const sourcePeriods = state.budgetPeriods.filter((period) =>
    periodOverlapsMonth(period, fromKey),
  );
  if (sourcePeriods.length === 0) return null;

  const budgetPeriods: BudgetPeriod[] = [...state.budgetPeriods];
  const budgetLines: BudgetLine[] = [...state.budgetLines];

  for (const period of sourcePeriods) {
    const nextPeriod: BudgetPeriod = {
      id: uid(),
      start: shiftIso(period.start, fromKey, toKey) || `${toKey}-01`,
      end: shiftIso(period.end, fromKey, toKey) || monthEnd(toKey),
    };
    budgetPeriods.push(nextPeriod);
    const rows = state.budgetLines
      .filter((line) => line.periodId === period.id)
      .sort((a, b) => a.order - b.order);
    for (const row of rows) {
      budgetLines.push({
        ...row,
        id: uid(),
        periodId: nextPeriod.id,
        due: row.due ? shiftIso(row.due, fromKey, toKey) : "",
        actual: null,
        status: "unpaid",
      });
    }
  }

  return { ...state, budgetPeriods, budgetLines };
}

export function logSaveFeedback(
  state: AppState,
  today = todayIso(),
): LogSaveFeedback {
  const cash = accountBalances(state);
  const cashLeft = byKind(state, "cash").reduce(
    (sum, account) => sum + (cash[account.id] ?? 0),
    0,
  );
  const afford = monthAffordability(state, today.slice(0, 7), cashLeft);
  const payday = nextPayday(state.settings.paydayDays, today);
  const paydayLabel = payday
    ? new Date(`${payday}T12:00:00`).toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
      })
    : "";

  if (afford.verdict === "no") {
    return {
      cashLeft,
      tone: "need",
      sentence: "Need more this month to cover bills and utang.",
    };
  }
  if (afford.verdict === "tight") {
    return {
      cashLeft,
      tone: "tight",
      sentence: paydayLabel
        ? `Tight until ${paydayLabel} — little room after bills and utang.`
        : "Tight month — little room after bills and utang.",
    };
  }
  return {
    cashLeft,
    tone: "ok",
    sentence: paydayLabel
      ? `Still okay until ${paydayLabel}.`
      : "Still okay this month.",
  };
}

export function monthStatusSentence(
  state: AppState,
  month = monthKey(),
  today = todayIso(),
): LogSaveFeedback {
  const cashLeft = byKind(state, "cash").reduce(
    (sum, account) => sum + (accountBalances(state)[account.id] ?? 0),
    0,
  );
  const afford = monthAffordability(state, month, cashLeft);
  if (afford.income <= 0 && afford.obligations <= 0) {
    return {
      cashLeft,
      tone: "ok",
      sentence: "Add your usual bills or log money to see if you are okay this month.",
    };
  }
  return logSaveFeedback(state, today);
}

function dayNumber(iso: string): number {
  return Number(iso.slice(-2));
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`);
  const b = new Date(`${to}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function pickDailyPrompt(
  state: AppState,
  opts?: {
    today?: string;
    hour?: number;
    dismissedIds?: string[];
  },
): DailyPrompt | null {
  const today = opts?.today ?? todayIso();
  const hour = opts?.hour ?? new Date().getHours();
  const dismissed = new Set(opts?.dismissedIds ?? []);
  const month = today.slice(0, 7);
  const txs = state.transactions.filter((tx) => tx.kind !== "adjustment");

  if (txs.length === 0 && !dismissed.has("first-log")) {
    return { id: "first-log", kind: "first-log" };
  }

  const paydayDays = state.settings.paydayDays;
  const isPayday = paydayDays.includes(dayNumber(today));
  const incomeToday = txs.some((tx) => tx.kind === "income" && tx.date === today);
  if (isPayday && !incomeToday && !dismissed.has("payday")) {
    return { id: "payday", kind: "payday" };
  }

  const dueBills = unpaidPlanLines(state, month)
    .filter((line) => (line.expense || 0) > 0 && line.due && line.due <= today)
    .sort((a, b) => a.due.localeCompare(b.due));
  const dueBill = dueBills.find((line) => !dismissed.has(`bill:${line.id}`));
  if (dueBill) {
    return { id: `bill:${dueBill.id}`, kind: "bill", line: dueBill };
  }

  const lastSpend = [...txs]
    .filter((tx) => tx.kind === "expense" || tx.kind === "payment")
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (
    lastSpend &&
    daysBetween(lastSpend.date, today) >= 3 &&
    !dismissed.has("catchup")
  ) {
    return { id: "catchup", kind: "catchup" };
  }

  const spentToday = txs.some(
    (tx) =>
      (tx.kind === "expense" || tx.kind === "payment") && tx.date === today,
  );
  if (hour >= 17 && !spentToday && !dismissed.has("gastos")) {
    return { id: "gastos", kind: "gastos" };
  }

  return null;
}

export function loadPromptDismissals(today = todayIso()): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PROMPT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PromptDismissState;
    if (parsed.day !== today) return [];
    return Array.isArray(parsed.ids) ? parsed.ids : [];
  } catch {
    return [];
  }
}

export function dismissPrompt(id: string, today = todayIso()): string[] {
  const ids = [...new Set([...loadPromptDismissals(today), id])];
  if (typeof window === "undefined") return ids;
  try {
    const payload: PromptDismissState = { day: today, ids };
    window.localStorage.setItem(PROMPT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
  return ids;
}

export function hasSeenRitual(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(RITUAL_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function markRitualSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RITUAL_STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function lineActionLabel(line: BudgetLine): string {
  if ((line.income || 0) > 0 && (line.expense || 0) <= 0) return "I got paid";
  return "I paid this";
}
