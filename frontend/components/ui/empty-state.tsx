import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-panel border border-border bg-surface/70 px-6 py-14 text-center">
      <div aria-hidden="true" className="staff-rule pointer-events-none absolute inset-x-0 top-[62px]" />
      <span className="relative mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border-strong bg-background">
        <Icon aria-hidden="true" className="h-5 w-5 text-accent" />
      </span>
      <p className="text-lg font-medium tracking-[-0.01em]">{title}</p>
      {description && <p className="mt-1.5 max-w-[44ch] text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
