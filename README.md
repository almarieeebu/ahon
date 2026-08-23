# Ahon

Private money journal for cash, tigum, and every utang.

**Ahon** (ah-HON) is Cebuano/Filipino for *to rise* — out of water, out of debt, into a fuller set of books.

> New to this stack? Read **[LEARN.md](./LEARN.md)** (Cebuano + English walkthrough).

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

Build accounts, categories, and particulars under **More** — nothing is pre-seeded.

## Tabs

- **Home** — year / month overview (budget vs actual by particular)
- **Budget** — period planning
- **Ledger** — income, expense, transfer, utang payment
- **Tigum / Utang** — savings & liabilities
- **More** — categories, particulars, accounts, profile (sync / sign out)

## Deploy (Vercel)

Repo: [github.com/almarieeebu/ahon](https://github.com/almarieeebu/ahon) (private)

1. [vercel.com/new](https://vercel.com/new) → Import **almarieeebu/ahon**
2. Framework: **Next.js** (auto-detect)
3. Environment Variables → add (from your local `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
4. Deploy → copy the production URL
5. Supabase → **Authentication** → **URL Configuration**:
   - **Site URL** = `https://YOUR-APP.vercel.app`
   - **Redirect URLs** = that URL + `http://localhost:3100/**`
6. Open the Vercel URL → Sign up / Sign in → confirm sync under **More → Profile**
