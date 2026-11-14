import { colorFromId } from "../../lib/avatar-color";

const SIZE_CLASSES = {
  sm: "h-[46px] w-[84px] shrink-0 rounded-lg",
  lg: "h-24 w-full rounded-xl",
} as const;

const VIEW_W = 120;
const VIEW_H = 60;
const STAFF_TOP = 18;
const STAFF_GAP = 6;
const STARS = 5;

function hashOf(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

function starsOf(id: string): { x: number; y: number }[] {
  let state = hashOf(id) || 1;
  const next = () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
  const step = (VIEW_W - 32) / (STARS - 1);
  let slot = 2 + Math.floor(next() * 5);
  return Array.from({ length: STARS }, (_, i) => {
    slot = Math.max(0, Math.min(8, slot + Math.round(next() * 4 - 2)));
    return {
      x: Math.round((16 + i * step + (next() - 0.5) * 6) * 10) / 10,
      y: STAFF_TOP + slot * (STAFF_GAP / 2),
    };
  });
}

/**
 * Dấu nhận diện tất định theo id project: năm dòng kẻ và một chòm sao nhỏ.
 * Đây là hình trang trí (như avatar màu), KHÔNG biểu diễn nốt nhạc hay lịch sử thật.
 */
export function ProjectThumb({
  id,
  size = "lg",
  className = "",
}: {
  id: string;
  size?: "sm" | "lg";
  className?: string;
}) {
  const { text } = colorFromId(id);
  const stars = starsOf(id);
  const head = stars[stars.length - 1];
  return (
    <div
      aria-hidden="true"
      className={`overflow-hidden border border-border bg-background/70 ${text} ${SIZE_CLASSES[size]} ${className}`}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        focusable="false"
      >
        {[0, 1, 2, 3, 4].map((line) => (
          <line
            key={line}
            x1="0"
            x2={VIEW_W}
            y1={STAFF_TOP + line * STAFF_GAP}
            y2={STAFF_TOP + line * STAFF_GAP}
            className="stroke-foreground/15"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <polyline
          points={stars.map((s) => `${s.x},${s.y}`).join(" ")}
          fill="none"
          className="stroke-foreground/50"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
        />
        {stars.slice(0, -1).map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r="2.6" className="fill-foreground" />
        ))}
        <circle cx={head.x} cy={head.y} r="6.5" fill="currentColor" opacity="0.22" />
        <circle cx={head.x} cy={head.y} r="3.2" fill="currentColor" />
      </svg>
    </div>
  );
}
