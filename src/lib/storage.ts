import { presetState } from "./defaults";
import { migrateState } from "./migrate";
import type { AppState } from "./types";

/** Bumped so old seeded localStorage (ahon.v5) is not reused. */
export const STORAGE_KEY = "ahon.v6";

function isEmptyBooks(state: AppState): boolean {
  return (
    state.accounts.length === 0 &&
    state.categories.length === 0 &&
    state.particulars.length === 0 &&
    state.budgetPeriods.length === 0 &&
    state.transactions.length === 0
  );
}

export function loadState(): AppState {
  if (typeof window === "undefined") return presetState();
  try {
    const fresh = window.localStorage.getItem(STORAGE_KEY);
    if (fresh) {
      const migrated = migrateState(JSON.parse(fresh));
      if (!migrated || isEmptyBooks(migrated)) return presetState();
      return migrated;
    }
    return presetState();
  } catch {
    return presetState();
  }
}

export function saveState(state: AppState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function exportState(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

export function parseImport(text: string): AppState | null {
  try {
    return migrateState(JSON.parse(text));
  } catch {
    return null;
  }
}
