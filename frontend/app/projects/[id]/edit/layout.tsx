import type { Metadata } from "next";

export const metadata: Metadata = { title: "Trình soạn nhạc" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
