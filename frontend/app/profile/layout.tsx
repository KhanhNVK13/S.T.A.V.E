import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Hồ sơ", template: "%s · STAVE" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
