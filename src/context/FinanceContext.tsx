"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { presetState } from "@/lib/defaults";
import { monthKey, todayIso, uid } from "@/lib/money";
import { emptyBudgetLine } from "@/lib/periodBudget";
import { resolveParticularRef } from "@/lib/refs";
import { scheduleRemaining } from "@/lib/schedule";
import { accountBalances } from "@/lib/selectors";
import { loadState, saveState } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import {
  explainCloudError,
  loadCloudState,
  saveCloudState,
} from "@/lib/supabase/sync";
import type {
  Account,
  AppState,
  BudgetLine,
  BudgetPeriod,
  Category,
  Particular,
  Transaction,
} from "@/lib/types";

type FinanceValue = {
  ready: boolean;
  /** cloud = synced to Supabase; local = this browser only */
  syncMode: "local" | "cloud";
  cloudError: string | null;
  savedAt: number | null;
  state: AppState;
  month: string;
  setMonth: (key: string) => void;
  balances: Record<string, number>;
  addTransaction: (tx: Omit<Transaction, "id">) => void;
  updateTransaction: (tx: Transaction) => void;
  removeTransaction: (id: string) => void;
  upsertAccount: (account: Account) => void;
  archiveAccount: (id: string) => void;
  upsertCategory: (category: Category) => void;
  removeCategory: (id: string) => void;
  moveCategory: (id: string, direction: -1 | 1) => void;
  upsertParticular: (particular: Particular) => void;
  removeParticular: (id: string) => void;
  upsertBudgetPeriod: (period: BudgetPeriod) => void;
  removeBudgetPeriod: (id: string) => void;
  upsertBudgetLine: (line: BudgetLine) => void;
  removeBudgetLine: (id: string) => void;
  addBudgetLine: (periodId: string) => void;
  setCurrentBalance: (id: string, amount: number) => void;
  payInstallment: (
    accountId: string,
    installmentId: string,
    fromId: string | null,
    meta?: {
      particular?: string;
      particularId?: string | null;
      category?: string;
    },
  ) => void;
  unpayInstallment: (accountId: string, installmentId: string) => void;
  updateState: (updater: (prev: AppState) => AppState) => void;
  replaceState: (next: AppState) => void;
  resetAll: () => void;
};

