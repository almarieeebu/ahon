-- Ahon schema for Supabase (PostgreSQL)
-- Paano i-run: Supabase Dashboard → SQL Editor → paste → Run
--
-- Concept: kada row naay user_id = auth.uid() aron imo ra data makita nimo (RLS).

create extension if not exists "pgcrypto";

-- ---------- profiles / settings ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  monthly_income numeric(14, 2) not null default 0,
  emergency_reserve numeric(14, 2) not null default 0,
  payday_days int[] not null default '{}',
  setup_complete boolean not null default false,
  opened_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- accounts (cash / savings / liability) ----------
create table if not exists public.accounts (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('cash', 'savings', 'liability')),
  liability_type text,
  mode text check (mode is null or mode in ('revolving', 'installment')),
  opening_balance numeric(14, 2) not null default 0,
  monthly_rate numeric(10, 6) not null default 0,
  due_day int not null default 0,
  planned_payment numeric(14, 2) not null default 0,
  goal numeric(14, 2) not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists accounts_user_id_idx on public.accounts (user_id);

-- ---------- installments (child of liability accounts) ----------
create table if not exists public.installments (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id text not null references public.accounts (id) on delete cascade,
  due date not null,
  amount numeric(14, 2) not null,
  status text not null check (status in ('paid', 'unpaid')) default 'unpaid',
  balance_after numeric(14, 2),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists installments_account_id_idx on public.installments (account_id);

-- ---------- categories (Budget setup) ----------
create table if not exists public.categories (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  planned numeric(14, 2) not null default 0,
  due_day int not null default 0,
  kind text not null check (kind in ('income', 'expense')),
  tone text not null default 'default',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists categories_user_id_idx on public.categories (user_id);

-- ---------- particulars ----------
create table if not exists public.particulars (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  category_id text references public.categories (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists particulars_user_id_idx on public.particulars (user_id);

-- ---------- budget periods ----------
create table if not exists public.budget_periods (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists budget_periods_user_id_idx on public.budget_periods (user_id);

-- ---------- budget lines ----------
create table if not exists public.budget_lines (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  period_id text not null references public.budget_periods (id) on delete cascade,
  due date,
  particular text not null default '',
  particular_id text references public.particulars (id) on delete set null,
  income numeric(14, 2) not null default 0,
  expense numeric(14, 2) not null default 0,
  actual numeric(14, 2),
  status text not null default 'unpaid',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists budget_lines_period_id_idx on public.budget_lines (period_id);

-- ---------- transactions (ledger) ----------
create table if not exists public.transactions (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  tx_date date not null,
  kind text not null check (kind in ('income', 'expense', 'transfer', 'payment', 'adjustment')),
  amount numeric(14, 2) not null,
  category text not null default '',
  particular text not null default '',
  particular_id text references public.particulars (id) on delete set null,
  from_id text references public.accounts (id) on delete set null,
  to_id text references public.accounts (id) on delete set null,
  note text not null default '',
  installment_id text references public.installments (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_id_idx on public.transactions (user_id);
create index if not exists transactions_tx_date_idx on public.transactions (user_id, tx_date);

-- ---------- auto-create profile on signup ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, monthly_income, opened_on)
  values (new.id, 0, current_date)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Row Level Security (imo ra data) ----------
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.installments enable row level security;
alter table public.categories enable row level security;
alter table public.particulars enable row level security;
alter table public.budget_periods enable row level security;
alter table public.budget_lines enable row level security;
alter table public.transactions enable row level security;

-- Helper policies: own rows only (safe to re-run)
drop policy if exists "profiles_own" on public.profiles;
drop policy if exists "accounts_own" on public.accounts;
drop policy if exists "installments_own" on public.installments;
drop policy if exists "categories_own" on public.categories;
drop policy if exists "particulars_own" on public.particulars;
drop policy if exists "budget_periods_own" on public.budget_periods;
drop policy if exists "budget_lines_own" on public.budget_lines;
drop policy if exists "transactions_own" on public.transactions;

create policy "profiles_own" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "accounts_own" on public.accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "installments_own" on public.installments
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "categories_own" on public.categories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "particulars_own" on public.particulars
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "budget_periods_own" on public.budget_periods
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "budget_lines_own" on public.budget_lines
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "transactions_own" on public.transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Reload PostgREST schema cache (fixes "table not in schema cache" after create)
notify pgrst, 'reload schema';

-- ---------- migrate existing DBs: allow balance adjustments ----------
alter table public.profiles add column if not exists emergency_reserve numeric(14, 2) not null default 0;
alter table public.profiles add column if not exists payday_days int[] not null default '{}';
alter table public.profiles add column if not exists setup_complete boolean;
update public.profiles set setup_complete = true where setup_complete is null;
alter table public.profiles alter column setup_complete set default false;
alter table public.profiles alter column setup_complete set not null;

alter table public.transactions drop constraint if exists transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check
  check (kind in ('income', 'expense', 'transfer', 'payment', 'adjustment'));

notify pgrst, 'reload schema';
