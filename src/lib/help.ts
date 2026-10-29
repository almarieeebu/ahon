import type { TabId } from "@/lib/types";

export const TOUR_STORAGE_KEY = "ahon.tour.seen.v1";

export type TourStep = {
  id: string;
  title: string;
  body: string;
  /** Which bottom tab to open while this tip is shown */
  tab: TabId;
};

/** Short replayable walkthrough (family-friendly). Not auto-played. */
export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to Ahon",
    body: "Ahon is your money notebook. Home answers: am I okay this month? Add an expense when money moves. Setup details stay under More.",
    tab: "home",
  },
  {
    id: "setup",
    title: "Your usual month",
    body: "Setup is optional. Income & recurring bills (under More) holds pay, paydays, and usual bills whenever you are ready.",
    tab: "more",
  },
  {
    id: "budget",
    title: "Budget is a guide",
    body: "Set a monthly budget on the Budget tab. Copy last month when a new month starts. Activity is what really happened.",
    tab: "budget",
  },
  {
    id: "ledger",
    title: "Activity",
    body: "When payday comes or you spend, add amount and what it was for. That is enough for most days.",
    tab: "ledger",
  },
  {
    id: "tigum-utang",
    title: "Loans & Savings",
    body: "Loans (utang) has its own tab: add a loan, then Record payment on its card. Savings (tigum) pots are under More.",
    tab: "utang",
  },
  {
    id: "help",
    title: "Help anytime",
    body: "Tap Help on any page for a short tip. The weekly habit: log when money moves, then read the Home sentence once a week.",
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
      "First answer: Am I okay this month?",
      "Add an expense or a loan from Home. Tap I paid this when a planned bill actually went out.",
      "Weekly habit: when paid, when a bill is paid, when cash is spent, then read the Home sentence.",
      "If income cannot cover bills, Survival Mode shows pay-first order.",
    ],
  },
  ledger: {
    title: "Activity",
    bullets: [
      "Add expense, or Log money for money in, with an amount and a category.",
      "More details is there for transfers, notes, or extra wallets.",
      "A weekly grocery total is enough — you do not need every jeepney fare.",
    ],
  },
  save: {
    title: "Savings",
    bullets: [
      "Each pot is a savings account with an optional goal.",
      "Move money from Cash into a pot using More details on Activity, or set the balance here.",
      "Use clear names (Emergency, House, Kids’ school).",
    ],
  },
  utang: {
    title: "Loans / Utang",
    bullets: [
      "Add loan: choose “I already owe this” (cash does not change) or “I received this money now” (the wallet and the debt both go up; it is not income).",
      "Only the name and amount are needed. Leave interest blank if you do not know it.",
      "Record payment on a loan’s card. Partial payments are fine; Ahon shows what is still owed.",
      "Remaining balance feeds the Home utang number.",
    ],
  },
  budget: {
    title: "Budget",
    bullets: [
      "This is the guide for the month, not the truth of what happened.",
      "Copy last month when a new month starts.",
      "Tap I paid this on Home instead of retyping a bill.",
    ],
  },
  more: {
    title: "More",
    bullets: [
      "Open from More: Savings, Income & recurring bills, Bill & income names, Cash & wallets, Profile.",
      "You can wait until after you have logged a few days.",
      "Cash & wallets = cash on hand, GCash, Maya, and banks.",
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
      "Ahon means “to rise.” It is a private money journal for your household: cash on hand, tigum (savings), utang (debts), a simple month plan, and a log of real money movement.",
      "Open the app on your phone browser and add it to your Home Screen for quick access. Sign in so your books sync across devices.",
    ],
  },
  {
    title: "First-time setup",
    paragraphs: [
      "You can start right away: Add expense, Add loan, or Set monthly budget. Setup is optional.",
      "When ready, Set up income and wallets — take-home pay, cash now, usual needs. Skipping keeps what you typed.",
      "Add expenses when money moves. Home tells you if you are still okay.",
    ],
  },
  {
    title: "Everyday use",
    paragraphs: [
      "Payday → Home or Activity → Log money → Money in.",
      "Gastos → Add expense → amount + category.",
      "A bill you already planned → I paid this.",
      "I-save → Savings under More, or More details on Activity.",
      "Bayad utang → Loans tab → Record payment on that loan’s card.",
      "Once a week, read the sentence on Home.",
    ],
  },
  {
    title: "Sharing with family",
    paragraphs: [
      "Each person should use their own Sign up email (or one shared household login you all trust).",
      "Do not share your password in chat. Send only the app link and this Manual.",
      "Live app: https://ahon-kohl.vercel.app — Sign up → Add expense → Help anytime.",
    ],
  },
  {
    title: "Tips",
    paragraphs: [
      "A weekly total for food is enough; you do not need every small fare.",
      "Export a backup from More → Profile before big changes.",
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
