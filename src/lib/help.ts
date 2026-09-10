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
    body: "Ahon is your money notebook. Home answers: am I okay this month? Log money when it moves. Details stay in Menu.",
    tab: "home",
  },
  {
    id: "setup",
    title: "Your usual month",
    body: "Quick start asks only about pay, cash, usual needs, and optional utang. You can change details from Menu later.",
    tab: "more",
  },
  {
    id: "budget",
    title: "Plan is a guide",
    body: "Your first plan can be created during Quick start. Copy last month when a new month starts. Log is what really happened.",
    tab: "budget",
  },
  {
    id: "ledger",
    title: "Log money",
    body: "When payday comes or you spend, add amount and what it was for. That is enough for most days.",
    tab: "ledger",
  },
  {
    id: "tigum-utang",
    title: "Tigum & Utang",
    body: "Find Tigum and Utang under Menu. Tigum = savings pots. Utang = loans and credit. Home shows the overall picture.",
    tab: "save",
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
      "Log money from Home. Tap I paid this when a planned bill actually went out.",
      "Weekly habit: when paid, when a bill is paid, when cash is spent, then read the Home sentence.",
      "If income cannot cover bills, Survival Mode shows pay-first order.",
    ],
  },
  ledger: {
    title: "Log",
    bullets: [
      "Log money in or spent with an amount and a chip.",
      "More details is there for transfers, notes, or extra wallets.",
      "A weekly grocery total is enough — you do not need every jeepney fare.",
    ],
  },
  save: {
    title: "Tigum",
    bullets: [
      "Each pot is a savings account with an optional goal.",
      "Move money from Cash into a pot using More details on Log, or set the balance here.",
      "Use clear names (Emergency, House, Kids’ school).",
    ],
  },
  utang: {
    title: "Utang",
    bullets: [
      "Add each loan or credit card you still owe.",
      "Overdue and Priority badges surface what needs attention first.",
      "Mark installment bayad when you pay — it also writes a log.",
      "Remaining balance feeds the Home utang number.",
    ],
  },
  budget: {
    title: "Plan",
    bullets: [
      "This is the guide for the month, not the truth of what happened.",
      "Copy last month when a new month starts.",
      "Tap I paid this on Home instead of retyping a bill.",
    ],
  },
  more: {
    title: "Setup",
    bullets: [
      "Open from Menu: Money plan, Bill & income names, Cash & wallets, Profile.",
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
      "1) Quick start — take-home pay, cash now, usual needs, optional utang.",
      "2) Ahon creates a first plan. You do not need to name categories first.",
      "3) Log money when it moves. Home tells you if you are still okay.",
    ],
  },
  {
    title: "Everyday use",
    paragraphs: [
      "Payday → Home or Log → Money in.",
      "Gastos → Log money → amount + Food / Bills / Load / Transport / Other.",
      "A bill you already planned → I paid this.",
      "I-save → Tigum in Menu, or More details on Log.",
      "Bayad utang → Utang in Menu, or the Utang chip.",
      "Once a week, read the sentence on Home.",
    ],
  },
  {
    title: "Sharing with family",
    paragraphs: [
      "Each person should use their own Sign up email (or one shared household login you all trust).",
      "Do not share your password in chat. Send only the app link and this Manual.",
      "Live app: https://ahon-kohl.vercel.app — Sign up → Quick start → Help anytime.",
    ],
  },
  {
    title: "Tips",
    paragraphs: [
      "A weekly total for food is enough; you do not need every small fare.",
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
