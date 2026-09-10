"use client";

import { useEffect, useState } from "react";
import {
  TOUR_STEPS,
  markTourSeen,
  type TourStep,
} from "@/lib/help";
import type { TabId } from "@/lib/types";

type Props = {
  /** When true on mount, open tour from step 1 (Replay from Profile). */
  startOpen?: boolean;
  onNavigate: (tab: TabId) => void;
};

export function WelcomeTour({ startOpen, onNavigate }: Props) {
  const [open, setOpen] = useState(() => startOpen === true);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    const step = TOUR_STEPS[index];
    if (step) onNavigate(step.tab);
  }, [open, index, onNavigate]);

  if (!open) return null;

  const step: TourStep = TOUR_STEPS[index] ?? TOUR_STEPS[0];
  const last = index >= TOUR_STEPS.length - 1;

  function finish() {
    markTourSeen();
    setOpen(false);
  }

  function next() {
    if (last) {
      finish();
      return;
    }
    setIndex((i) => i + 1);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-ink/45" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={step.title}
        className="relative z-10 mb-20 w-full max-w-md rounded-t-2xl border border-paper-line bg-paper p-5 shadow-xl sm:mb-0 sm:rounded-2xl"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-deep">
          Tour · {index + 1} of {TOUR_STEPS.length}
        </p>
        <h2 className="mt-2 font-display text-xl font-semibold tracking-tight">
          {step.title}
        </h2>
        <p className="mt-2 text-sm text-ink-muted">{step.body}</p>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={finish}
            className="text-sm font-semibold text-ink-muted underline-offset-2 hover:underline"
          >
            Skip
          </button>
          <div className="flex gap-2">
            {index > 0 ? (
              <button
                type="button"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                className="rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold"
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={next}
              className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper"
            >
              {last ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
