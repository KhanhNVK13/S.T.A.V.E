import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Pull request", template: "%s · STAVE" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
