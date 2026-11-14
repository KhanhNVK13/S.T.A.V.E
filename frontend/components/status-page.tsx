"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Compass, TriangleAlert, type LucideIcon } from "lucide-react";
import { useT } from "../context/i18n-context";
import { Button, buttonClass } from "./ui/button";

const LINK_PRIMARY = buttonClass("primary");
const LINK_SECONDARY = buttonClass("secondary");

function StatusLayout({
  icon: Icon,
  eyebrow,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="relative mx-auto flex min-h-full max-w-xl flex-col items-center justify-center px-5 py-16 text-center">
      <div aria-hidden="true" className="staff-rule pointer-events-none absolute inset-x-0 top-1/2 -translate-y-[118px] opacity-70" />
      <span className="relative mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-border-strong bg-background">
        <Icon aria-hidden="true" className="h-5 w-5 text-accent" />
      </span>
      <p className="eyebrow font-mono">{eyebrow}</p>
      <h1 className="text-title mb-3 mt-2">{title}</h1>
      <p className="mb-7 max-w-[46ch] text-[15px] leading-relaxed text-muted">{description}</p>
      <div className="flex flex-wrap justify-center gap-2">{children}</div>
    </div>
  );
}

export function NotFoundView() {
  const t = useT();
  return (
    <StatusLayout
      icon={Compass}
      eyebrow={t("authPages.notFoundEyebrow")}
      title={t("authPages.notFoundTitle")}
      description={t("authPages.notFoundBody")}
    >
      <Link href="/" className={LINK_PRIMARY}>
        {t("authPages.toHome")}
      </Link>
      <Link href="/explore" className={LINK_SECONDARY}>
        {t("nav.explore")}
      </Link>
    </StatusLayout>
  );
}

export function ErrorView({ reset }: { reset: () => void }) {
  const t = useT();
  return (
    <StatusLayout
      icon={TriangleAlert}
      eyebrow={t("authPages.errorEyebrow")}
      title={t("authPages.errorTitle")}
      description={t("authPages.errorBody")}
    >
      <Button onClick={reset}>{t("ui.retry")}</Button>
      <Link href="/" className={LINK_SECONDARY}>
        {t("authPages.toHome")}
      </Link>
    </StatusLayout>
  );
}
