import type { Metadata } from "next";

export const metadata: Metadata = { title: "Quản lý người dùng" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
