"use client";

import { FormEvent, useState } from "react";
import { Modal } from "@/components/Modal";
import { SidePanel, panelDanger } from "@/components/SidePanel";
import { useFinance } from "@/context/FinanceContext";
import { phpSmart } from "@/lib/money";
import { createWallet } from "@/lib/payments";
import { byKind, isBalanceKnown } from "@/lib/selectors";

export function AccountsPanel() {
  const { state, balances, upsertAccount } = useFinance();
  const banks = byKind(state, "cash");
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [opening, setOpening] = useState("");
  const [addError, setAddError] = useState("");
  const [walletId, setWalletId] = useState<string | null>(null);

  function closeAdd() {
    setAddOpen(false);
    setName("");
    setOpening("");
    setAddError("");
  }

  function addBank(event: FormEvent) {
    event.preventDefault();
    const result = createWallet(state, name, opening);
    if ("error" in result) {
      setAddError(result.error);
      return;
    }
    const account = result.state.accounts.find((a) => a.id === result.accountId);
    if (account) upsertAccount(account);
    closeAdd();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">
            Banks, wallets, cash
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Add every account you actually use — BDO, BPI, GCash, Maya, cash on
            hand. Tap one to rename it, fix its balance, or archive it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="min-h-11 shrink-0 rounded-full bg-ink px-4 text-sm font-semibold text-paper hover:bg-ink/90"
        >
          Add wallet
        </button>
      </div>

      {banks.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-paper-line px-4 py-6 text-center text-sm text-ink-muted">
          No cash accounts yet. Add as many banks or wallets as you have.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {banks.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => setWalletId(a.id)}
                data-testid="wallet-row"
                className={`flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl border bg-white/80 px-4 py-3 text-left hover:border-ink/25 ${
                  walletId === a.id ? "border-gold-deep/50 ring-2 ring-gold-deep/30" : "border-paper-line"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{a.name}</span>
                  <span className="block text-xs text-ink-muted">
                    {isBalanceKnown(a) ? "Tap to edit or reconcile" : "Balance incomplete"}
                  </span>
                </span>
                <span className="shrink-0 font-display text-lg font-semibold">
                  {phpSmart(balances[a.id] ?? 0)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <WalletPanel walletId={walletId} onClose={() => setWalletId(null)} />

      <Modal
        open={addOpen}
        title="Add a bank or wallet"
        onClose={closeAdd}
      >
        <form onSubmit={addBank} className="space-y-4">
          <label className="block text-xs text-ink-muted">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. BDO, BPI, GCash, Maya, cash on hand"
              className="mt-1 w-full rounded-xl border border-paper-line px-3 py-2 text-sm text-ink"
              required
            />
          </label>
          <label className="block text-xs text-ink-muted">
            Opening / current balance (optional)
            <input
              inputMode="decimal"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              placeholder="Leave blank if you are not sure"
              className="mt-1 w-full rounded-xl border border-paper-line px-3 py-2 text-sm text-ink"
            />
          </label>
          {addError ? (
            <p role="alert" className="text-sm font-semibold text-danger">
              {addError}
            </p>
          ) : null}
          <button
            type="submit"
            className="w-full rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-paper"
          >
            Add account
          </button>
        </form>
      </Modal>
    </div>
  );
}

const walletInput =
  "mt-1 min-h-11 w-full rounded-lg border border-paper-line bg-white px-2.5 text-sm text-ink";

/** Details for one bank, wallet or cash pocket, in a side panel. */
export function WalletPanel({
  walletId,
  onClose,
}: {
  walletId: string | null;
  onClose: () => void;
}) {
  const { state, balances, upsertAccount, archiveAccount, setCurrentBalance } = useFinance();
  const a = walletId ? byKind(state, "cash").find((w) => w.id === walletId) : undefined;
  const balance = a ? balances[a.id] ?? 0 : 0;
  return (
    <SidePanel
      open={Boolean(a)}
      eyebrow="Wallet"
      title={a?.name ?? ""}
      onClose={onClose}
      testId="wallet-panel"
      footer={
        a ? (
          <button
            type="button"
            className={panelDanger}
            onClick={() => {
              if (window.confirm(`Hide ${a.name}?`)) {
                archiveAccount(a.id);
                onClose();
              }
            }}
          >
            Archive
          </button>
        ) : null
      }
    >
      {a ? (
        <div className="space-y-4">
          <div>
            <p className="text-xs text-ink-muted">Balance now</p>
            <p className="font-display text-3xl font-semibold">{phpSmart(balance)}</p>
            {!isBalanceKnown(a) ? (
              <p className="mt-1 text-sm font-semibold text-gold-deep">
                Balance incomplete: enter an opening balance below.
              </p>
            ) : null}
          </div>
          <label className="block text-xs text-ink-muted">
            Name
            <input
              defaultValue={a.name}
              key={`${a.id}-name-${a.name}`}
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (next && next !== a.name) upsertAccount({ ...a, name: next });
              }}
              className={walletInput}
            />
          </label>
          <label className="block text-xs text-ink-muted">
            Opening balance
            <input
              type="number"
              min={0}
              defaultValue={a.openingBalance}
              key={`${a.id}-open-${a.openingBalance}`}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (e.target.value.trim() === "" || !Number.isFinite(n)) return;
                if (n !== a.openingBalance || !isBalanceKnown(a)) {
                  upsertAccount({ ...a, openingBalance: n, balanceKnown: true });
                }
              }}
              className={walletInput}
            />
            <span className="mt-1 block text-[11px]">The start figure, before any activity.</span>
          </label>
          <label className="block text-xs text-ink-muted">
            Reconcile to bank balance
            <input
              type="number"
              min={0}
              defaultValue={Math.round(balance * 100) / 100}
              key={`${a.id}-${Math.round(balance * 100)}`}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n !== balance) setCurrentBalance(a.id, n);
              }}
              className={walletInput}
            />
            <span className="mt-1 block text-[11px]">
              Posts a Balance adjustment in Activity — opening balance stays unchanged.
            </span>
          </label>
        </div>
      ) : null}
    </SidePanel>
  );
}
