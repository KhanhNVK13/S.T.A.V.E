import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Project", template: "%s · STAVE" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
