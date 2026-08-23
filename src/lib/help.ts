import type { TabId } from "@/lib/types";

export const TOUR_STORAGE_KEY = "ahon.tour.seen.v1";

export type TourStep = {
  id: string;
  title: string;
  body: string;
  /** Which bottom tab to open while this tip is shown */
  tab: TabId;
};

/** Short first-login walkthrough (family-friendly). */
export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to Ahon",
    body: "Ahon is your money notebook — cash, tigum, utang, budget, and actual spending. Everything you add can sync when you sign in.",
    tab: "home",
  },
  {
    id: "setup",
    title: "Start in Menu → Setup",
    body: "Open Menu, then add Categories (Budget setup), Particulars, and Accounts (Cash). Without these, Ledger and Budget have nothing to pick from.",
    tab: "more",
  },
  {
    id: "budget",
    title: "Plan on Budget",
    body: "Create a period (date range) and list what you expect to earn and spend. This is your plan — not yet the real money moved.",
    tab: "budget",
  },
  {
    id: "ledger",
    title: "Record on Ledger",
    body: "When payday comes or you spend, add it here. Ledger is the truth of what actually happened.",
    tab: "ledger",
  },
  {
    id: "tigum-utang",
    title: "Tigum & Utang",
    body: "Find Tigum and Utang under Menu. Tigum = savings pots and goals. Utang = loans and credit to pay down. Home shows your overall position.",
    tab: "save",
  },
  {
    id: "help",
    title: "Help anytime",
    body: "Tap Help on any page for a short tip. Open the full Manual from Menu → Profile anytime.",
    tab: "home",
  },
];

export type PageTip = {
  title: string;
  bullets: string[];
};

export const PAGE_TIPS: Record<TabId, PageTip> = {
  home: {
    title: "Home",
    bullets: [
      "First answer: Can I afford my obligations this month?",
      "Critical alerts: overdue CC/housing, bills due soon, cash shortage, debt priority.",
      "If income < obligations, Survival Mode shows pay-first order.",
    ],
  },
  ledger: {
    title: "Ledger",
    bullets: [
      "Add income, expense, transfer, or utang payment.",
      "Pick a particular (and category) so Home/Budget stay accurate.",
      "Edit or delete a row if you made a mistake.",
    ],
  },
  save: {
    title: "Tigum",
    bullets: [
      "Each pot is a savings account with an optional goal.",
      "Move money from Cash into a pot using a transfer in Ledger, or set the balance here.",
      "Use clear names (Emergency, House, Kids’ school).",
    ],
  },
  utang: {
    title: "Utang",
    bullets: [
      "Add each loan or credit card you still owe.",
      "Overdue and Priority badges surface what needs attention first.",
      "Mark installment bayad when you pay — it also logs in Ledger.",
      "Remaining balance feeds the Home “Utang left” number.",
    ],
  },
  budget: {
    title: "Period budget",
    bullets: [
      "Add a period (start–end dates), then budget lines.",
      "Income / expense here is the plan; Ledger is actual.",
      "Use the same particulars you created in Setup.",
    ],
  },
  more: {
    title: "Setup",
    bullets: [
      "Open from Menu: Budget setup, Particulars, Accounts, Profile.",
      "Budget setup = categories (Salary, Food, Debt…).",
      "Particulars = line names linked to a category (WATER, MILK).",
      "Accounts = Cash, then other wallets. Profile = sign-in & Manual.",
    ],
  },
};

export type ManualSection = {
  title: string;
  paragraphs: string[];
};

/** Longer shareable guide for family & friends. */
export const MANUAL_SECTIONS: ManualSection[] = [
  {
    title: "What is Ahon?",
    paragraphs: [
      "Ahon means “to rise.” It is a private money journal for your household: cash on hand, tigum (savings), utang (debts), a budget plan, and a ledger of real transactions.",
      "Open the app on your phone browser and add it to your Home Screen for quick access. Sign in so your books sync across devices.",
    ],
  },
  {
    title: "First-time setup (order matters)",
    paragraphs: [
      "1) Menu → Budget setup — create income and expense categories.",
      "2) Menu → Particulars — add names you use every month (paycheck, electricity, milk) and link each to a category.",
      "3) Menu → Accounts — add Cash on hand (and later tigum pots or utang).",
      "4) Budget tab — make a period and plan amounts.",
      "5) Ledger — record what actually happened.",
    ],
  },
  {
    title: "Everyday use",
    paragraphs: [
      "Payday → Ledger → Income → pick particular → Cash.",
      "Gastos → Ledger → Expense → particular → from Cash.",
      "I-save → move Cash to a Tigum pot (transfer) or update the pot balance on Tigum.",
      "Bayad utang → Utang tab or Ledger payment.",
      "Check Home to see if you are rising this month.",
    ],
  },
  {
    title: "Sharing with family",
    paragraphs: [
      "Each person should use their own Sign up email (or one shared household login you all trust).",
      "Do not share your password in chat. Send only the app link and this Manual.",
      "Live app: https://ahon-kohl.vercel.app — Sign up → follow the welcome tour → Help (?) anytime.",
    ],
  },
  {
    title: "Tips",
    paragraphs: [
      "Keep particular names consistent so reports stay clean.",
      "Export a backup from Menu → Profile before big changes.",
      "If sync fails, check Profile for the error, then try again on Wi‑Fi.",
    ],
  },
];

export function hasSeenTour(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(TOUR_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function markTourSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOUR_STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearTourSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOUR_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
