import type { Metadata } from "next";

export const metadata: Metadata = { title: "Test payment" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
