/**
 * Map between Ahon AppState (TypeScript) ug Supabase rows (PostgreSQL).
 * Think of this as a translator: UI shape ↔ database shape.
 */

import type {
  Account,
  AppState,
  BudgetLine,
  BudgetPeriod,
  Category,
  Installment,
  Particular,
  ParticularTone,
  Transaction,
} from "@/lib/types";
import { emptyState } from "@/lib/defaults";
import type { SupabaseClient } from "@supabase/supabase-js";

type Sb = SupabaseClient;

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeTxKind(kind: unknown): Transaction["kind"] {
  const k = String(kind ?? "");
  if (
    k === "income" ||
    k === "expense" ||
    k === "transfer" ||
    k === "payment" ||
    k === "adjustment" ||
    k === "borrow"
  ) {
    return k;
  }
  return "expense";
}

function formatSbError(err: { message?: string; code?: string; details?: string } | null): string {
  if (!err) return "Unknown Supabase error";
  const parts = [err.message, err.code, err.details].filter(Boolean);
  return parts.join(" — ") || "Unknown Supabase error";
}

/**
 * Insert rows; if the project has not yet run the latest schema.sql migration
 * (new nullable columns missing), retry once without those columns so older
 * databases keep syncing. Local data still keeps the fields.
 */
async function insertCompat(
  supabase: Sb,
  table: string,
  rows: Record<string, unknown>[],
  newColumns: string[],
): Promise<{ error: string | null }> {
  const { error } = await supabase.from(table).insert(rows);
  if (!error) return { error: null };
  const msg = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  const missing = newColumns.filter((col) => msg.includes(col));
  if (missing.length === 0) return { error: error.message };
  const stripped = rows.map((row) => {
    const copy = { ...row };
    for (const col of missing) delete copy[col];
    return copy;
  });
  const retry = await supabase.from(table).insert(stripped);
  return { error: retry.error ? retry.error.message : null };
}

/** Friendlier copy for known Supabase / PostgREST failures. */
export function explainCloudError(message: string): string {
  const m = message.toLowerCase();
  if (
    m.includes("pgrst303") ||
    m.includes("jwt issued at future") ||
    m.includes("issued at future")
  ) {
    return (
      "Sync paused (clock / token timing). " +
      "On your phone: set Date & Time to Automatic, then Sign out → Sign in, or wait a minute and refresh. " +
      "Your books stay on this device meanwhile."
    );
  }
  if (m.includes("schema cache") || m.includes("could not find the table")) {
    return `${message} — Run supabase/schema.sql in the Supabase SQL Editor, then refresh.`;
  }
  return message;
}

