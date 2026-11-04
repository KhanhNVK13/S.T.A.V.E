import type { Metadata } from "next";

export const metadata: Metadata = { title: "Jam result" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
