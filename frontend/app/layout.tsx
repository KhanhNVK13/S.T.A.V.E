import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Unbounded } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../context/auth-context";
import { I18nProvider } from "../context/i18n-context";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";
import { FlashToastHost } from "../components/flash-toast";
import { SkipLink } from "../components/skip-link";
import { SpaceBackdrop } from "../components/space/space-backdrop";

const staveSans = Inter({
  variable: "--font-stave-sans",
  subsets: ["latin"],
});

const staveMono = JetBrains_Mono({
  variable: "--font-stave-mono",
  subsets: ["latin"],
});

const staveDisplay = Unbounded({
  variable: "--font-stave-display",
  subsets: ["latin"],
  weight: "800",
});

export const metadata: Metadata = {
  title: { template: "%s · STAVE", default: "STAVE — Version control for MIDI music projects" },
  description:
    "Source Tracking and Version Control Environment for MIDI Music Projects",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${staveSans.variable} ${staveMono.variable} ${staveDisplay.variable} h-full antialiased`}
    >
      <body className="h-full flex flex-col bg-background font-sans text-foreground">
        <I18nProvider>
        <AuthProvider>
            <SpaceBackdrop />
            <SkipLink />
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
            <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">{children}</main>
            <SiteFooter />
            <FlashToastHost />
        </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
