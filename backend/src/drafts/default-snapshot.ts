import { DRAFT_SCHEMA_VERSION, type DraftSnapshot } from '@stave/shared-types';

/** Snapshot mặc định khi project chưa từng ghi draft — tempo 120, 4/4, ppq 480. */
export function buildDefaultDraftSnapshot(): DraftSnapshot {
  return {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
    tracks: [],
    notes: [],
  };
}
