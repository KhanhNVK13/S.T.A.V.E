"use client";

import { usePathname } from "next/navigation";
import { useT } from "../context/i18n-context";
import { isLandingPath } from "./landing/landing-paths";

export function SiteCredits({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <div className={className}>
      <p>
        {t("footer.tagline")}
      </p>
      <p className="mt-1">
        {t("footer.sounds")}{" "}
        <a
          href="https://github.com/gleitz/midi-js-soundfonts"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          gleitz/midi-js-soundfonts
        </a>{" "}
        {t("footer.drums")}{" "}
        <a
          href="https://schristiancollins.com/generaluser.php"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          schristiancollins.com
        </a>{" "}
        {t("footer.license")}{" "}
        <a
          href="/instruments/CREDITS.txt"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          {t("footer.fullCredits")}
        </a>
      </p>
    </div>
  );
}

export function SiteFooter() {
  const pathname = usePathname();
  if (isLandingPath(pathname) || /^\/projects\/[^/]+\/edit$/.test(pathname)) return null;

  return (
    <footer className="border-t border-border bg-surface/90">
      <SiteCredits className="mx-auto max-w-page px-5 py-4 text-center text-xs text-muted" />
    </footer>
  );
}
