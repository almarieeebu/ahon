"use client";

import { useEffect, useState } from "react";
import { APP_NAME, APP_TAGLINE } from "@/lib/defaults";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Props = {
  onGetStarted: () => void;
  onContinueLocal: () => void;
  cloudEnabled: boolean;
};

/**
 * First screen for family & friends: brand, install on phone, then sign in.
 */
export function LandingScreen({
  onGetStarted,
  onContinueLocal,
  cloudEnabled,
}: Props) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  // Rendered only after auth is ready on the client, so window is available.
  const [installed, setInstalled] = useState(
    () =>
      typeof window !== "undefined" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        // iOS Safari
        ("standalone" in navigator &&
          Boolean((navigator as Navigator & { standalone?: boolean }).standalone))),
  );
  const [showIosTip, setShowIosTip] = useState(false);

  useEffect(() => {
    function onBip(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  async function installApp() {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setDeferred(null);
      return;
    }
    setShowIosTip(true);
  }

  return (
    <div className="landing-root min-h-dvh">
      <section className="landing-hero relative flex min-h-dvh flex-col justify-end px-5 pb-10 pt-16 sm:justify-center sm:pb-16">
        <div className="landing-hero-wash absolute inset-0" aria-hidden />
        <div className="relative z-10 mx-auto w-full max-w-lg">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold-bright">
            {APP_NAME}
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-night-ink sm:text-5xl">
            {APP_TAGLINE}
          </h1>
          <p className="mt-3 max-w-md text-base text-night-muted sm:text-lg">
            Your household money notebook — cash, tigum, utang, and a simple log.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              data-testid="landing-open"
              onClick={onGetStarted}
              className="rounded-full bg-gold px-6 py-3.5 text-base font-semibold text-ink"
            >
              {cloudEnabled ? "Sign in / Sign up" : "Open Ahon"}
            </button>
            {!installed ? (
              <button
                type="button"
                onClick={() => void installApp()}
                className="rounded-full border border-night-ink/30 bg-night-raised/60 px-6 py-3.5 text-base font-semibold text-night-ink backdrop-blur"
              >
                Install on phone
              </button>
            ) : (
              <p className="self-center text-sm text-ok">Installed on this device</p>
            )}
          </div>
          {cloudEnabled ? (
            <button
              type="button"
              data-testid="landing-local"
              onClick={onContinueLocal}
              className="mt-4 text-sm font-semibold text-night-muted underline-offset-2 hover:underline"
            >
              Continue on this device only
            </button>
          ) : null}
        </div>
      </section>

      <section className="mx-auto max-w-lg px-5 py-12">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Add to Home Screen
        </h2>
        <p className="mt-2 text-base text-ink-muted">
          Feels like an app — open Ahon in one tap.
        </p>

        {showIosTip || !deferred ? (
          <ol className="mt-6 space-y-4 text-base text-ink">
            <li className="rounded-2xl border border-paper-line bg-white/70 px-4 py-3">
              <span className="font-semibold">iPhone (Safari)</span>
              <p className="mt-1 text-ink-muted">
                Tap Share → <strong>Add to Home Screen</strong> → Add.
              </p>
            </li>
            <li className="rounded-2xl border border-paper-line bg-white/70 px-4 py-3">
              <span className="font-semibold">Android (Chrome)</span>
              <p className="mt-1 text-ink-muted">
                Menu ⋮ → <strong>Install app</strong> or{" "}
                <strong>Add to Home screen</strong>. Or tap Install on phone
                above when it appears.
              </p>
            </li>
          </ol>
        ) : (
          <p className="mt-4 text-base text-ink-muted">
            Tap <strong>Install on phone</strong> above when your browser offers
            it.
          </p>
        )}
      </section>
    </div>
  );
}
