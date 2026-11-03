'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/auth-context';
import { getFeaturedContent, FeaturedContent } from '../lib/api-client';
import { useApiResource } from '../lib/use-api-resource';
import { Landing } from '../components/space/landing/landing';

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();
  // Lỗi tải được bỏ qua có chủ đích: trang chủ vẫn đủ 7 khối khi `data === null`,
  // chỉ thiếu dải "Happening now" ở khối cuối.
  const { data } = useApiResource<FeaturedContent>(() => getFeaturedContent(), []);

  useEffect(() => {
    if (user) router.replace('/projects');
  }, [user, router]);

  if (user) return null;

  return <Landing data={data} />;
}
