"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AccountsPanel } from "@/components/AccountsPanel";
import { BudgetPanel } from "@/components/BudgetPanel";
import { Modal } from "@/components/Modal";
import { useAuth } from "@/context/AuthContext";
import { useFinance } from "@/context/FinanceContext";
import { emptyParticular } from "@/lib/defaults";
import { exportState, parseImport } from "@/lib/storage";

type MoreTab = "accounts" | "particulars" | "budget" | "profile";

export type MoreFocusTab = MoreTab;

const MORE_TABS: { id: MoreTab; label: string }[] = [
  { id: "budget", label: "Budget setup" },
  { id: "particulars", label: "Particulars" },
  { id: "accounts", label: "Accounts" },
  { id: "profile", label: "Profile" },
];

export function MoreView({
  focusTab,
  onOpenManual,
  onReplayTour,
}: {
  focusTab?: MoreFocusTab | null;
  onOpenManual?: () => void;
  onReplayTour?: () => void;
}) {
  const {
    state,
    updateState,
    replaceState,
    resetAll,
    upsertParticular,
    removeParticular,
    syncMode,
    cloudError,
    savedAt,
  } = useFinance();
  const { user, signOut, cloudEnabled, requestSignIn } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<MoreTab>(focusTab ?? "budget");
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(
    state.categories[0]?.id ?? "",
  );

  useEffect(() => {
    if (focusTab) setTab(focusTab);
  }, [focusTab]);

  function downloadBackup() {
    const blob = new Blob([exportState(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ahon-${state.settings.openedOn}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onImport(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    const next = parseImport(text);
    if (!next) {
      window.alert("That file is not a valid Ahon backup.");
      return;
    }
    replaceState(next);
  }

  function addParticular(event: FormEvent) {
    event.preventDefault();
    const n = name.trim();
    if (!n) return;
    const cat =
      state.categories.find((c) => c.id === categoryId)?.id ??
      state.categories[0]?.id ??
      null;
    upsertParticular(emptyParticular(n, cat));
    setName("");
    setAddOpen(false);
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {MORE_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              tab === item.id
                ? "bg-ink text-paper"
                : "border border-paper-line bg-white text-ink-muted"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "accounts" ? <AccountsPanel /> : null}

      {tab === "particulars" ? (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">Particulars</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Budget & Ledger line names. Category comes from Budget setup.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="shrink-0 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper"
            >
              Add
            </button>
          </div>

          {state.particulars.length === 0 ? (
            <p className="sheet-empty">No particulars yet.</p>
          ) : (
            <ul className="space-y-2">
              {state.particulars.map((p) => {
                const cat = state.categories.find((c) => c.id === p.categoryId);
                return (
                  <li
                    key={p.id}
                    className="flex flex-col gap-2 rounded-xl border border-paper-line bg-white/70 px-3 py-3 sm:flex-row sm:items-center"
                  >
                    <input
                      defaultValue={p.name}
                      key={`${p.id}-name`}
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (next && next !== p.name) {
                          upsertParticular({ ...p, name: next });
                        }
                      }}
                      className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
                    />
                    <select
                      value={p.categoryId ?? ""}
                      onChange={(e) =>
                        upsertParticular({
                          ...p,
                          categoryId: e.target.value || null,
                        })
                      }
                      className="w-full rounded-lg border border-paper-line bg-white px-2 py-1.5 text-xs sm:w-auto sm:min-w-[10rem]"
                    >
                      <option value="">— Category —</option>
                      {state.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.kind === "income" ? " (in)" : " (out)"}
                        </option>
                      ))}
                    </select>
                    <span className="text-[11px] text-ink-muted sm:hidden">
                      {cat ? `${cat.name} · ${cat.tone}` : "No category"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Remove ${p.name}?`)) {
                          removeParticular(p.id);
                        }
                      }}
                      className="self-start text-[11px] font-semibold text-ink-muted hover:text-danger sm:self-center"
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <Modal
            open={addOpen}
            title="Add particular"
            onClose={() => setAddOpen(false)}
          >
            <form onSubmit={addParticular} className="space-y-4">
              <label className="block text-xs text-ink-muted">
                Name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. WATER, LOAD, MEDICINE"
                  className="mt-1 w-full rounded-xl border border-paper-line px-3 py-2 text-sm text-ink"
                  required
                />
              </label>
              <label className="block text-xs text-ink-muted">
                Category (from Budget setup)
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-paper-line bg-white px-3 py-2 text-sm text-ink"
                  required={state.categories.length > 0}
                >
                  {state.categories.length === 0 ? (
                    <option value="">Add categories in Budget setup first</option>
                  ) : (
                    state.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.kind}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <button
                type="submit"
                className="w-full rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-paper"
              >
                Save particular
              </button>
            </form>
          </Modal>
        </div>
      ) : null}

      {tab === "budget" ? (
        <div className="space-y-6">
          <div>
            <h2 className="font-display text-lg font-semibold">Budget setup</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Income & expense categories for Ledger and Particulars. Period
              planning lives on the Budget tab.
            </p>
          </div>
          <label className="block text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Monthly take-home
            </span>
            <input
              type="number"
              min={0}
              value={state.settings.monthlyIncome}
              onChange={(e) => {
                const n = Number(e.target.value);
                updateState((s) => ({
                  ...s,
                  settings: {
                    ...s.settings,
                    monthlyIncome: Number.isFinite(n) ? n : 0,
                  },
                }));
              }}
              className="mt-1 w-full rounded-xl border border-paper-line bg-white px-3 py-2"
            />
          </label>
          <BudgetPanel />
        </div>
      ) : null}

      {tab === "profile" ? (
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold">Profile</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Sign-in and where your books are saved.
            </p>
          </div>

          <div className="rounded-2xl border border-paper-line bg-white/70 px-4 py-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Status
            </p>
            <p className="mt-1 font-semibold">
              {syncMode === "cloud"
                ? "Synced to Supabase"
                : cloudEnabled
                  ? "This device only"
                  : "Local only (no Supabase keys)"}
            </p>
            {user?.email ? (
              <p className="mt-2 text-ink-muted">{user.email}</p>
            ) : (
              <p className="mt-2 text-ink-muted">Not signed in</p>
            )}
            {savedAt ? (
              <p className="mt-2 text-xs text-ink-muted">
                Last save: {new Date(savedAt).toLocaleString()}
              </p>
            ) : null}
            {cloudError ? (
              <p className="mt-3 text-danger" role="alert">
                {cloudError}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {user ? (
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold"
                >
                  Sign out
                </button>
              ) : cloudEnabled ? (
                <button
                  type="button"
                  onClick={requestSignIn}
                  className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper"
                >
                  Sign in to sync
                </button>
              ) : null}
              {onOpenManual ? (
                <button
                  type="button"
                  onClick={onOpenManual}
                  className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper"
                >
                  Open manual
                </button>
              ) : null}
              {onReplayTour ? (
                <button
                  type="button"
                  onClick={onReplayTour}
                  className="rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold"
                >
                  Replay tour
                </button>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-paper-line bg-white/60 px-4 py-3 text-sm text-ink-muted">
            Share Ahon with family: send{" "}
            <span className="font-semibold text-ink">
              https://ahon-kohl.vercel.app
            </span>{" "}
            and ask them to Sign up, then follow the welcome tour. Help tip is
            always on the top-right of each page.
          </div>

          <div className="flex flex-wrap gap-2 border-t border-paper-line pt-4">
            <button
              type="button"
              onClick={downloadBackup}
              className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper"
            >
              Export backup
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold"
            >
              Import backup
            </button>
            <button
              type="button"
              onClick={resetAll}
              className="rounded-full border border-danger/30 px-4 py-2 text-sm font-semibold text-danger"
            >
              Clear all books / reset presets
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => onImport(e.target.files?.[0])}
            />
          </div>
        </div>
      ) : null}

      {tab !== "profile" ? (
        <div className="flex flex-wrap gap-2 border-t border-paper-line pt-6">
          <button
            type="button"
            onClick={downloadBackup}
            className="rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold"
          >
            Export backup
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold"
          >
            Import backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => onImport(e.target.files?.[0])}
          />
        </div>
      ) : null}
    </section>
  );
}
