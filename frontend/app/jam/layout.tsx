import type { Metadata } from "next";
import { JamSky } from "../../components/jam/jam-sky";

export const metadata: Metadata = {
  title: { default: "Community Jam", template: "%s · STAVE" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JamSky />
      {children}
    </>
  );
}
