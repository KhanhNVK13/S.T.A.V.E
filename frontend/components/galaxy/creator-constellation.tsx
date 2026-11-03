import { hashString, seeded, STAFF_LINES, weightOf } from "./constellation";

export interface CreatorStar {
  id: string;
  playCount: number;
  forkCount: number;
}

const WIDTH = 1000;
const HEIGHT = 96;
const STEP = 10;
const MAX_STARS = 24;

/**
 * Chòm sao cá nhân: mỗi dự án công khai là một ngôi sao nối nhau trên khuông nhạc.
 * Đường kẻ co giãn theo bề ngang; sao là phần tử HTML để luôn tròn.
 */
export function CreatorConstellation({
  stars,
  activeId,
}: {
  stars: CreatorStar[];
  activeId: string | null;
}) {
  const shown = stars.slice(0, MAX_STARS);
  if (shown.length === 0) return null;

  const points = shown.map((star, index) => {
    const rand = seeded(hashString(star.id));
    return {
      id: star.id,
      x: shown.length === 1 ? WIDTH / 2 : 20 + (index / (shown.length - 1)) * (WIDTH - 40),
      y: HEIGHT / 2 + Math.round(rand() * 6 - 3) * 0.5 * STEP,
      size: 8 + weightOf(star.playCount, star.forkCount) * 8,
    };
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");

  return (
    <div aria-hidden="true" className="relative mb-6" style={{ height: HEIGHT }}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {STAFF_LINES.map((line) => (
          <line
            key={line}
            x1="0"
            x2={WIDTH}
            y1={HEIGHT / 2 + line * STEP}
            y2={HEIGHT / 2 + line * STEP}
            className="stroke-border"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {points.length > 1 && (
          <path d={path} fill="none" className="stroke-muted" strokeWidth="1.4" opacity="0.7" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {points.map((p) => {
        const lit = p.id === activeId;
        return (
          <span
            key={p.id}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform duration-700 ease-out ${
              lit ? "scale-[1.7] bg-accent shadow-[0_0_14px_3px_var(--accent)]" : "scale-100 bg-foreground shadow-[0_0_8px_1px_var(--muted-foreground)]"
            }`}
            style={{ left: `${p.x / 10}%`, top: p.y, width: p.size, height: p.size }}
          />
        );
      })}
    </div>
  );
}
