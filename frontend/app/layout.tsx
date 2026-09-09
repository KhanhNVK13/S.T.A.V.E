import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../context/auth-context";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";

const staveSans = Inter({
  variable: "--font-stave-sans",
  subsets: ["latin"],
});

const staveMono = JetBrains_Mono({
  variable: "--font-stave-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "STAVE",
  description:
    "Source Tracking and Version Control Environment for MIDI Music Projects",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${staveSans.variable} ${staveMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white font-sans text-slate-900">
        <AuthProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </AuthProvider>
      </body>
    </html>
  );
}
