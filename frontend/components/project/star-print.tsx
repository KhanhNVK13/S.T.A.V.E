import { colorFromId } from "../../lib/avatar-color";

const STAFF_Y = [30, 35, 40, 45, 50];
const HEIGHT = 80;

function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Node {
  x: number;
  y: number;
  r: number;
}

function buildPrint(id: string, width: number) {
  const hash = hashId(id);
  const rand = seeded(hash);
  const count = (width > 200 ? 12 : 6) + (hash % 3);
  const gap = (width - 24) / (count - 1);

  const main: Node[] = [];
  for (let i = 0; i < count; i++) {
    main.push({
      x: 12 + i * gap + (rand() - 0.5) * gap * 0.25,
      y: 40 + Math.round(rand() * 6 - 3) * 2.5,
      r: 1.6 + rand() * 1.5,
    });
  }

  const forkAt = 1 + Math.floor(rand() * (count - 3));
  const fork = main[forkAt];
  const branch: Node[] = [];
  const branchLen = 2 + Math.floor(rand() * 2);
  for (let j = 1; j <= branchLen; j++) {
    const x = fork.x + j * gap * 0.9;
    if (x > width - 10) break;
    branch.push({ x, y: Math.min(70, 56 + rand() * 12), r: 1.4 + rand() * 1.1 });
  }

  const dust: Node[] = [];
  const dustCount = Math.round(width / 8);
  for (let k = 0; k < dustCount; k++) {
    dust.push({ x: rand() * width, y: rand() * HEIGHT, r: 0.3 + rand() * 0.5 });
  }

  const toPoints = (nodes: Node[]) => nodes.map((n) => `${n.x.toFixed(1)},${n.y.toFixed(1)}`).join(" ");
  return {
    main,
    branch,
    dust,
    mainPoints: toPoints(main),
    branchPoints: toPoints([fork, ...branch]),
  };
}

/** Chòm sao nhỏ tất định theo id dự án — cùng cơ chế hash và bảng màu với Avatar/ProjectThumb. */
export function StarPrint({
  id,
  size = "sm",
  className = "",
}: {
  id: string;
  size?: "sm" | "lg";
  className?: string;
}) {
  const width = size === "lg" ? 320 : 160;
  const print = buildPrint(id, width);
  const { text } = colorFromId(id);
  const box =
    size === "lg"
      ? "h-full w-full min-h-[240px] rounded-none"
      : "h-8 w-16 shrink-0 rounded-md";

  return (
    <div className={`overflow-hidden bg-surface-subtle ${box} ${text} ${className}`}>
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        aria-hidden="true"
        focusable="false"
      >
        {size === "lg" &&
          print.dust.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={d.r} className="fill-foreground" opacity={0.3} />
          ))}
        {STAFF_Y.map((y) => (
          <line
            key={y}
            x1={6}
            x2={width - 6}
            y1={y}
            y2={y}
            className="stroke-border-strong"
            strokeWidth={0.5}
            vectorEffect="non-scaling-stroke"
            opacity={0.7}
          />
        ))}
        <polyline
          points={print.branchPoints}
          fill="none"
          className="stroke-current"
          strokeWidth={0.8}
          strokeDasharray="2 1.5"
          vectorEffect="non-scaling-stroke"
          opacity={0.75}
        />
        <polyline
          points={print.mainPoints}
          fill="none"
          className="stroke-current"
          strokeWidth={0.9}
          vectorEffect="non-scaling-stroke"
        />
        {[...print.main, ...print.branch].map((n, i) => (
          <g key={i}>
            <circle cx={n.x} cy={n.y} r={n.r * 2.6} className="fill-current" opacity={0.16} />
            <circle cx={n.x} cy={n.y} r={n.r} className="fill-current" />
          </g>
        ))}
      </svg>
    </div>
  );
}
