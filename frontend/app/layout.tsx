import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Unbounded } from "next/font/google";
import "./globals.css";
import { AccessibilityProvider } from "../context/accessibility-context";
import { AuthProvider } from "../context/auth-context";
import { I18nProvider } from "../context/i18n-context";
import { ShellSwitch } from "../components/shell/shell-switch";
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
      <body className="h-full bg-background font-sans text-foreground">
        <AccessibilityProvider>
          <I18nProvider>
            <AuthProvider>
              <SpaceBackdrop />
              <SkipLink />
              <ShellSwitch>{children}</ShellSwitch>
              <FlashToastHost />
            </AuthProvider>
          </I18nProvider>
        </AccessibilityProvider>
      </body>
    </html>
  );
}
