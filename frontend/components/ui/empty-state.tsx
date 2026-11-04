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
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border-strong bg-surface/60 px-6 py-14 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface-subtle">
        <Icon aria-hidden="true" className="h-6 w-6 text-muted" />
      </span>
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
