export type UserStatus = 'active' | 'suspended' | 'removed';
export type UserRole = 'user' | 'admin';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  google_id: string | null;
  display_name: string;
  username: string;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  status: UserStatus;
  active_theme_id: string | null;
  role: UserRole;
}
