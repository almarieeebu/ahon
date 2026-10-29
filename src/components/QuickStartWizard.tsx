"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useFinance } from "@/context/FinanceContext";
import { emptyAccount } from "@/lib/defaults";
import { markTourSeen } from "@/lib/help";
import { monthKey, phpSmart, todayIso, uid } from "@/lib/money";
import { nextPayday } from "@/lib/cashPlan";
import type { Account, BudgetLine, BudgetPeriod, LiabilityType } from "@/lib/types";

type BillField = {
  categoryId: string;
  particularId: string;
  label: string;
};

const COMMON_BILLS: BillField[] = [
  { categoryId: "cat-rent", particularId: "p-rent", label: "Rent / housing" },
  { categoryId: "cat-electric", particularId: "p-electric", label: "Electricity" },
  { categoryId: "cat-water", particularId: "p-water", label: "Water" },
  { categoryId: "cat-internet", particularId: "p-internet", label: "Internet" },
  { categoryId: "cat-mobile", particularId: "p-mobile", label: "Mobile / load" },
  { categoryId: "cat-food", particularId: "p-groceries", label: "Groceries" },
  { categoryId: "cat-transport", particularId: "p-transport", label: "Transport" },
  { categoryId: "cat-health", particularId: "p-health", label: "Health / medicine" },
];

const DEBT_TYPES: { id: LiabilityType; label: string; name: string }[] = [
  { id: "credit-card", label: "Credit card", name: "Credit card" },
  { id: "housing", label: "Housing loan", name: "Housing loan" },
  { id: "personal", label: "Personal loan", name: "Personal loan" },
  { id: "other", label: "Other debt", name: "Other debt" },
];

function numberOrZero(value: string): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 100) / 100) : 0;
}

function paydayDays(value: string): number[] {
  return [...new Set(
    value
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= 31),
  )].sort((a, b) => a - b);
}

