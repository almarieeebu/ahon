"use client";

import { FormEvent, useState } from "react";
import { Modal } from "@/components/Modal";
import { useFinance } from "@/context/FinanceContext";
import { emptyAccount } from "@/lib/defaults";
import { phpSmart } from "@/lib/money";
import { byKind } from "@/lib/selectors";

export function AccountsPanel() {
  const { state, balances, upsertAccount, archiveAccount, setCurrentBalance } =
    useFinance();
  const banks = byKind(state, "cash");
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [opening, setOpening] = useState("0");

  function closeAdd() {
    setAddOpen(false);
    setName("");
    setOpening("0");
  }

  function addBank(event: FormEvent) {
    event.preventDefault();
    const n = name.trim();
    if (!n) return;
    const account = emptyAccount("cash", n);
    account.openingBalance = Number(opening) || 0;
    upsertAccount(account);
    closeAdd();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">
            Banks, wallets, cash
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Add every account you actually use — BDO, BPI, GCash, Maya, cash on
            hand. Rename, set the current balance, or archive one you no longer
            need. Opening balance is the start figure; reconcile posts an
            adjustment so history stays honest.
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

      {banks.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-paper-line px-4 py-6 text-center text-sm text-ink-muted">
          No cash accounts yet. Add as many banks or wallets as you have.
        </p>
      ) : (
        <ul className="space-y-3">
          {banks.map((a) => (
            <li
              key={a.id}
              className="rounded-2xl border border-paper-line bg-white/70 p-4"
            >
              <div className="flex items-baseline justify-between gap-3">
                <input
                  defaultValue={a.name}
                  key={`${a.id}-name`}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next && next !== a.name) {
                      upsertAccount({ ...a, name: next });
                    }
                  }}
                  className="w-full bg-transparent font-medium outline-none"
                />
                <span className="shrink-0 font-display text-lg font-semibold">
                  {phpSmart(balances[a.id] ?? 0)}
                </span>
              </div>
              <label className="mt-3 block text-xs text-ink-muted">
                Opening balance
                <input
                  type="number"
                  min={0}
                  defaultValue={a.openingBalance}
                  key={`${a.id}-open-${a.openingBalance}`}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n !== a.openingBalance) {
                      upsertAccount({ ...a, openingBalance: n });
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-paper-line px-2 py-1.5 text-sm text-ink"
                />
              </label>
              <label className="mt-2 block text-xs text-ink-muted">
                Reconcile to bank balance
                <input
                  type="number"
                  min={0}
                  defaultValue={Math.round((balances[a.id] ?? 0) * 100) / 100}
                  key={`${a.id}-${Math.round((balances[a.id] ?? 0) * 100)}`}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    const current = balances[a.id] ?? 0;
                    if (Number.isFinite(n) && n !== current) {
                      setCurrentBalance(a.id, n);
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-paper-line px-2 py-1.5 text-sm text-ink"
                />
              </label>
              <p className="mt-1 text-[11px] text-ink-muted">
                Reconciliation posts a Balance adjustment in Ledger — opening
                balance stays unchanged.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Hide ${a.name}?`)) archiveAccount(a.id);
                }}
                className="mt-3 text-[11px] font-semibold text-ink-muted hover:text-danger"
              >
                Archive
              </button>
            </li>
          ))}
        </ul>
      )}

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
            Opening / current balance
            <input
              type="number"
              min={0}
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              className="mt-1 w-full rounded-xl border border-paper-line px-3 py-2 text-sm text-ink"
            />
          </label>
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
