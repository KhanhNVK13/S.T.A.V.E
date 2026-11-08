import { useEffect, useState } from "react";
import { useAuth } from "../context/auth-context";

const READY_FALLBACK_MS = 8000;

export function useSessionReady(): boolean {
  const { user, profile, loading } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!user || profile) return;
    const timer = setTimeout(() => setTimedOut(true), READY_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [user, profile]);

  return !loading && !!user && (!!profile || timedOut);
}
