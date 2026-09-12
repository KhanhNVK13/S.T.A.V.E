/**
 * redesign/change-summary.ts
 * Đếm thay đổi giữa snapshot của commit gần nhất và bản nháp đang sửa — dùng
 * cho dialog Commit (UC-42) để người dùng biết mình sắp ghi lại cái gì.
 *
 * CỐ Ý chỉ ĐẾM, không dựng diff trực quan: phần diff đầy đủ (gom theo bar,
 * vẽ lên piano roll) thuộc UC-45 Compare — backend đã có `GET /commits/diff`
 * nhưng UI của nó là việc của phiên sau, không làm ở đây.
 *
 * Đối chiếu theo `id` của note/track (CLAUDE.md 4.1: note có UUID bền vững qua
 * mọi lần sửa — đây chính là điều kiện làm cho phép đếm "sửa" khác "xoá rồi
 * thêm mới" có nghĩa).
 */
import type { DraftNote, DraftSnapshot, DraftTrack } from "@stave/shared-types";

export interface ChangeCount {
  added: number;
  removed: number;
  modified: number;
}

export interface ChangeSummary {
  notes: ChangeCount;
  tracks: ChangeCount;
  /** Tempo/nhịp/ppq có đổi không — không nằm trong 2 nhóm đếm trên. */
  metaChanged: boolean;
  /** Tổng số thay đổi; 0 nghĩa là giống hệt commit gần nhất (backend sẽ chặn bằng BR-40). */
  total: number;
}

function noteIsEqual(a: DraftNote, b: DraftNote): boolean {
  return (
    a.trackId === b.trackId &&
    a.pitch === b.pitch &&
    a.start === b.start &&
    a.duration === b.duration &&
    a.velocity === b.velocity
  );
}

function trackIsEqual(a: DraftTrack, b: DraftTrack): boolean {
  return (
    a.name === b.name &&
    a.order === b.order &&
    a.color === b.color &&
    a.muted === b.muted &&
    a.solo === b.solo &&
    a.volume === b.volume &&
    a.pan === b.pan &&
    a.instrument === b.instrument
  );
}

function countChanges<T extends { id: string }>(
  base: T[],
  next: T[],
  isEqual: (a: T, b: T) => boolean,
): ChangeCount {
  const baseById = new Map(base.map((item) => [item.id, item]));
  let added = 0;
  let modified = 0;

  for (const item of next) {
    const before = baseById.get(item.id);
    if (!before) added += 1;
    else if (!isEqual(before, item)) modified += 1;
  }

  const nextIds = new Set(next.map((item) => item.id));
  const removed = base.filter((item) => !nextIds.has(item.id)).length;

  return { added, removed, modified };
}

function metaIsEqual(a: DraftSnapshot["meta"], b: DraftSnapshot["meta"]): boolean {
  return (
    a.tempo === b.tempo &&
    a.ppq === b.ppq &&
    a.timeSignature[0] === b.timeSignature[0] &&
    a.timeSignature[1] === b.timeSignature[1]
  );
}

export function summarizeChanges(
  base: DraftSnapshot,
  next: DraftSnapshot,
): ChangeSummary {
  const notes = countChanges(base.notes, next.notes, noteIsEqual);
  const tracks = countChanges(base.tracks, next.tracks, trackIsEqual);
  const metaChanged = !metaIsEqual(base.meta, next.meta);

  const total =
    notes.added + notes.removed + notes.modified +
    tracks.added + tracks.removed + tracks.modified +
    (metaChanged ? 1 : 0);

  return { notes, tracks, metaChanged, total };
}
