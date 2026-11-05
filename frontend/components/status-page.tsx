"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Compass, TriangleAlert, type LucideIcon } from "lucide-react";
import { useT } from "../context/i18n-context";
import { Button } from "./ui/button";

const LINK_PRIMARY =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-accent bg-accent px-3 text-[13px] font-semibold text-accent-foreground transition-colors hover:border-accent-hover hover:bg-accent-hover";
const LINK_SECONDARY =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-border-strong bg-surface-subtle/60 px-3 text-[13px] font-semibold text-foreground transition-colors hover:bg-surface-muted";

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
    <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center px-5 py-16 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface-subtle">
        <Icon aria-hidden="true" className="h-6 w-6 text-muted" />
      </span>
      <p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-accent">{eyebrow}</p>
      <h1 className="mb-2 mt-1 text-[26px] font-semibold leading-tight tracking-tight">{title}</h1>
      <p className="mb-6 text-sm text-muted">{description}</p>
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
