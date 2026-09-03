export type UserStatus = "active" | "suspended" | "removed";
export type UserRole = "user" | "admin";

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  username: string;
  bio: string | null;
  avatar_url: string | null;
  status: UserStatus;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface SessionInfo {
  id: string;
  device_label: string | null;
  ip_address: string | null;
  created_at: string;
  last_active_at: string;
  revoked_at: string | null;
  isCurrent: boolean;
}
