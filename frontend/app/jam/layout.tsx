import type { Metadata } from "next";
import { JamSky } from "../../components/jam/jam-sky";

export const metadata: Metadata = { title: "Community Jam" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JamSky />
      {children}
    </>
  );
}
