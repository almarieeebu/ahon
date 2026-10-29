import { emptyState } from "./defaults";
import { todayIso } from "./money";
import { resolveParticularRef } from "./refs";
import type {
  Account,
  AppState,
  BudgetLine,
  Category,
  Particular,
  ParticularTone,
  Transaction,
} from "./types";

type LegacyParticular = Particular & { tone?: ParticularTone };
type LegacyCategory = Partial<Category> & {
  id: string;
  name: string;
  tone?: ParticularTone;
};

type LegacyState = {
  version?: number;
  settings?: {
    monthlyIncome?: number;
    emergencyReserve?: number;
    paydayDays?: number[];
    setupComplete?: boolean;
    housingPayment?: number;
    startingCash?: number;
    openedOn?: string;
  };
  debts?: Array<{
    id: string;
    name: string;
    startingBalance: number;
    monthlyRate: number;
  }>;
  envelopes?: Record<string, number>;
  accounts?: Account[];
  categories?: LegacyCategory[];
  particulars?: LegacyParticular[];
  budgetPeriods?: AppState["budgetPeriods"];
  budgetLines?: Array<Partial<BudgetLine> & { periodId: string; id: string }>;
  transactions?: Array<
    Partial<Transaction> &
      Transaction & { envelope?: string; source?: string }
  >;
};

const TONE_TO_CATEGORY: Record<ParticularTone, string> = {
  paycheck: "salary",
  housing: "rent",
  loan: "debt",
  utility: "electricity",
  food: "food",
  personal: "personal",
  allowance: "allowance",
  default: "others",
};

function inferTone(name: string, kind: Category["kind"]): ParticularTone {
  const n = name.toLowerCase();
  if (kind === "income" || /paycheck|salary|income/.test(n)) return "paycheck";
  if (/rent|hous/.test(n)) return "housing";
  if (/debt|loan|utang|cc/.test(n)) return "loan";
  if (/electric|internet|water|util/.test(n)) return "utility";
  if (/food|milk|baby|baon|grocery/.test(n)) return "food";
  if (/personal|waway|cath/.test(n)) return "personal";
  if (/allowance|savings|tigum/.test(n)) return "allowance";
  return "default";
}

function normalizeAccount(account: Account): Account {
  return {
    ...account,
    mode:
      account.mode ??
      (account.kind === "liability" ? "revolving" : undefined),
    schedule: account.schedule ?? undefined,
    dueDay: account.dueDay ?? 0,
    goal: account.goal ?? 0,
    // Records saved before this flag existed were entered as real balances.
    balanceKnown: account.balanceKnown !== false,
  };
}

function normalizeCategory(c: LegacyCategory): Category {
  const kind = c.kind === "income" ? "income" : "expense";
  return {
    id: c.id,
    name: c.name,
    planned: c.planned ?? 0,
    dueDay: c.dueDay ?? 0,
    kind,
    tone: c.tone ?? inferTone(c.name, kind),
  };
}

function normalizeParticular(
  p: LegacyParticular,
  categories: Category[],
): Particular {
  if (p.categoryId && categories.some((c) => c.id === p.categoryId)) {
    return { id: p.id, name: p.name, categoryId: p.categoryId };
  }
  if (p.tone) {
    const mapped = TONE_TO_CATEGORY[p.tone];
    if (categories.some((c) => c.id === mapped)) {
      return { id: p.id, name: p.name, categoryId: mapped };
    }
    const byTone = categories.find((c) => c.tone === p.tone);
    if (byTone) return { id: p.id, name: p.name, categoryId: byTone.id };
  }
  return { id: p.id, name: p.name, categoryId: null };
}

