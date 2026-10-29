"use client";

import { Modal } from "@/components/Modal";
import { MANUAL_SECTIONS, PAGE_TIPS, type PageTip } from "@/lib/help";
import type { TabId } from "@/lib/types";

export function PageHelpModal({
  open,
  tab,
  onClose,
}: {
  open: boolean;
  tab: TabId;
  onClose: () => void;
}) {
  const tip: PageTip = PAGE_TIPS[tab];
  return (
    <Modal open={open} title={`Help · ${tip.title}`} onClose={onClose}>
      <ul className="space-y-2 text-sm text-ink">
        {tip.bullets.map((b) => (
          <li
            key={b}
            className="rounded-xl border border-paper-line bg-white/70 px-3 py-2 text-ink-muted"
          >
            {b}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-ink-muted">
        Full guide: More → Profile → Open manual.
      </p>
    </Modal>
  );
}

export function ManualModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} title="Ahon manual" onClose={onClose}>
      <div className="space-y-5 text-sm">
        {MANUAL_SECTIONS.map((section) => (
          <section key={section.title}>
            <h3 className="font-display text-base font-semibold text-ink">
              {section.title}
            </h3>
            <div className="mt-2 space-y-2 text-ink-muted">
              {section.paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}
