"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { AuthScreen } from "@/components/AuthScreen";
import { LandingScreen } from "@/components/LandingScreen";
import { FinanceProvider } from "@/context/FinanceContext";
import { AppShell } from "@/components/AppShell";

/**
 * Landing (install + CTAs) → Auth (if cloud) → App.
 * Email-confirm links (?code=) exchange in AuthProvider, then land in the app.
 */
export function AppRoot() {
  const {
    ready,
    cloudEnabled,
    user,
    localOnly,
    continueLocal,
    authNotice,
  } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-base text-ink-muted">
        Opening Ahon…
      </div>
    );
  }

  const onGate = !user && !localOnly;
  const authVisible = showAuth || Boolean(authNotice && !user);

  if (onGate && !authVisible) {
    return (
      <LandingScreen
        cloudEnabled={cloudEnabled}
        onGetStarted={() => {
          if (cloudEnabled) setShowAuth(true);
          else continueLocal();
        }}
        onContinueLocal={continueLocal}
      />
    );
  }

  if (onGate && authVisible && cloudEnabled) {
    return <AuthScreen onBack={() => setShowAuth(false)} />;
  }

  return (
    <FinanceProvider>
      <AppShell />
    </FinanceProvider>
  );
}
