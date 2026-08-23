"use client";

import { useAuth } from "@/context/AuthContext";
import { AuthScreen } from "@/components/AuthScreen";
import { FinanceProvider } from "@/context/FinanceContext";
import { AppShell } from "@/components/AppShell";

/**
 * Gate: kung naa Supabase + wala pa login ug dili local-only → AuthScreen.
 * Kung logged in or local-only → normal Ahon app.
 */
export function AppRoot() {
  const { ready, cloudEnabled, user, localOnly } = useAuth();

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-ink-muted">
        Opening Ahon…
      </div>
    );
  }

  const needsAuth = cloudEnabled && !user && !localOnly;
  if (needsAuth) return <AuthScreen />;

  return (
    <FinanceProvider>
      <AppShell />
    </FinanceProvider>
  );
}
