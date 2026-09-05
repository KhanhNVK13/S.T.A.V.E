import type { DraftSnapshot } from '@stave/shared-types';

export interface DraftRow {
  id: string;
  branch_id: string;
  snapshot: DraftSnapshot;
  updated_at: string;
}
