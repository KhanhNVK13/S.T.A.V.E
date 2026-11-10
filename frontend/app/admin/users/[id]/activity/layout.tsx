import type { Metadata } from "next";

export const metadata: Metadata = { title: "User activity" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
