import type { Metadata } from "next";

export const metadata: Metadata = { title: "Jam event control" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