const FinanceContext = createContext<FinanceValue | null>(null);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const { user, localOnly } = useAuth();
  const cloudUserId = !localOnly && user ? user.id : null;

  const [state, setState] = useState<AppState>(presetState);
  const [ready, setReady] = useState(false);
  const [month, setMonth] = useState(monthKey());
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const skipNextSave = useRef(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load once: cloud if logged in, else localStorage
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      skipNextSave.current = true;
      setReady(false);
      setCloudError(null);

      if (cloudUserId) {
        const supabase = createClient();
        if (supabase) {
          const { state: cloud, error: loadError } = await loadCloudState(
            supabase,
            cloudUserId,
          );
          if (cancelled) return;
          if (loadError) {
            setCloudError(explainCloudError(loadError));
            // Keep whatever is already on this device instead of wiping books
            setState(loadState());
            setReady(true);
            return;
          }
          if (cloud) {
            setState(cloud);
            saveState(cloud); // keep a local cache
          } else {
            // Empty cloud → common presets (categories, particulars, cash)
            const blank = presetState();
            setState(blank);
            saveState(blank);
            const { error } = await saveCloudState(
              supabase,
              cloudUserId,
              blank,
            );
            if (error) setCloudError(error);
          }
          setReady(true);
          return;
        }
      }

      setState(loadState());
      setReady(true);
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [cloudUserId]);

  // Persist: always localStorage; debounce cloud when logged in
  useEffect(() => {
    if (!ready) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    saveState(state);
    setSavedAt(Date.now());

    if (!cloudUserId) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const supabase = createClient();
      if (!supabase) return;
      void saveCloudState(supabase, cloudUserId, state).then(({ error }) => {
        setCloudError(error ? explainCloudError(error) : null);
        if (!error) setSavedAt(Date.now());
      });
    }, 800);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [ready, state, cloudUserId]);

  const patch = useCallback((updater: (prev: AppState) => AppState) => {
    setState(updater);
  }, []);

  const addTransaction = useCallback((tx: Omit<Transaction, "id">) => {
    setState((prev) => {
      const ref = resolveParticularRef(
        prev.particulars,
        tx.particularId,
        tx.particular,
      );
      return {
        ...prev,
        transactions: [
          ...prev.transactions,
          { ...tx, ...ref, id: uid() },
        ],
      };
    });
  }, []);

  const updateTransaction = useCallback((tx: Transaction) => {
    setState((prev) => {
      const ref = resolveParticularRef(
        prev.particulars,
        tx.particularId,
        tx.particular,
      );
      return {
        ...prev,
        transactions: prev.transactions.map((t) =>
          t.id === tx.id ? { ...tx, ...ref } : t,
        ),
      };
    });
  }, []);

  const removeTransaction = useCallback((id: string) => {
    setState((prev) => {
      const tx = prev.transactions.find((t) => t.id === id);
      let accounts = prev.accounts;
      if (tx?.installmentId && tx.toId) {
        accounts = prev.accounts.map((a) =>
          a.id !== tx.toId
            ? a
            : {
                ...a,
                schedule: a.schedule?.map((r) =>
                  r.id === tx.installmentId
                    ? { ...r, status: "unpaid" as const, balanceAfter: null }
                    : r,
                ),
              },
        );
      }
      return {
        ...prev,
        accounts,
        transactions: prev.transactions.filter((t) => t.id !== id),
      };
    });
  }, []);

  const upsertAccount = useCallback((account: Account) => {
    setState((prev) => {
      const exists = prev.accounts.some((a) => a.id === account.id);
      return {
        ...prev,
        accounts: exists
          ? prev.accounts.map((a) => (a.id === account.id ? account : a))
          : [...prev.accounts, account],
      };
    });
  }, []);

  const archiveAccount = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      accounts: prev.accounts.map((a) =>
        a.id === id ? { ...a, archived: true } : a,
      ),
    }));
  }, []);

  const upsertCategory = useCallback((category: Category) => {
    setState((prev) => {
      const exists = prev.categories.some((c) => c.id === category.id);
      return {
        ...prev,
        categories: exists
          ? prev.categories.map((c) => (c.id === category.id ? category : c))
          : [...prev.categories, category],
      };
    });
  }, []);

  const removeCategory = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      categories: prev.categories.filter((c) => c.id !== id),
    }));
  }, []);

  const moveCategory = useCallback((id: string, direction: -1 | 1) => {
    setState((prev) => {
      const index = prev.categories.findIndex((c) => c.id === id);
      if (index < 0) return prev;
      const kind = prev.categories[index].kind ?? "expense";
      const sameKindIndexes = prev.categories
        .map((c, i) => ((c.kind ?? "expense") === kind ? i : -1))
        .filter((i) => i >= 0);
      const pos = sameKindIndexes.indexOf(index);
      const swapWith = sameKindIndexes[pos + direction];
      if (pos < 0 || swapWith == null) return prev;
      const categories = [...prev.categories];
      const tmp = categories[index];
      categories[index] = categories[swapWith];
      categories[swapWith] = tmp;
      return { ...prev, categories };
    });
  }, []);

  const upsertParticular = useCallback((particular: Particular) => {
    setState((prev) => {
      const exists = prev.particulars.some((p) => p.id === particular.id);
      const old = prev.particulars.find((p) => p.id === particular.id);
      const particulars = exists
        ? prev.particulars.map((p) =>
            p.id === particular.id ? particular : p,
          )
        : [...prev.particulars, particular];

      // Cascade rename to denormalized names on lines + transactions
      const renamed =
        exists && old && old.name !== particular.name
          ? {
              budgetLines: prev.budgetLines.map((l) =>
                l.particularId === particular.id ||
                l.particular.toLowerCase() === old.name.toLowerCase()
                  ? {
                      ...l,
                      particularId: particular.id,
                      particular: particular.name,
                    }
                  : l,
              ),
              transactions: prev.transactions.map((t) =>
                t.particularId === particular.id ||
                t.particular.toLowerCase() === old.name.toLowerCase()
                  ? {
                      ...t,
                      particularId: particular.id,
                      particular: particular.name,
                    }
                  : t,
              ),
            }
          : {
              budgetLines: prev.budgetLines,
              transactions: prev.transactions,
            };

      return { ...prev, particulars, ...renamed };
    });
  }, []);

  const removeParticular = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      particulars: prev.particulars.filter((p) => p.id !== id),
      budgetLines: prev.budgetLines.map((l) =>
        l.particularId === id ? { ...l, particularId: null } : l,
      ),
      transactions: prev.transactions.map((t) =>
        t.particularId === id ? { ...t, particularId: null } : t,
      ),
    }));
  }, []);

  const upsertBudgetPeriod = useCallback((period: BudgetPeriod) => {
    setState((prev) => {
      const exists = prev.budgetPeriods.some((p) => p.id === period.id);
      return {
        ...prev,
        budgetPeriods: exists
          ? prev.budgetPeriods.map((p) => (p.id === period.id ? period : p))
          : [...prev.budgetPeriods, period],
      };
    });
  }, []);

  const removeBudgetPeriod = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      budgetPeriods: prev.budgetPeriods.filter((p) => p.id !== id),
      budgetLines: prev.budgetLines.filter((l) => l.periodId !== id),
    }));
  }, []);

  const upsertBudgetLine = useCallback((line: BudgetLine) => {
    setState((prev) => {
      const ref = resolveParticularRef(
        prev.particulars,
        line.particularId,
        line.particular,
      );
      const next = { ...line, ...ref };
      const exists = prev.budgetLines.some((l) => l.id === next.id);
      return {
        ...prev,
        budgetLines: exists
          ? prev.budgetLines.map((l) => (l.id === next.id ? next : l))
          : [...prev.budgetLines, next],
      };
    });
  }, []);

  const removeBudgetLine = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      budgetLines: prev.budgetLines.filter((l) => l.id !== id),
    }));
  }, []);

  const addBudgetLine = useCallback((periodId: string) => {
    setState((prev) => {
      const maxOrder = prev.budgetLines
        .filter((l) => l.periodId === periodId)
        .reduce((m, l) => Math.max(m, l.order), -1);
      return {
        ...prev,
        budgetLines: [
          ...prev.budgetLines,
          emptyBudgetLine(periodId, maxOrder + 1),
        ],
      };
    });
  }, []);

  const setCurrentBalance = useCallback((id: string, amount: number) => {
    setState((prev) => {
      const account = prev.accounts.find((a) => a.id === id);
      if (!account) return prev;
      const current = accountBalances(prev)[id] ?? 0;
      const target = Math.round(amount * 100) / 100;
      const delta = Math.round((target - current) * 100) / 100;
      if (Math.abs(delta) < 0.005) return prev;

      const abs = Math.abs(delta);
      let fromId: string | null = null;
      let toId: string | null = null;
      if (account.kind === "liability") {
        if (delta < 0) toId = id; // owe less
        else fromId = id; // owe more
      } else if (delta < 0) {
        fromId = id; // cash/savings down
      } else {
        toId = id; // cash/savings up
      }

      const tx: Transaction = {
        id: uid(),
        date: todayIso(),
        kind: "adjustment",
        amount: abs,
        category: "adjustment",
        particular: "Balance adjustment",
        particularId: null,
        fromId,
        toId,
        note: "Bank reconciliation",
      };
      return { ...prev, transactions: [...prev.transactions, tx] };
    });
  }, []);

  const payInstallment = useCallback(
    (
      accountId: string,
      installmentId: string,
      fromId: string | null,
      meta?: {
        particular?: string;
        particularId?: string | null;
        category?: string;
      },
    ) => {
      setState((prev) => {
        const account = prev.accounts.find((a) => a.id === accountId);
        if (!account?.schedule) return prev;
        const row = account.schedule.find((r) => r.id === installmentId);
        if (!row || row.status === "paid") return prev;
        const before = scheduleRemaining(
          account.openingBalance,
          account.schedule,
        );
        const after = Math.max(0, Math.round((before - row.amount) * 100) / 100);
        const accounts = prev.accounts.map((a) =>
          a.id !== accountId
            ? a
            : {
                ...a,
                schedule: a.schedule?.map((r) =>
                  r.id === installmentId
                    ? { ...r, status: "paid" as const, balanceAfter: after }
                    : r,
                ),
              },
        );
        const ref = resolveParticularRef(
          prev.particulars,
          meta?.particularId,
          meta?.particular ?? "",
        );
        const tx: Transaction = {
          id: uid(),
          date: row.due,
          kind: "payment",
          amount: row.amount,
          category: meta?.category || "debt",
          particular: ref.particular,
          particularId: ref.particularId,
          fromId,
          toId: accountId,
          note: `${account.name} · ${row.due}`,
          installmentId,
        };
        return { ...prev, accounts, transactions: [...prev.transactions, tx] };
      });
    },
    [],
  );

  const unpayInstallment = useCallback(
    (accountId: string, installmentId: string) => {
      setState((prev) => ({
        ...prev,
        accounts: prev.accounts.map((a) =>
          a.id !== accountId
            ? a
            : {
                ...a,
                schedule: a.schedule?.map((r) =>
                  r.id === installmentId
                    ? { ...r, status: "unpaid" as const, balanceAfter: null }
                    : r,
                ),
              },
        ),
        transactions: prev.transactions.filter(
          (t) => t.installmentId !== installmentId,
        ),
      }));
    },
    [],
  );

  const replaceState = useCallback((next: AppState) => {
    setState(next);
  }, []);

  const resetAll = useCallback(() => {
    if (
      !window.confirm(
        "Reset to common starter books? Categories, particulars, and Cash will be restored. Ledger & budget periods will clear.",
      )
    ) {
      return;
    }
    setState(presetState());
  }, []);

  const balances = useMemo(() => accountBalances(state), [state]);

  const value = useMemo(
    () => ({
      ready,
      syncMode: (cloudUserId ? "cloud" : "local") as "local" | "cloud",
      cloudError,
      savedAt,
      state,
      month,
      setMonth,
      balances,
      addTransaction,
      updateTransaction,
      removeTransaction,
      upsertAccount,
      archiveAccount,
      upsertCategory,
      removeCategory,
      moveCategory,
      upsertParticular,
      removeParticular,
      upsertBudgetPeriod,
      removeBudgetPeriod,
      upsertBudgetLine,
      removeBudgetLine,
      addBudgetLine,
      setCurrentBalance,
      payInstallment,
      unpayInstallment,
      updateState: patch,
      replaceState,
      resetAll,
    }),
    [
      ready,
      cloudUserId,
      cloudError,
      savedAt,
      state,
      month,
      balances,
      addTransaction,
      updateTransaction,
      removeTransaction,
      upsertAccount,
      archiveAccount,
      upsertCategory,
      removeCategory,
      moveCategory,
      upsertParticular,
      removeParticular,
      upsertBudgetPeriod,
      removeBudgetPeriod,
      upsertBudgetLine,
      removeBudgetLine,
      addBudgetLine,
      setCurrentBalance,
      payInstallment,
      unpayInstallment,
      patch,
      replaceState,
      resetAll,
    ],
  );

  return (
    <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>
  );
}

export function useFinance() {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error("useFinance must be used inside FinanceProvider");
  return ctx;
}
