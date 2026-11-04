import { diffClass, type SampleNote } from "./landing-data";

const STEPS = 64;
const LO = 40;
const HI = 79;
const CELL = 10;
const ROW_H = 5;
const GUTTER = 34;
const BLACK = new Set([1, 3, 6, 8, 10]);

/** Piano roll SVG so sánh hai commit mẫu (xanh = thêm, hồng đỏ nét đứt = bỏ, hổ phách = đổi velocity). */
export function SampleRoll({ notes, from, to, label }: { notes: SampleNote[]; from: number; to: number; label: string }) {
  const W = GUTTER + STEPS * CELL;
  const H = (HI - LO + 1) * ROW_H + 18;
  const rows = [];
  for (let p = HI; p >= LO; p--) {
    const y = 18 + (HI - p) * ROW_H;
    const pc = p % 12;
    if (BLACK.has(pc)) rows.push(<rect key={`b${p}`} x={GUTTER} y={y} width={W - GUTTER} height={ROW_H} className="row-b" />);
    if (pc === 0) {
      rows.push(<rect key={`c${p}`} x={GUTTER} y={y} width={W - GUTTER} height={ROW_H} className="row-c" />);
      rows.push(
        <text key={`t${p}`} x={GUTTER - 6} y={y + ROW_H - 1} textAnchor="end" className="lbl">
          {`C${Math.floor(p / 12) - 1}`}
        </text>,
      );
    }
  }
  const grid = [];
  for (let s = 0; s <= STEPS; s += 4) {
    const x = GUTTER + s * CELL;
    const bar = s % 16 === 0;
    grid.push(<line key={`l${s}`} x1={x} x2={x} y1={bar ? 2 : 18} y2={H} className={bar ? "bar" : "beat"} />);
    if (bar && s < STEPS) {
      grid.push(
        <text key={`n${s}`} x={x + 5} y={12} className="lbl">
          {s / 16 + 1}
        </text>,
      );
    }
  }
  const items = notes.flatMap((n) => {
    const cls = diffClass(n, from, to);
    if (!cls) return [];
    return [
      <rect
        key={n.id}
        x={GUTTER + n.s * CELL + 1}
        y={18 + (HI - n.p) * ROW_H + 1}
        width={Math.max(4, n.d * CELL - 2)}
        height={ROW_H - 2}
        rx={2}
        className={cls}
      />,
    ];
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="roll" role="img" aria-label={label}>
      {rows}
      {grid}
      {items}
    </svg>
  );
}
