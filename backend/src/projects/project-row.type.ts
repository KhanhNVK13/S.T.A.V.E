export type ProjectVisibility = 'private' | 'public';
export type ProjectLicense = 'CC-BY' | 'CC-BY-SA' | 'CC-BY-NC';

export interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  visibility: ProjectVisibility;
  license: ProjectLicense | null;
  forked_from_project_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  moderation_hidden_at: string | null;
  moderation_hidden_reason: string | null;
  play_count: number;
  genre: string | null;
  /**
   * UC-48: branch mà editor đang mở cho project này. NULL cho tới lần chuyển
   * nhánh đầu tiên (`POST /branches/switch` là nơi duy nhất ghi cột này) —
   * khi NULL thì branch đang mở là branch mặc định.
   */
  active_branch_id: string | null;
}

export interface BranchRow {
  id: string;
  project_id: string;
  name: string;
  is_default: boolean;
  created_by: string;
  created_at: string;
  base_commit_id: string | null;
  /** Commit mới nhất của branch. NULL khi branch chưa có commit nào. */
  head_commit_id: string | null;
}
