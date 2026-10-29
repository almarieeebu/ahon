# Budget: spending from Activity (migration notes)

The Budget tab now stores **targets only** (category spending limits, expected
income, planned bills). What was spent is **derived from transactions** every
time it is shown (`deriveBudget` in `src/lib/periodBudget.ts`). Nothing new is
written to `budget_lines.actual`.

## What changed in the data

| Where | Change |
| --- | --- |
| `BudgetLine.lineType` / `budget_lines.line_type` | `limit`, `bill` or `income`. Null on older rows: they are read from their amounts (expense > 0 = bill, income > 0 = expected income). |
| `BudgetLine.categoryId` / `budget_lines.category_id` | Category of a `limit` row. |
| `BudgetLine.legacyReview` / `budget_lines.legacy_review` | `kept` or `hidden`: the person's review of an earlier manual amount. |
| `budget_lines.actual` | Kept exactly as stored. No longer written by the app. |

All three columns are nullable and added with `add column if not exists`
(bottom of `supabase/schema.sql`). Row-level security is unchanged: the existing
`budget_lines_own` policy still limits rows to `user_id = auth.uid()`. If the
database has not been migrated yet, sync retries without the new columns, so
older databases keep working (the new fields then stay on the device only).

## Earlier manual amounts (legacy `actual`)

`reconcileLegacyActuals` is a pure function: it reads the books and returns a
report. Running it any number of times gives the same answer and changes
nothing.

- **Reconciled**: transactions explicitly linked to the row
  (`transactions.budget_line_id`) add up to the stored amount. Nothing to do.
- **Mismatch**: linked transactions exist but add up to something else.
- **Unlinked**: no linked transaction.

Rows are never matched by amount, date or description, never turned into
transactions, and never added to Spent. Mismatched and unlinked rows appear
under **Earlier manual entries (not from your activity)** with **Keep as note**
and **Hide** (hidden ones can be shown again). Deleting a linked payment no
longer clears the stored amount; the row simply becomes unlinked.

## Before upgrading: back up

1. **On the device**: More → Profile → **Export backup** (downloads the full
   books as JSON). Do this on each device that has local-only books.
2. **Supabase** (SQL Editor), before running the new `schema.sql` section:

   ```sql
   create table if not exists public.budget_periods_backup_20261029 as
     select * from public.budget_periods;
   create table if not exists public.budget_lines_backup_20261029 as
     select * from public.budget_lines;
   create table if not exists public.transactions_backup_20261029 as
     select * from public.transactions;
   ```

   Backup tables have no RLS policies; keep them private (do not expose them
   through the API) and drop them once the upgrade is confirmed.

3. Run the new section at the bottom of `supabase/schema.sql` (safe to re-run).

## Rollback

- **App only**: deploy the previous build. Older code ignores the new columns
  and fields, and every stored `actual` is still there, so old screens show the
  same numbers as before. Category-limit rows created by the new screen show up
  in the old screen as plain expense rows.
- **Device data**: More → Profile → **Import backup** with the exported file.
- **Database** (only if needed; the columns are harmless to keep):

  ```sql
  -- restore rows from the backup taken above
  begin;
  delete from public.transactions where user_id in (select user_id from public.transactions_backup_20261029);
  delete from public.budget_periods where user_id in (select user_id from public.budget_periods_backup_20261029);
  insert into public.budget_periods select * from public.budget_periods_backup_20261029;
  insert into public.budget_lines select * from public.budget_lines_backup_20261029;
  insert into public.transactions select * from public.transactions_backup_20261029;
  commit;
  -- optional: remove the new columns
  alter table public.budget_lines drop column if exists line_type;
  alter table public.budget_lines drop column if exists category_id;
  alter table public.budget_lines drop column if exists legacy_review;
  notify pgrst, 'reload schema';
  ```

  Deleting `budget_periods` also deletes their lines (cascade). The new
  columns sit at the end of `budget_lines`, so the positional `insert` works
  whether the backup was taken before or after the migration. Run the restore
  while signed-in apps are closed, or the next sync will overwrite it.
