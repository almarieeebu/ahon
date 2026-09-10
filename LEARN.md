# Ahon — unsaon pagsabot sa project (Cebuano + English)

Gamiton ni nga guide kung bag-o ka sa **Next.js / React / TypeScript / Tailwind**, pero naa na kay experience sa **Supabase**.

---

## 1. Unsa ni nga app? (The big picture)

**Ahon** = personal finance notebook (cash, tigum, utang, budget, ledger).

Hunahunaa ang 3 ka layers:

| Layer | English | Ahon file |
| --- | --- | --- |
| Face | UI you click | `src/components/*` |
| Brain | Holds all money data + actions | `src/context/FinanceContext.tsx` |
| Notebook | Where data is saved | `localStorage` **or** Supabase Postgres |

```
[ Buttons / tabs ]  →  [ FinanceContext state ]  →  [ Save ]
   React UI              TypeScript AppState         local or cloud
```

---

## 2. Language & tools (simple meaning)

| Term | Meaning (Cebuano-friendly) |
| --- | --- |
| **TypeScript (`.ts` / `.tsx`)** | JavaScript + types. Murag contract: “amount kay number, dili string.” Makita sa `src/lib/types.ts`. |
| **React** | UI = functions nga mag-render HTML. Example: `HomeView`, `Ledger`. |
| **`"use client"`** | Kining file kay modagan sa browser (buttons, state). Dili server-only. |
| **Next.js** | Framework around React (folders under `src/app/`). Imong homepage = `src/app/page.tsx`. |
| **Tailwind** | Utility CSS classes (`className="mt-2 text-sm"`). Styles naa usab sa `globals.css`. |
| **Context** | Shared state for the whole app without prop-drilling. `useFinance()`, `useAuth()`. |
| **Supabase** | Hosted Postgres + Auth + RLS. Same idea sa imong past projects. |

---

## 3. Data model (imong “tables” sa TypeScript)

Open `src/lib/types.ts`. Important pieces:

- **Account** — cash / savings / liability (utang)
- **Category** — Budget setup (income / expense + color `tone`)
- **Particular** — linked to a category (`categoryId`)
- **BudgetPeriod / BudgetLine** — plan per date range
- **Transaction** — Ledger actuals

Sa browser, tanan ni naa sulod sa **usa ka object**: `AppState`.
Sa Supabase, na-split into tables (see `supabase/schema.sql`).

Translator: `src/lib/supabase/sync.ts`  
(`loadCloudState` / `saveCloudState` = AppState ↔ SQL rows)

---

## 4. Workflow sa app (product flow)

1. **Home** — am I okay, then log money  
2. **Log** — actual income / expense / transfer / payment  
3. **Plan** — month guide (copy last month)  
4. **Menu** — Tigum, Utang, extra setup when needed  

---

## 5. Local vs Cloud (importante)

| Mode | Kanus-a | Asa ang data |
| --- | --- | --- |
| **Local** | Walay env keys, or “Continue on this device” | Browser `localStorage` key `ahon.v6` (starts **empty**) |
| **Cloud** | Supabase env + Sign in | Postgres tables + local cache (empty until you add data) |

Auth files:

- `src/context/AuthContext.tsx` — login session  
- `src/components/AuthScreen.tsx` — Sign in / Sign up UI  
- `src/components/AppRoot.tsx` — gate (auth vs app)

Money files:

- `src/context/FinanceContext.tsx` — load/save; kung logged in, debounce sync to cloud  

---

## 6. Setup Supabase (imong next steps)

### A. Create project
1. [supabase.com](https://supabase.com) → New project  
2. Wait until DB is ready  

### B. Run schema
1. Dashboard → **SQL Editor**  
2. Open file `supabase/schema.sql` from this repo  
3. Paste → **Run**  
   - Creates tables + **RLS** (imo ra rows via `auth.uid()`)  
   - Creates profile row on signup (trigger)

### C. Env keys
1. Project Settings → **API**  
2. Copy **Project URL** + **anon** / **publishable** key  
3. In project folder:

```bash
cp env.example .env.local
```

4. Paste into `.env.local` (`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` **or** `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)  
5. **Restart** `npm run dev` (env only loads on start)

### D. Auth settings
- Authentication → Providers → Email on  
- Optional: disable “Confirm email” while testing (Auth → Providers → Email)

### E. Test
1. Open app → Sign up → Sign in  
2. Add a particular / ledger entry  
3. Supabase → **Table Editor** → check `accounts`, `transactions`, etc.  
4. More → see Sync status + Sign out  

---

## 7. Where to edit what (cheat sheet)

| Gusto nako… | File |
| --- | --- |
| Change homepage shell / tabs | `src/components/AppShell.tsx` |
| Ledger form | `src/components/RecordForm.tsx` |
| Budget period UI | `src/components/PeriodBudgetView.tsx` |
| Default starter data | `src/lib/defaults.ts` |
| Money math / overview | `src/lib/periodBudget.ts`, `src/lib/selectors.ts` |
| DB shape | `supabase/schema.sql` |
| Cloud mapping | `src/lib/supabase/sync.ts` |

---

## 8. Common gotchas

1. **Changed `.env.local` but nothing happened** → restart `npm run dev`.  
2. **RLS error / empty tables** → schema not run, or signed in as different user.  
3. **Sign up says check email** → confirmation enabled; confirm or turn off for local test.  
4. **Cloud save is full replace (v1)** → each save deletes then re-inserts your rows. Fine for personal use; later we can do row-level upserts.  
5. **TypeScript red squiggles** → usually missing field on a type in `types.ts`.

---

## 9. Run locally

```bash
cd "/Users/almariebullo/Personal Project/ahon"
npm install
npm run dev
```

Open the URL shown in the terminal (often http://localhost:3100).

---

**TL;DR:** React draws the screens → `FinanceContext` holds `AppState` → save to localStorage and/or Supabase. Imong Supabase skills = schema + Auth + Table Editor. Ang bag-o = Next/React file layout ug TypeScript types.
