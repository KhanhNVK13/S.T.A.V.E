"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase-browser";
import {
  apiFetch,
  clearStoredSessionId,
  getStoredSessionId,
  setStoredSessionId,
} from "../lib/api-client";
import type { Profile } from "../lib/types";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function ensureBusinessSession(): Promise<void> {
  if (getStoredSessionId()) return;
  await apiFetch("/auth/sync-profile", { method: "POST" });
  const { sessionId } = await apiFetch<{ sessionId: string }>(
    "/auth/sessions",
    {
      method: "POST",
      body: JSON.stringify({
        deviceLabel:
          typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      }),
    },
  );
  setStoredSessionId(sessionId);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    if (!getStoredSessionId()) {
      setProfile(null);
      return;
    }
    try {
      const me = await apiFetch<Profile>("/users/me");
      setProfile(me);
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!active) return;
        setSession(newSession);

        if (event === "SIGNED_OUT") {
          clearStoredSessionId();
          setProfile(null);
          setLoading(false);
          return;
        }

        if (newSession) {
          void (async () => {
            try {
              await ensureBusinessSession();
              await refreshProfile();
            } finally {
              if (active) setLoading(false);
            }
          })();
        } else {
          setLoading(false);
        }
      },
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [refreshProfile]);

  const signOut = useCallback(async () => {
    const sessionId = getStoredSessionId();
    if (sessionId) {
      await apiFetch(`/auth/sessions/${sessionId}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
    clearStoredSessionId();
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
