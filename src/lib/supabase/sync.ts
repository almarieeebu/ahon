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

function formatSbError(err: { message?: string; code?: string; details?: string } | null): string {
  if (!err) return "Unknown Supabase error";
  const parts = [err.message, err.code, err.details].filter(Boolean);
  return parts.join(" — ") || "Unknown Supabase error";
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
    kind: row.kind,
    amount: num(row.amount),
    category: row.category ?? "",
    particular: row.particular ?? "",
    particularId: row.particular_id ?? null,
    fromId: row.from_id ?? null,
    toId: row.to_id ?? null,
    note: row.note ?? "",
    installmentId: row.installment_id ?? undefined,
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
    opened_on: state.settings.openedOn,
    updated_at: new Date().toISOString(),
  });
  if (profileError) return { error: profileError.message };

  if (state.accounts.length) {
    const { error } = await supabase.from("accounts").insert(
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
      })),
    );
    if (error) return { error: error.message };
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
    const { error } = await supabase.from("transactions").insert(
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
      })),
    );
    if (error) return { error: error.message };
  }

  return { error: null };
}
