import type { Metadata } from "next";

export const metadata: Metadata = { title: "User management" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
