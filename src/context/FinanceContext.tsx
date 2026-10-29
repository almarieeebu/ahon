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
import {
  createBudget,
  emptyBudgetLine,
  setLegacyReview,
  type NewBudgetInput,
} from "@/lib/periodBudget";
import { resolveParticularRef } from "@/lib/refs";
import {
  applySimpleLog,
  applySimpleUpdate,
  applyUpdateTransaction,
  copyBudgetMonth,
  payBudgetLine,
  type SimpleLogDraft,
} from "@/lib/simpleLog";
import {
  applyAddExistingLoan,
  applyNewBorrowing,
  type ExistingLoanInput,
  type NewBorrowingInput,
} from "@/lib/loans";
import {
  applyLoanPayment,
  applyRemoveTransaction,
  installmentShortfall,
} from "@/lib/payments";
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
  LegacyReview,
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
  logSimple: (draft: SimpleLogDraft) => void;
  updateSimple: (id: string, draft: SimpleLogDraft) => void;
  payPlanLine: (lineId: string, liabilityId?: string | null) => void;
  /** Copy budget targets only; does nothing if the month has a budget. */
  copyMonthPlan: (fromKey: string, toKey: string) => void;
  /** New budget (validated; idempotent by input.id). */
  createMonthBudget: (input: NewBudgetInput) => void;
  /** Keep an earlier manual amount as a note, hide it, or undo (null). */
  reviewLegacyEntry: (lineId: string, review: LegacyReview | null) => void;
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
  /** Existing debt: liability only, cash unchanged. Pass a fixed id. */
  addExistingLoan: (input: ExistingLoanInput) => void;
  /** Loan received now: liability and receiving wallet both rise (not income). */
  addNewBorrowing: (input: NewBorrowingInput) => void;
  /** Payment toward one explicit loan (partial payments allowed). */
  recordLoanPayment: (input: Parameters<typeof applyLoanPayment>[1]) => void;
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

  const logSimple = useCallback((draft: SimpleLogDraft) => {
    setState((prev) => applySimpleLog(prev, draft) ?? prev);
  }, []);

  const updateSimple = useCallback((id: string, draft: SimpleLogDraft) => {
    setState((prev) => applySimpleUpdate(prev, id, draft) ?? prev);
  }, []);

  const payPlanLine = useCallback(
    (lineId: string, liabilityId?: string | null) => {
      setState(
        (prev) => payBudgetLine(prev, lineId, todayIso(), liabilityId) ?? prev,
      );
    },
    [],
  );

  const copyMonthPlan = useCallback((fromKey: string, toKey: string) => {
    setState((prev) => copyBudgetMonth(prev, fromKey, toKey) ?? prev);
  }, []);

  const createMonthBudget = useCallback((input: NewBudgetInput) => {
    setState((prev) => {
      const result = createBudget(prev, input);
      return result.ok ? result.state : prev;
    });
  }, []);

  const reviewLegacyEntry = useCallback(
    (lineId: string, review: LegacyReview | null) => {
      setState((prev) => setLegacyReview(prev, lineId, review));
    },
    [],
  );

  const updateTransaction = useCallback((tx: Transaction) => {
    setState((prev) => applyUpdateTransaction(prev, tx) ?? prev);
  }, []);

  const removeTransaction = useCallback((id: string) => {
    // Reverses wallet/loan balances (derived), installment and bill status.
    setState((prev) => applyRemoveTransaction(prev, id));
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
      // Stating the current balance makes an incomplete wallet complete.
      const accounts =
        account.balanceKnown === false
          ? prev.accounts.map((a) => (a.id === id ? { ...a, balanceKnown: true } : a))
          : prev.accounts;
      if (Math.abs(delta) < 0.005) {
        return accounts === prev.accounts ? prev : { ...prev, accounts };
      }

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
      return { ...prev, accounts, transactions: [...prev.transactions, tx] };
    });
  }, []);

  const addExistingLoan = useCallback((input: ExistingLoanInput) => {
    setState((prev) => {
      const result = applyAddExistingLoan(prev, input);
      return result.ok ? result.state : prev;
    });
  }, []);

  const addNewBorrowing = useCallback((input: NewBorrowingInput) => {
    setState((prev) => {
      const result = applyNewBorrowing(prev, input);
      return result.ok ? result.state : prev;
    });
  }, []);

  const recordLoanPayment = useCallback(
    (input: Parameters<typeof applyLoanPayment>[1]) => {
      setState((prev) => applyLoanPayment(prev, input) ?? prev);
    },
    [],
  );

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
        // Pay only what is still due on this row (after partial payments).
        const due = installmentShortfall(row);
        if (due <= 0) return prev;
        const before = scheduleRemaining(
          account.openingBalance,
          account.schedule,
        );
        const after = Math.max(0, Math.round((before - due) * 100) / 100);
        const accounts = prev.accounts.map((a) =>
          a.id !== accountId
            ? a
            : {
                ...a,
                schedule: a.schedule?.map((r) =>
                  r.id === installmentId
                    ? {
                        ...r,
                        status: "paid" as const,
                        balanceAfter: after,
                        paidAmount: Math.round(((r.paidAmount ?? 0) + due) * 100) / 100,
                      }
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
          amount: due,
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
                    ? {
                        ...r,
                        status: "unpaid" as const,
                        balanceAfter: null,
                        paidAmount: undefined,
                      }
                    : r,
                ),
              },
        ),
        // Undo removes every payment linked to this installment.
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
        "Reset to common starter books? Categories, names, and Cash will be restored. Log and plans will clear.",
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
      logSimple,
      updateSimple,
      payPlanLine,
      copyMonthPlan,
      createMonthBudget,
      reviewLegacyEntry,
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
      addExistingLoan,
      addNewBorrowing,
      recordLoanPayment,
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
      logSimple,
      updateSimple,
      payPlanLine,
      copyMonthPlan,
      createMonthBudget,
      reviewLegacyEntry,
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
      addExistingLoan,
      addNewBorrowing,
      recordLoanPayment,
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
