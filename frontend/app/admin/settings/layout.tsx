import type { Metadata } from "next";

export const metadata: Metadata = { title: "Platform settings" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
