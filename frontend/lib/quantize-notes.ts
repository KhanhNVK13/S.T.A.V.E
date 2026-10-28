import type { DraftNote } from "@stave/shared-types";

export interface QuantizeResult {
  notes: DraftNote[];
  moved: number;
  collisions: number;
}

export function quantizeNotes(
  notes: DraftNote[],
  step: number,
  targetIds: ReadonlySet<string> | null,
): QuantizeResult {
  const isTarget = (n: DraftNote) => targetIds === null || targetIds.has(n.id);
  const key = (n: { trackId: string; pitch: number }, start: number) =>
    `${n.trackId}:${n.pitch}:${start}`;

  const snapStart = (n: DraftNote) => Math.max(0, Math.round(n.start / step) * step);

  const occupied = new Set<string>();
  for (const n of notes) {
    if (!isTarget(n) || snapStart(n) === n.start) occupied.add(key(n, n.start));
  }

  const resolved = new Map<string, DraftNote>();
  let moved = 0;
  let collisions = 0;

  const ordered = notes.filter(isTarget).sort((a, b) => a.start - b.start);
  for (const n of ordered) {
    const start = snapStart(n);
    const duration = Math.max(step, Math.round(n.duration / step) * step);
    if (start !== n.start && occupied.has(key(n, start))) {
      occupied.add(key(n, n.start));
      resolved.set(n.id, n);
      collisions += 1;
      continue;
    }
    occupied.add(key(n, start));
    if (start !== n.start || duration !== n.duration) {
      moved += 1;
      resolved.set(n.id, { ...n, start, duration });
    } else {
      resolved.set(n.id, n);
    }
  }

  return { notes: notes.map((n) => resolved.get(n.id) ?? n), moved, collisions };
}

export function describeQuantize(result: QuantizeResult, scopeLabel: string): {
  message: string;
  variant: "success" | "warning" | "info";
} {
  if (result.moved === 0 && result.collisions === 0) {
    return { message: `Không có nốt nào cần căn (${scopeLabel} đã nằm đúng lưới).`, variant: "info" };
  }
  const parts = [`Đã căn ${result.moved} nốt vào lưới (${scopeLabel}).`];
  if (result.collisions > 0) {
    parts.push(
      `${result.collisions} nốt được giữ nguyên vị trí vì sẽ trùng một nốt cùng cao độ đã có ở vị trí đó.`,
    );
  }
  return { message: parts.join(" "), variant: result.collisions > 0 ? "warning" : "success" };
}
