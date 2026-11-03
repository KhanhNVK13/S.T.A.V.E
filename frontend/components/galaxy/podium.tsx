import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { APP_LOCALE } from "../../lib/format-date";
import { Badge } from "../ui/badge";
import styles from "./galaxy.module.css";
import { StarGlyph } from "./star-glyph";

export interface PodiumEntry {
  id: string;
  name: string;
  owner: string;
  genre: string | null;
  metric: number;
}

const TIERS = [
  { glyph: 112, plinth: "sm:min-h-[168px]", color: "text-metal", order: "sm:order-2", delay: 0 },
  { glyph: 88, plinth: "sm:min-h-[136px]", color: "text-muted", order: "sm:order-1", delay: 120 },
  { glyph: 76, plinth: "sm:min-h-[112px]", color: "text-warning", order: "sm:order-3", delay: 240 },
] as const;

/** Ba dự án đầu bảng: ba ngôi sao lớn trên bục, hạng nhất cao nhất và ở giữa. */
export function Podium({
  entries,
  metricIcon: MetricIcon,
}: {
  entries: PodiumEntry[];
  metricIcon: LucideIcon;
}) {
  return (
    <ol className="mb-6 grid gap-4 sm:grid-cols-3 sm:items-end">
      {entries.slice(0, 3).map((entry, index) => {
        const tier = TIERS[index];
        return (
          <li
            key={entry.id}
            style={{ "--delay": `${tier.delay}ms` } as React.CSSProperties}
            className={`${styles.rise} ${tier.order} flex flex-col items-center`}
          >
            <div className={`${index === 0 ? styles.breathe : ""} ${tier.color} -mb-3`}>
              <StarGlyph size={tier.glyph} />
            </div>
            <div
              className={`flex w-full flex-col items-center justify-center gap-1 rounded-card border border-border bg-surface px-4 py-4 text-center ${tier.plinth}`}
            >
              <span className="font-mono text-[26px] font-bold leading-none">{index + 1}</span>
              <Link
                href={`/projects/${entry.id}`}
                className="max-w-full truncate text-sm font-semibold hover:text-accent hover:underline"
              >
                {entry.name}
              </Link>
              <span className="max-w-full truncate text-xs text-muted">{entry.owner}</span>
              <div className="mt-1 flex items-center gap-2">
                {entry.genre && <Badge variant="neutral">{entry.genre}</Badge>}
                <span className="flex items-center gap-1.5 font-mono text-[13px] font-bold">
                  <MetricIcon className="h-3.5 w-3.5 text-muted" />
                  {entry.metric.toLocaleString(APP_LOCALE)}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
