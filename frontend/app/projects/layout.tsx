import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Dự án của tôi", template: "%s · STAVE" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
