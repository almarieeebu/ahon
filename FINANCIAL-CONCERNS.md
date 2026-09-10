# Financial-management concerns for Ahon

This is the current product brief distilled from the financial-safety work
already present in Ahon. It is a shared checklist, not personal financial
advice. Amounts and due dates in the app remain the user's own records.

## What the app must help answer

1. **Can I cover this month?** Show take-home income, essential spending,
   minimum debt dues, the remaining gap, and a projected cash shortage.
2. **What must be paid first?** Surface overdue debts, housing amortization,
   bills and other debt that are due soon.
3. **Where did the money go?** Keep Cash, Tigum (savings), and Utang
   (liabilities) separate, with a log for actual money movement.
4. **Is a payment real and traceable?** A debt payment should reduce the
   account it came from as well as the debt; an untracked source must be
   explicit.
5. **Am I following the plan?** Keep a period budget apart from actual
   transactions and make the difference visible by month and year.
6. **Can I pay debt faster safely?** Recommend extra debt payment only from
   the month's genuine surplus, after required obligations and any cash
   shortfall are covered. Prioritize high-interest revolving debt.
7. **What if the month does not work?** Enter Survival Mode with a clear
   pay-first order: basics, housing, utilities, transport/health, minimum
   debt, then non-essentials paused.
8. **Can I trust the balances?** Preserve an audit trail for balance
   reconciliation instead of silently rewriting opening balances.
9. **Can I use it privately and simply?** Support device-only books or an
   authenticated cloud sync, with familiar Cebuano/Filipino money terms.

## How Ahon now covers them

| Concern | Current Ahon support |
| --- | --- |
| Monthly affordability | Home’s **This month** sentence, **Monthly survival**, and **Money needed before next payday** |
| Due-date risk | Home’s pay-first list, **I paid this**, Critical alerts, and Utang overdue badges |
| Cash, savings and debt clarity | Separate account types and Net position (under More on this month) |
| Payment accuracy | Tracked source by default; explicit untracked option |
| Plan versus reality | Plan tab plus Log, with tappable unpaid bills |
| Safer payoff decisions | Avalanche priority and an extra-payment alert limited by upcoming needs and the cash reserve |
| Hard months | Financial Survival Mode pay-first sequence |
| Correctable records | Log balance-adjustment entries |
| Privacy and access | Local storage by default; optional Supabase sign-in/sync |

## First-use design

Ahon should not ask a new person to learn accounts, categories, particulars,
periods, and a ledger before they can begin. Quick start is three screens:
take-home pay and cash now, usual essentials (amounts optional), then optional
utang and a cash reserve. After that, Home offers a first log. Everyday logging
is amount + chip from Home. Planned bills are tappable (**I paid this**).
Copy last month when a new month starts. Detailed setup stays in Menu.

## Guardrail added in this update

The “Extra cash for debt repayment” alert now uses only the amount left from
this month's income after obligations. It no longer treats all existing cash
as free money for additional debt payments, and it first accounts for a
projected cash shortfall.