/** Load all user finance data from Supabase into AppState. */
export async function loadCloudState(
  supabase: Sb,
  userId: string,
): Promise<{ state: AppState | null; error: string | null }> {
  const [
    profileRes,
    accountsRes,
    installmentsRes,
    categoriesRes,
    particularsRes,
    periodsRes,
    linesRes,
    txRes,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("accounts").select("*").eq("user_id", userId),
    supabase.from("installments").select("*").eq("user_id", userId),
    supabase.from("categories").select("*").eq("user_id", userId),
    supabase.from("particulars").select("*").eq("user_id", userId),
    supabase.from("budget_periods").select("*").eq("user_id", userId),
    supabase.from("budget_lines").select("*").eq("user_id", userId),
    supabase.from("transactions").select("*").eq("user_id", userId),
  ]);

  const err =
    profileRes.error ||
    accountsRes.error ||
    installmentsRes.error ||
    categoriesRes.error ||
    particularsRes.error ||
    periodsRes.error ||
    linesRes.error ||
    txRes.error;
  if (err) {
    const message = formatSbError(err);
    console.error("loadCloudState", message, err);
    return { state: null, error: message };
  }

  const installmentsByAccount = new Map<string, Installment[]>();
  for (const row of installmentsRes.data ?? []) {
    const list = installmentsByAccount.get(row.account_id) ?? [];
    list.push({
      id: row.id,
      due: row.due,
      amount: num(row.amount),
      status: row.status === "paid" ? "paid" : "unpaid",
      balanceAfter: row.balance_after == null ? null : num(row.balance_after),
    });
    installmentsByAccount.set(row.account_id, list);
  }

  const accounts: Account[] = (accountsRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    liabilityType: row.liability_type ?? undefined,
    mode: row.mode ?? undefined,
    openingBalance: num(row.opening_balance),
    monthlyRate: num(row.monthly_rate),
    dueDay: num(row.due_day),
    plannedPayment: num(row.planned_payment),
    goal: num(row.goal),
    archived: Boolean(row.archived),
    schedule: installmentsByAccount.get(row.id),
    // null (pre-migration rows) means the balance was entered as known.
    balanceKnown: row.balance_known !== false,
  }));

  const categories: Category[] = (categoriesRes.data ?? [])
    .sort((a, b) => num(a.sort_order) - num(b.sort_order))
    .map((row) => ({
      id: row.id,
      name: row.name,
      planned: num(row.planned),
      dueDay: num(row.due_day),
      kind: row.kind === "income" ? "income" : "expense",
      tone: (row.tone as ParticularTone) || "default",
    }));

  const particulars: Particular[] = (particularsRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    categoryId: row.category_id ?? null,
  }));

  const budgetPeriods: BudgetPeriod[] = (periodsRes.data ?? []).map((row) => ({
    id: row.id,
    start: row.start_date,
    end: row.end_date,
  }));

  const budgetLines: BudgetLine[] = (linesRes.data ?? [])
    .sort((a, b) => num(a.sort_order) - num(b.sort_order))
    .map((row) => ({
      id: row.id,
      periodId: row.period_id,
      due: row.due ?? "",
      particular: row.particular ?? "",
      particularId: row.particular_id ?? null,
      income: num(row.income),
      expense: num(row.expense),
      actual: row.actual == null ? null : num(row.actual),
      status: (row.status as BudgetLine["status"]) || "",
      order: num(row.sort_order),
    }));

  const transactions: Transaction[] = (txRes.data ?? []).map((row) => ({
    id: row.id,
    date: row.tx_date,
    kind: normalizeTxKind(row.kind),
    amount: num(row.amount),
    category: row.category ?? "",
    particular: row.particular ?? "",
    particularId: row.particular_id ?? null,
    fromId: row.from_id ?? null,
    toId: row.to_id ?? null,
    note: row.note ?? "",
    installmentId: row.installment_id ?? undefined,
    budgetLineId: row.budget_line_id ?? null,
  }));

  const profile = profileRes.data;
  const emptyCloud =
    accounts.length === 0 &&
    categories.length === 0 &&
    budgetPeriods.length === 0 &&
    transactions.length === 0;

  if (emptyCloud) return { state: null, error: null };

  const blank = emptyState();
  return {
    state: {
      version: 5,
      settings: {
        monthlyIncome: num(profile?.monthly_income, 0),
        emergencyReserve: num(profile?.emergency_reserve, 0),
        paydayDays: Array.isArray(profile?.payday_days)
          ? profile.payday_days
              .map(Number)
              .filter((day: number) => Number.isInteger(day) && day >= 1 && day <= 31)
              .sort((a: number, b: number) => a - b)
          : [],
        // Existing cloud profiles predate this field and should not be put
        // back into first-run setup after an upgrade.
        setupComplete: profile?.setup_complete !== false,
        openedOn: profile?.opened_on ?? blank.settings.openedOn,
      },
      accounts,
      categories,
      particulars,
      budgetPeriods,
      budgetLines,
      transactions,
    },
    error: null,
  };
}

/**
 * Replace cloud data with AppState (full sync).
 * Simple approach for v1: delete user rows then insert fresh.
 * Later you can switch to per-row upserts for better performance.
 */
