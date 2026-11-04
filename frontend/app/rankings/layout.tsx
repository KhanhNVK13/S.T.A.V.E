import type { Metadata } from "next";

export const metadata: Metadata = { title: "Rankings" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
