# Ahon

Private money journal for cash, tigum, and every utang.

**Ahon** (ah-HON) is Cebuano/Filipino for *to rise* — out of water, out of debt, into a fuller set of books.

**Live:** [https://ahon-kohl.vercel.app](https://ahon-kohl.vercel.app/)

> New to this stack? Read **[LEARN.md](./LEARN.md)** (dev walkthrough).  
> Sharing with family? Read **[MANUAL.md](./MANUAL.md)** (simple user guide).

## Run

```bash
cd "/Users/almariebullo/Personal Project/ahon"
npm install
npm run dev
```

Open the local URL from the terminal (often [http://localhost:3100](http://localhost:3100)).

## Data

- **Default:** empty books in this browser (`localStorage` key `ahon.v6`).
- **Cloud:** Supabase Auth + Postgres. Copy `env.example` → `.env.local`, run `supabase/schema.sql`, restart `npm run dev`, then Sign in.

Build accounts, categories, and particulars under **Menu → Setup** — presets seed common starters on first empty cloud.

## Tabs

- **Home** — year / month overview (budget vs actual by particular)
- **Ledger** — income, expense, transfer, utang payment
- **Budget** — period planning
- **Menu** — Tigum, Utang, Budget setup, Particulars, Accounts, Profile

## Deploy (Vercel)

- Production: [https://ahon-kohl.vercel.app](https://ahon-kohl.vercel.app/)
- Repo: [github.com/almariebu/ahon](https://github.com/almariebu/ahon) (private)

### Checklist after deploy

1. Vercel → Project → **Settings → Environment Variables** (Production):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - Redeploy after adding/changing env vars
2. Supabase → **Authentication** → **URL Configuration**:
   - **Site URL** = `https://ahon-kohl.vercel.app`
   - **Redirect URLs** include:
     - `https://ahon-kohl.vercel.app/**`
     - `http://localhost:3100/**`
3. Supabase → **SQL Editor**: re-run `supabase/schema.sql` (or the migrate block at the bottom) so `transactions.kind` allows `adjustment`, and confirm **RLS is enabled** on all Ahon tables with `*_own` policies (`user_id = auth.uid()` / profiles `id = auth.uid()`).
4. Open the live site → Sign in → **Menu → Profile** should say **Synced to Supabase**
5. Confirm email signup: confirmation link must land on the Site URL (or localhost in dev) so `?code=` can exchange for a session

### Financial safety (v0.2)

- Bayad utang defaults to a tracked cash/wallet; “untracked source” is an explicit choice.
- Reconciling balances posts a **Balance adjustment** ledger row (opening balance stays put).
- Home **Monthly survival** shows income vs essentials vs debt dues and a deficit warning.
