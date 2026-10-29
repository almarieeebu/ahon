"use client";

import { useId, useRef, type ReactNode } from "react";
import { useDialogLayer } from "@/components/dialogLayer";

/**
 * Details for one item (a transaction, loan, budget row or wallet) without
 * leaving the page. Wide screens: a drawer docked to the right edge. Phones:
 * a bottom sheet. Escape or the close button dismisses it and focus goes back
 * to the row that opened it.
 */
export function SidePanel({
  open,
  title,
  eyebrow,
  onClose,
  children,
  footer,
  testId,
}: {
  open: boolean;
  title: string;
  /** Small label above the title, e.g. "Loan" or "Transaction". */
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  /** Actions pinned to the bottom of the panel. */
  footer?: ReactNode;
  testId?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogLayer(open, panelRef, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center lg:items-stretch lg:justify-end">
      <button
        type="button"
        aria-label="Close details"
        tabIndex={-1}
        className="panel-backdrop absolute inset-0 bg-ink/35"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
        className="panel-sheet relative z-10 flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-paper-line bg-paper shadow-2xl outline-none lg:h-full lg:max-h-none lg:w-[28rem] lg:max-w-[calc(100vw-2rem)] lg:rounded-none lg:rounded-l-2xl lg:border-y-0 lg:border-r-0"
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-paper-line lg:hidden" aria-hidden />
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-paper-line px-5 pb-3 pt-3 lg:pt-5">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-deep">
                {eyebrow}
              </p>
            ) : null}
            <h2 id={titleId} className="mt-0.5 break-words font-display text-xl font-semibold tracking-tight">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            data-testid="panel-close"
            className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-paper-soft hover:text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer ? (
          <footer className="flex shrink-0 flex-wrap gap-2 border-t border-paper-line bg-paper px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

/** Label/value rows for a details panel. */
export function DetailList({ items }: { items: { label: string; value: ReactNode; testId?: string }[] }) {
  return (
    <dl className="divide-y divide-paper-line rounded-xl border border-paper-line bg-white">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline justify-between gap-4 px-3.5 py-2.5 text-sm">
          <dt className="shrink-0 text-ink-muted">{item.label}</dt>
          <dd className="min-w-0 break-words text-right font-semibold text-ink" data-testid={item.testId}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export const panelPrimary =
  "min-h-11 flex-1 rounded-full bg-ink px-4 text-sm font-semibold text-paper hover:bg-ink/90";
export const panelSecondary =
  "min-h-11 flex-1 rounded-full border border-ink/20 bg-white px-4 text-sm font-semibold text-ink hover:bg-paper-soft";
export const panelDanger =
  "min-h-11 rounded-full border border-danger/30 bg-white px-4 text-sm font-semibold text-danger hover:bg-danger/5";
