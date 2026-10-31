"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { AuthScreen } from "@/components/AuthScreen";
import { ResetPasswordScreen } from "@/components/ResetPasswordScreen";
import { LandingScreen } from "@/components/LandingScreen";
import { FinanceProvider } from "@/context/FinanceContext";
import { AppShell } from "@/components/AppShell";

/**
 * Landing (install + CTAs) → Auth (if cloud) → App.
 * Email-confirm links (?code=) exchange in AuthProvider, then land in the app.
 * Password-reset links land on "Set a new password" first.
 */
export function AppRoot() {
  const {
    ready,
    cloudEnabled,
    user,
    localOnly,
    continueLocal,
    authNotice,
    recoveryMode,
  } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-base text-ink-muted">
        Opening Ahon…
      </div>
    );
  }

  // Opened a password-reset link: set the new password before entering the app.
  if (recoveryMode && user) {
    return <ResetPasswordScreen />;
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
