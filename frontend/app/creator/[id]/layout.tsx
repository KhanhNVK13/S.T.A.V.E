import type { Metadata } from "next";

export const metadata: Metadata = { title: "Người sáng tác" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
