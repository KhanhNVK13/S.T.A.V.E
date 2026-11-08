'use client';

import { useAuth } from '../context/auth-context';
import { useSessionReady } from '../lib/use-session-ready';
import { Home } from '../components/home/home';
import { HomeWait } from '../components/home/home-wait';
import { LandingPage } from '../components/landing/landing-page';

export default function RootPage() {
  const { user, loading } = useAuth();
  const sessionReady = useSessionReady();

  if (loading || (user && !sessionReady)) return <HomeWait />;
  return user ? <Home /> : <LandingPage />;
}
