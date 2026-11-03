import type { ReactNode } from "react";

const STAR_X = [14, 42, 70, 98, 126];
const STAR_Y = [28, 20, 32, 16, 24];
const STAFF = [10, 16, 22, 28, 34];

function Staff({ lit, loading }: { lit: number; loading?: boolean }) {
  return (
    <svg viewBox="0 0 140 44" className="h-11 w-36 text-accent" aria-hidden="true" focusable="false">
      {STAFF.map((y) => (
        <line
          key={y}
          x1={2}
          x2={138}
          y1={y}
          y2={y}
          className="stroke-border-strong"
          strokeWidth={0.6}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {STAR_X.map((x, i) => {
        const y = STAR_Y[i] + 6;
        const on = i < lit;
        return (
          <g
            key={x}
            className={loading ? "motion-safe:animate-pulse" : undefined}
            style={loading ? { animationDelay: `${i * 220}ms`, animationDuration: "1.8s" } : undefined}
          >
            {on && <circle cx={x} cy={y} r={7} className="fill-current" opacity={0.16} />}
            <circle
              cx={x}
              cy={y}
              r={on ? 2.6 : 2.2}
              className={on ? "fill-current" : "fill-none stroke-border-strong"}
              strokeWidth={0.9}
              strokeDasharray={on ? undefined : "1.5 1.5"}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Đang tải: một khuông nhạc, các vì sao lần lượt sáng lên. */
export function SkyLoading({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        compact
          ? "flex items-center gap-3 rounded-card border border-border bg-surface-subtle px-4 py-3"
          : "flex flex-col items-center justify-center gap-2 rounded-card border border-border bg-surface-subtle px-6 py-14 text-center"
      }
    >
      <Staff lit={5} loading />
      <p className="text-[13px] text-muted">{label}</p>
    </div>
  );
}

/** Trạng thái rỗng: các vì sao còn trống, chỉ một điểm sáng ở đầu khuông. */
export function SkyEmpty({
  title,
  description,
  action,
  compact = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "flex items-center gap-4 rounded-card border border-dashed border-border bg-surface-subtle px-4 py-3"
          : "flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-surface-subtle px-6 py-14 text-center"
      }
    >
      <div className={compact ? "shrink-0" : "mb-3"}>
        <Staff lit={1} />
      </div>
      <div className={compact ? "min-w-0" : "contents"}>
        <p className={compact ? "text-xs text-muted" : "text-sm font-semibold"}>{title}</p>
        {description && <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}
