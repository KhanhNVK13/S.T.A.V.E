'use client';

import { useAuth } from '../context/auth-context';
import { Home } from '../components/home/home';
import { HomeWait } from '../components/home/home-wait';
import { LandingPage } from '../components/landing/landing-page';

export default function RootPage() {
  const { user, loading } = useAuth();

  if (loading) return <HomeWait />;
  return user ? <Home /> : <LandingPage />;
}