function monthEnd(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return `${key}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
}

function dueDate(key: string, day: number): string {
  if (!day) return "";
  const last = Number(monthEnd(key).slice(-2));
  return `${key}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

/**
 * A first-run path for people who know their life, not Ahon's data model.
 * It fills the common starting records but leaves every amount optional.
 */
export function QuickStartWizard({
  onFinished,
}: {
  onFinished?: (opts: { offerLog: boolean }) => void;
}) {
  const { state, updateState } = useFinance();
  const [step, setStep] = useState(0);
  const [income, setIncome] = useState(
    state.settings.monthlyIncome ? String(state.settings.monthlyIncome) : "",
  );
  const [paydays, setPaydays] = useState(state.settings.paydayDays.join(", "));
  const [cash, setCash] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [reserve, setReserve] = useState(
    state.settings.emergencyReserve ? String(state.settings.emergencyReserve) : "",
  );
  const [trackDebt, setTrackDebt] = useState(false);
  const [debtType, setDebtType] = useState<LiabilityType>("credit-card");
  const [debtName, setDebtName] = useState("Credit card");
  const [debtBalance, setDebtBalance] = useState("");
  const [debtMinimum, setDebtMinimum] = useState("");
  const [debtDueDay, setDebtDueDay] = useState("15");

  const billTotal = useMemo(
    () => COMMON_BILLS.reduce((sum, bill) => sum + numberOrZero(amounts[bill.categoryId] ?? ""), 0),
    [amounts],
  );

  function setBill(categoryId: string, value: string) {
    setAmounts((current) => ({ ...current, [categoryId]: value }));
  }

  function chooseDebtType(type: LiabilityType) {
    const choice = DEBT_TYPES.find((item) => item.id === type);
    setDebtType(type);
    if (!debtName || DEBT_TYPES.some((item) => item.name === debtName)) {
      setDebtName(choice?.name ?? "Other debt");
    }
  }

  function finish(skip = false) {
    markTourSeen();
    if (skip) {
      onFinished?.({ offerLog: false });
      updateState((current) => ({
        ...current,
        settings: { ...current.settings, setupComplete: true },
      }));
      return;
    }

    onFinished?.({ offerLog: true });

    const takeHome = numberOrZero(income);
    const cashNow = numberOrZero(cash);
    const cashReserve = numberOrZero(reserve);
    const days = paydayDays(paydays);
    const debtOpening = numberOrZero(debtBalance);
    const debtPayment = numberOrZero(debtMinimum);
    const dueDay = Math.min(31, Math.max(0, Math.round(Number(debtDueDay) || 0)));
    const planMonth = monthKey();
    const planHasRows = state.budgetLines.some((line) => line.due.startsWith(planMonth));

    updateState((current) => {
      const cashAccount = current.accounts.find((account) => account.id === "cash-on-hand")
        ?? current.accounts.find((account) => account.kind === "cash");
      const accounts: Account[] = current.accounts.map((account) =>
        account.id === cashAccount?.id
          ? { ...account, openingBalance: cashNow, balanceKnown: cash.trim() !== "" }
          : account,
      );

      if (trackDebt && debtOpening > 0 && !accounts.some((account) => account.name.toLowerCase() === debtName.trim().toLowerCase())) {
        const debt = emptyAccount("liability", debtName.trim() || "Debt");
        debt.liabilityType = debtType;
        debt.mode = "revolving";
        debt.openingBalance = debtOpening;
        debt.plannedPayment = debtPayment;
        debt.dueDay = dueDay;
        accounts.push(debt);
      }

      const categories = current.categories.map((category) => {
        const amount = amounts[category.id];
        if (amount != null) return { ...category, planned: numberOrZero(amount) };
        if (category.id === "cat-debt" && debtPayment > 0) {
          return { ...category, planned: debtPayment, dueDay };
        }
        return category;
      });

      let budgetPeriods = current.budgetPeriods;
      let budgetLines = current.budgetLines;
      if (!planHasRows) {
        const period: BudgetPeriod = {
          id: uid(),
          start: `${planMonth}-01`,
          end: monthEnd(planMonth),
        };
        const plannedLines: BudgetLine[] = [];
        const firstPayday = nextPayday(days, todayIso());
        const paycheck = current.particulars.find((particular) => particular.id === "p-paycheck");
        if (takeHome > 0 && paycheck) {
          plannedLines.push({
            id: uid(),
            periodId: period.id,
            due: firstPayday?.startsWith(planMonth) ? firstPayday : "",
            particular: paycheck.name,
            particularId: paycheck.id,
            income: takeHome,
            expense: 0,
            actual: null,
            status: "",
            order: plannedLines.length,
          });
        }
        for (const bill of COMMON_BILLS) {
          const amount = numberOrZero(amounts[bill.categoryId] ?? "");
          const particular = current.particulars.find((item) => item.id === bill.particularId);
          const category = categories.find((item) => item.id === bill.categoryId);
          if (!amount || !particular || !category) continue;
          plannedLines.push({
            id: uid(),
            periodId: period.id,
            due: dueDate(planMonth, category.dueDay),
            particular: particular.name,
            particularId: particular.id,
            income: 0,
            expense: amount,
            actual: null,
            status: "unpaid",
            order: plannedLines.length,
          });
        }
        const debtParticular = current.particulars.find((particular) => particular.id === "p-debt");
        if (debtPayment > 0 && debtParticular) {
          plannedLines.push({
            id: uid(),
            periodId: period.id,
            due: dueDate(planMonth, dueDay),
            particular: debtParticular.name,
            particularId: debtParticular.id,
            income: 0,
            expense: debtPayment,
            actual: null,
            status: "unpaid",
            order: plannedLines.length,
          });
        }
        if (plannedLines.length > 0) {
          budgetPeriods = [...current.budgetPeriods, period];
          budgetLines = [...current.budgetLines, ...plannedLines];
        }
      }

      return {
        ...current,
        settings: {
          ...current.settings,
          monthlyIncome: takeHome,
          paydayDays: days,
          emergencyReserve: cashReserve,
          setupComplete: true,
        },
        accounts,
        categories,
        budgetPeriods,
        budgetLines,
      };
    });
  }

  const steps = [
    {
      title: "Payday and cash",
      hint: "Use take-home pay: the amount that really reaches you after deductions.",
    },
    {
      title: "Usual monthly needs",
      hint: "Only fill what applies. Blank means skip.",
    },
    {
      title: "Debt, cushion, and your first plan",
      hint: "A small protected amount can stop a surprise from becoming new utang.",
    },
  ];

  return (
    <section className="mx-auto max-w-2xl space-y-5">
      <header className="rounded-2xl border border-paper-line bg-white/80 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gold-deep">
          Quick start · {step + 1} of {steps.length}
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight">
          {step === 0 ? "Set up your money plan in a few minutes" : steps[step].title}
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          {step === 0
            ? "No bookkeeping setup needed. We already added common bill and spending names; answer only the parts that fit your life."
            : steps[step].hint}
        </p>
      </header>

      <div className="rounded-2xl border border-paper-line bg-white/70 p-5">
        {step === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Monthly take-home pay" hint="What you usually receive, not your gross salary.">
              <MoneyInput value={income} onChange={setIncome} placeholder="e.g. 25000" />
            </Field>
            <Field label="Regular payday dates" hint="Days of the month, such as 15, 30. Optional.">
              <input value={paydays} onChange={(event) => setPaydays(event.target.value)} inputMode="numeric" placeholder="e.g. 15, 30" className="setup-input" />
            </Field>
            <Field label="Cash and wallet money now" hint="Add all cash, GCash, Maya, and bank money together for now.">
              <MoneyInput value={cash} onChange={setCash} placeholder="e.g. 5000" />
            </Field>
            <div className="rounded-xl border border-paper-line bg-paper-soft/50 p-4 text-sm text-ink-muted">
              You can add separate banks and wallets later. Start with one accurate total first.
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {COMMON_BILLS.map((bill) => (
              <label key={bill.categoryId} className="rounded-xl border border-paper-line bg-white p-3 text-sm">
                <span className="font-medium text-ink">{bill.label}</span>
                <input
                  value={amounts[bill.categoryId] ?? ""}
                  onChange={(event) => setBill(bill.categoryId, event.target.value)}
                  inputMode="decimal"
                  placeholder="Monthly amount (optional)"
                  className="setup-input mt-2"
                />
              </label>
            ))}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            <Field label="Cash reserve to keep" hint="Leave this untouched for surprises. Start with any amount that feels realistic.">
              <MoneyInput value={reserve} onChange={setReserve} placeholder="e.g. 1000" />
            </Field>
            <label className="flex items-start gap-3 rounded-xl border border-paper-line bg-paper-soft/40 p-4 text-sm">
              <input type="checkbox" checked={trackDebt} onChange={(event) => setTrackDebt(event.target.checked)} className="mt-0.5 size-4" />
              <span><span className="font-semibold text-ink">I have a debt to track</span><br /><span className="text-ink-muted">Credit card, loan, housing payment, or another utang.</span></span>
            </label>
            {trackDebt ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Debt type">
                  <select value={debtType} onChange={(event) => chooseDebtType(event.target.value as LiabilityType)} className="setup-input">
                    {DEBT_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
                  </select>
                </Field>
                <Field label="Name">
                  <input value={debtName} onChange={(event) => setDebtName(event.target.value)} className="setup-input" placeholder="e.g. BPI card" />
                </Field>
                <Field label="Amount still owed">
                  <MoneyInput value={debtBalance} onChange={setDebtBalance} placeholder="e.g. 12000" />
                </Field>
                <Field label="Minimum to pay monthly">
                  <MoneyInput value={debtMinimum} onChange={setDebtMinimum} placeholder="e.g. 1500" />
                </Field>
                <Field label="Due day" hint="Optional; used for reminders.">
                  <input value={debtDueDay} onChange={(event) => setDebtDueDay(event.target.value)} inputMode="numeric" className="setup-input" placeholder="e.g. 15" />
                </Field>
              </div>
            ) : null}
            <dl className="space-y-2 rounded-xl border border-paper-line bg-paper-soft/40 p-4 text-sm">
              <SummaryRow label="Monthly take-home" value={phpSmart(numberOrZero(income))} />
              <SummaryRow label="Usual needs entered" value={phpSmart(billTotal)} />
              <SummaryRow label="Cash reserve" value={phpSmart(numberOrZero(reserve))} />
              {trackDebt && numberOrZero(debtBalance) > 0 ? <SummaryRow label="Debt to add" value={`${debtName || "Debt"} · ${phpSmart(numberOrZero(debtBalance))}`} /> : null}
            </dl>
            <p className="text-sm text-ink-muted">
              After this, Ahon will ask if you want to log something from today. Your plan is a guide; logging is what really happened.
            </p>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-paper-line pt-4">
          <button
            type="button"
            data-testid="quick-start-skip"
            onClick={() => finish(true)}
            className="text-sm font-semibold text-ink-muted underline-offset-2 hover:underline"
          >
            I&apos;ll set this up later
          </button>
          <div className="flex gap-2">
            {step > 0 ? <button type="button" onClick={() => setStep((value) => value - 1)} className="rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold">Back</button> : null}
            {step < steps.length - 1 ? <button type="button" onClick={() => setStep((value) => value + 1)} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper">Continue</button> : <button type="button" onClick={() => finish()} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper">Create my plan</button>}
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block text-sm"><span className="font-semibold text-ink">{label}</span>{children}<span className="mt-1 block text-xs text-ink-muted">{hint}</span></label>;
}

function MoneyInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <input value={value} onChange={(event) => onChange(event.target.value)} inputMode="decimal" placeholder={placeholder} className="setup-input mt-2" />;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-baseline justify-between gap-3"><dt className="text-ink-muted">{label}</dt><dd className="text-right font-semibold text-ink">{value}</dd></div>;
}
