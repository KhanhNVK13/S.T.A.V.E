/**
 * Hình minh hoạ piano roll — THUẦN TRANG TRÍ (brand art cho trang đăng nhập).
 *
 * KHÔNG dùng component này để "xem trước" một project có thật: các nốt ở đây là
 * hình vẽ cố định, không đọc từ snapshot nào cả. Muốn hiện nội dung thật của
 * project thì phải vẽ từ `snapshot.notes` — bịa nốt cho project thật là bịa dữ
 * liệu (xem quy ước placeholder ở CLAUDE.md 4.7).
 */
const NOTES = [
  { x: 5, y: 18, w: 15, tone: "bg-accent" },
  { x: 15, y: 50, w: 8, tone: "bg-metal" },
  { x: 26, y: 34, w: 13, tone: "bg-success" },
  { x: 42, y: 67, w: 10, tone: "bg-accent" },
  { x: 53, y: 25, w: 17, tone: "bg-metal" },
  { x: 72, y: 42, w: 9, tone: "bg-success" },
  { x: 84, y: 16, w: 12, tone: "bg-accent" },
];

export function MiniRoll({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`relative min-h-[220px] overflow-hidden bg-surface-subtle ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--border) 60%, transparent) 1px, transparent 1px)",
        backgroundSize: "12.5% 100%, 100% 24px",
      }}
    >
      <div className="grid h-[25px] grid-cols-4 border-b border-border px-2.5 py-[7px] font-mono text-[10px] text-muted">
        <span>1</span>
        <span>2</span>
        <span>3</span>
        <span>4</span>
      </div>
      {NOTES.map((note, i) => (
        <span
          key={i}
          className={`absolute h-3 rounded-sm ${note.tone}`}
          style={{ left: `${note.x}%`, top: `${note.y}%`, width: `${note.w}%` }}
        />
      ))}
      <span className="absolute bottom-0 left-[48%] top-[25px] w-px bg-accent" />
    </div>
  );
}
