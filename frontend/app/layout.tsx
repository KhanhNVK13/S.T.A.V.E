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
      <body className="h-full flex flex-col bg-white font-sans text-slate-900">
        <AuthProvider>
          <SiteHeader />
          {/*
            min-h-0 is required here: a flex item's default min-height is
            `auto` (sizes to content), which overrides `flex-1` and lets
            `main` grow past the viewport instead of stopping there. Pages
            that rely on `height:"100%"` cascading down to size an internal
            scroll region (MIDI Editor) need `main` to actually resolve to a
            real, bounded height — without min-h-0 that chain breaks and the
            editor's tall inner content pushes the whole page (and the site
            footer) far below the viewport instead of scrolling internally.
            Safe for normal content pages too: they don't rely on the exact
            height, and still scroll normally when content is taller.
          */}
          <main className="min-h-0 flex-1">{children}</main>
          <SiteFooter />
        </AuthProvider>
      </body>
    </html>
  );
}