export async function saveCloudState(
  supabase: Sb,
  userId: string,
  state: AppState,
): Promise<{ error: string | null }> {
  // Delete in FK-safe order
  const deletes = [
    supabase.from("transactions").delete().eq("user_id", userId),
    supabase.from("budget_lines").delete().eq("user_id", userId),
    supabase.from("budget_periods").delete().eq("user_id", userId),
    supabase.from("installments").delete().eq("user_id", userId),
    supabase.from("particulars").delete().eq("user_id", userId),
    supabase.from("categories").delete().eq("user_id", userId),
    supabase.from("accounts").delete().eq("user_id", userId),
  ];
  for (const d of deletes) {
    const { error } = await d;
    if (error) return { error: error.message };
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    monthly_income: state.settings.monthlyIncome,
    emergency_reserve: state.settings.emergencyReserve,
    payday_days: state.settings.paydayDays,
    setup_complete: state.settings.setupComplete,
    opened_on: state.settings.openedOn,
    updated_at: new Date().toISOString(),
  });
  if (profileError) return { error: profileError.message };

  if (state.accounts.length) {
    const { error } = await insertCompat(
      supabase,
      "accounts",
      state.accounts.map((a) => ({
        id: a.id,
        user_id: userId,
        name: a.name,
        kind: a.kind,
        liability_type: a.liabilityType ?? null,
        mode: a.mode ?? null,
        opening_balance: a.openingBalance,
        monthly_rate: a.monthlyRate,
        due_day: a.dueDay,
        planned_payment: a.plannedPayment,
        goal: a.goal,
        archived: a.archived,
        balance_known: a.balanceKnown !== false,
      })),
      ["balance_known"],
    );
    if (error) return { error };
  }

  const installmentRows = state.accounts.flatMap((a) =>
    (a.schedule ?? []).map((s, i) => ({
      id: s.id,
      user_id: userId,
      account_id: a.id,
      due: s.due,
      amount: s.amount,
      status: s.status,
      balance_after: s.balanceAfter,
      sort_order: i,
    })),
  );
  if (installmentRows.length) {
    const { error } = await supabase.from("installments").insert(installmentRows);
    if (error) return { error: error.message };
  }

  if (state.categories.length) {
    const { error } = await supabase.from("categories").insert(
      state.categories.map((c, i) => ({
        id: c.id,
        user_id: userId,
        name: c.name,
        planned: c.planned,
        due_day: c.dueDay,
        kind: c.kind,
        tone: c.tone,
        sort_order: i,
      })),
    );
    if (error) return { error: error.message };
  }

  if (state.particulars.length) {
    const { error } = await supabase.from("particulars").insert(
      state.particulars.map((p) => ({
        id: p.id,
        user_id: userId,
        name: p.name,
        category_id: p.categoryId,
      })),
    );
    if (error) return { error: error.message };
  }

  if (state.budgetPeriods.length) {
    const { error } = await supabase.from("budget_periods").insert(
      state.budgetPeriods.map((p) => ({
        id: p.id,
        user_id: userId,
        start_date: p.start,
        end_date: p.end,
      })),
    );
    if (error) return { error: error.message };
  }

  if (state.budgetLines.length) {
    const { error } = await supabase.from("budget_lines").insert(
      state.budgetLines.map((l) => ({
        id: l.id,
        user_id: userId,
        period_id: l.periodId,
        due: l.due || null,
        particular: l.particular,
        particular_id: l.particularId,
        income: l.income,
        expense: l.expense,
        actual: l.actual,
        status: l.status || "unpaid",
        sort_order: l.order,
      })),
    );
    if (error) return { error: error.message };
  }

  if (state.transactions.length) {
    // Drop links to rows that no longer exist so one stale reference cannot
    // fail the whole snapshot insert (FKs are on delete set null).
    const lineIds = new Set(state.budgetLines.map((l) => l.id));
    const { error } = await insertCompat(
      supabase,
      "transactions",
      state.transactions.map((t) => ({
        id: t.id,
        user_id: userId,
        tx_date: t.date,
        kind: t.kind,
        amount: t.amount,
        category: t.category,
        particular: t.particular,
        particular_id: t.particularId,
        from_id: t.fromId,
        to_id: t.toId,
        note: t.note,
        installment_id: t.installmentId ?? null,
        budget_line_id:
          t.budgetLineId && lineIds.has(t.budgetLineId) ? t.budgetLineId : null,
      })),
      ["budget_line_id"],
    );
    if (error) return { error };
  }

  return { error: null };
}
