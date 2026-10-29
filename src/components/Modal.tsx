"use client";

import { useId, useRef, type ReactNode } from "react";
import { useDialogLayer } from "@/components/dialogLayer";

/**
 * Centered dialog on wide screens, bottom sheet on phones. Escape closes it,
 * Tab stays inside, and focus returns to whatever opened it.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogLayer(open, dialogRef, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 max-h-[92dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl border border-paper-line bg-paper px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl outline-none sm:rounded-2xl sm:pt-5"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-paper-line sm:hidden" aria-hidden />
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={titleId} className="font-display text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 -mt-1 min-h-11 rounded-full px-3 text-sm font-semibold text-ink-muted hover:bg-paper-soft hover:text-ink"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
