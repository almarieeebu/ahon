const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

const pesoExact = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 2,
});

export function php(n: number, exact = false): string {
  return (exact ? pesoExact : peso).format(Math.round(n * 100) / 100);
}

export function phpSmart(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  const hasCents = Math.abs(rounded - Math.round(rounded)) > 0.001;
  return php(rounded, hasCents);
}

export function monthKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-PH", {
    month: "long",
    year: "numeric",
  });
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((part / whole) * 100)));
}

export function pctExact(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${((part / whole) * 100).toFixed(2)}%`;
}

export function dueLabel(day: number): string {
  if (!day) return "";
  const j = day % 10;
  const k = day % 100;
  const suffix =
    j === 1 && k !== 11
      ? "st"
      : j === 2 && k !== 12
        ? "nd"
        : j === 3 && k !== 13
          ? "rd"
          : "th";
  return `${day}${suffix} of the month`;
}

/** Largest amount Ahon accepts for one entry (guards against typos / overflow). */
export const MAX_AMOUNT = 1e12;

export function roundCentavos(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type AmountCheck =
  | { ok: true; value: number }
  | { ok: false; error: string };

/**
 * Validate a typed peso amount: accepts "1,250.50" or numbers, rejects
 * empty / NaN / zero / negative / huge values, and rounds to centavos.
 */
export function parseAmount(input: string | number | null | undefined): AmountCheck {
  const raw =
    typeof input === "number"
      ? input
      : String(input ?? "")
          .trim()
          .replace(/[₱,\s]/g, "");
  if (raw === "") return { ok: false, error: "Enter an amount." };
  if (typeof raw === "string" && !/^-?(\d+\.?\d*|\.\d+)$/.test(raw)) {
    return { ok: false, error: "Enter a number, like 150 or 150.50." };
  }
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return { ok: false, error: "Enter a number, like 150 or 150.50." };
  if (n < 0) return { ok: false, error: "Amount cannot be negative." };
  if (n > MAX_AMOUNT) return { ok: false, error: "That amount is too large. Check the digits." };
  const value = roundCentavos(n);
  if (value <= 0) return { ok: false, error: "Amount must be more than ₱0." };
  return { ok: true, value };
}
