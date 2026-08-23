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

1. Push this repo to GitHub.
2. Vercel → Import project → Framework: Next.js.
3. Add env vars (same as `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
4. Deploy.
5. Supabase → Authentication → URL Configuration:
   - **Site URL** = your Vercel URL (e.g. `https://ahon.vercel.app`)
   - **Redirect URLs** include that URL (and `http://localhost:3100` for local)

No other code changes are required for a basic live deploy.
