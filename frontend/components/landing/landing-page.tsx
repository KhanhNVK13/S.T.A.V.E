"use client";

import { getFeaturedContent, type FeaturedContent } from "../../lib/api-client";
import { useApiResource } from "../../lib/use-api-resource";
import { useAuth } from "../../context/auth-context";
import { Landing } from "./landing";

export function LandingPage() {
  const { user } = useAuth();
  // Lỗi tải được bỏ qua có chủ đích: landing vẫn đủ 7 khối khi `data === null`,
  // chỉ thiếu dải "Happening now" ở khối cuối.
  const { data } = useApiResource<FeaturedContent>(() => getFeaturedContent(), []);
  return <Landing data={data} signedIn={!!user} />;
}