function normalizeBudgetLine(
  line: Partial<BudgetLine> & { periodId: string; id: string },
  particulars: AppState["particulars"],
): BudgetLine {
  const ref = resolveParticularRef(
    particulars,
    line.particularId,
    line.particular ?? "",
  );
  return {
    id: line.id,
    periodId: line.periodId,
    due: line.due ?? "",
    particular: ref.particular,
    particularId: ref.particularId,
    income: line.income ?? 0,
    expense: line.expense ?? 0,
    actual: line.actual ?? null,
    status: line.status ?? "unpaid",
    order: line.order ?? 0,
    ...(line.lineType === "limit" ||
    line.lineType === "bill" ||
    line.lineType === "income"
      ? { lineType: line.lineType }
      : {}),
    ...(line.categoryId ? { categoryId: line.categoryId } : {}),
    ...(line.legacyReview === "kept" || line.legacyReview === "hidden"
      ? { legacyReview: line.legacyReview }
      : {}),
  };
}

function normalizeTransaction(
  tx: Partial<Transaction> & Transaction,
  particulars: AppState["particulars"],
): Transaction {
  const ref = resolveParticularRef(
    particulars,
    tx.particularId,
    tx.particular ?? "",
  );
  return {
    id: tx.id,
    date: tx.date,
    kind: tx.kind,
    amount: tx.amount,
    category: tx.category ?? "",
    particular: ref.particular,
    particularId: ref.particularId,
    fromId: tx.fromId ?? null,
    toId: tx.toId ?? null,
    note: tx.note ?? "",
    installmentId: tx.installmentId,
    budgetLineId: tx.budgetLineId ?? null,
  };
}

function normalizePaydayDays(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .map(Number)
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= 31),
  )].sort((a, b) => a - b);
}

/**
 * Normalize a backup / older JSON into AppState.
 * Does not inject sample/seed data — missing lists stay empty.
 */
export function migrateState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Partial<AppState> & LegacyState;
  const blank = emptyState();

  if (Array.isArray(v.accounts) && Array.isArray(v.transactions)) {
    const accounts = v.accounts.map(normalizeAccount);
    const categories =
      v.categories && v.categories.length > 0
        ? v.categories.map(normalizeCategory)
        : [];
    const particulars =
      v.particulars && v.particulars.length > 0
        ? v.particulars.map((p) => normalizeParticular(p, categories))
        : [];
    const hasBudget =
      Array.isArray(v.budgetPeriods) &&
      Array.isArray(v.budgetLines) &&
      (v.budgetPeriods.length > 0 || v.budgetLines.length > 0);

    return {
      version: 5,
      settings: {
        monthlyIncome: v.settings?.monthlyIncome ?? 0,
        emergencyReserve: v.settings?.emergencyReserve ?? 0,
        paydayDays: normalizePaydayDays(v.settings?.paydayDays),
        // Books saved before the guided setup existed are already in use;
        // don't interrupt their owner with the new-user flow.
        setupComplete:
          typeof v.settings?.setupComplete === "boolean"
            ? v.settings.setupComplete
            : (v.version ?? 0) >= 5,
        openedOn: v.settings?.openedOn ?? blank.settings.openedOn,
      },
      accounts,
      categories,
      particulars,
      budgetPeriods: hasBudget ? (v.budgetPeriods ?? []) : [],
      budgetLines: hasBudget
        ? (v.budgetLines ?? []).map((line) =>
            normalizeBudgetLine(line, particulars),
          )
        : [],
      transactions: v.transactions.map((tx) =>
        normalizeTransaction(tx, particulars),
      ),
    };
  }

  if (!Array.isArray(v.debts) && !Array.isArray(v.transactions)) return null;

  return {
    ...blank,
    settings: {
      monthlyIncome: v.settings?.monthlyIncome ?? 0,
      emergencyReserve: v.settings?.emergencyReserve ?? 0,
      paydayDays: normalizePaydayDays(v.settings?.paydayDays),
      setupComplete:
        typeof v.settings?.setupComplete === "boolean"
          ? v.settings.setupComplete
          : true,
      openedOn: v.settings?.openedOn ?? todayIso(),
    },
  };
}
