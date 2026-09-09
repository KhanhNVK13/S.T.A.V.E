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
}

export interface BranchRow {
  id: string;
  project_id: string;
  name: string;
  is_default: boolean;
  created_by: string;
  created_at: string;
  base_commit_id: string | null;
}
