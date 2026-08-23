import { emptyState } from "./defaults";
import { migrateState } from "./migrate";
import type { AppState } from "./types";

/** Bumped so old seeded localStorage (ahon.v5) is not reused. */
export const STORAGE_KEY = "ahon.v6";

export function loadState(): AppState {
  if (typeof window === "undefined") return emptyState();
  try {
    const fresh = window.localStorage.getItem(STORAGE_KEY);
    if (fresh) {
      return migrateState(JSON.parse(fresh)) ?? emptyState();
    }
    return emptyState();
  } catch {
    return emptyState();
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
