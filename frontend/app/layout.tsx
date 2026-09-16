import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../context/auth-context";
import { ThemeProvider } from "../context/theme-context";
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
      <body className="h-full flex flex-col bg-background font-sans text-foreground">
        <AuthProvider>
          <ThemeProvider>
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
            overflow-y-auto makes `main` the scroll container for pages taller
            than it (settings, lists…); without it their content overflowed
            the bounded `main` and painted over the footer. Pages that fill
            the viewport should size with min-h-full (not 100vh) to match it.
          */}
            <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
            <SiteFooter />
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
