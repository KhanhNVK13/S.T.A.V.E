import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { requireTestEnv } from "./env";

export const TEST_EMAIL_DOMAIN = "stave-test.invalid";
export const TEST_PASSWORD = "Test-Password-123!";

const runTag = process.env.TEST_RUN_TAG || randomBytes(3).toString("hex");

let client: SupabaseClient | undefined;

function adminClient(): SupabaseClient {
  if (!client) {
    const env = requireTestEnv();
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}

export function e2eEmail(label: string): string {
  return `e2e-${runTag}-${label}-${randomBytes(3).toString("hex")}@${TEST_EMAIL_DOMAIN}`;
}

export interface E2eUser {
  id: string;
  email: string;
  password: string;
}

export async function createE2eUser(): Promise<E2eUser> {
  const email = `e2e-${runTag}-${randomBytes(4).toString("hex")}@${TEST_EMAIL_DOMAIN}`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Could not create e2e user: ${error?.message}`);
  }
  return { id: data.user.id, email, password: TEST_PASSWORD };
}

async function expectOk(
  step: string,
  result: PromiseLike<{ error: { message: string } | null }>,
): Promise<void> {
  const { error } = await result;
  if (error) throw new Error(`Cleanup failed at ${step}: ${error.message}`);
}

async function purgeUser(userId: string, withAuth = true): Promise<void> {
  const admin = adminClient();
  const { data: projects, error } = await admin
    .from("projects")
    .select("id")
    .eq("owner_id", userId);
  if (error)
    throw new Error(`Cleanup failed at projects lookup: ${error.message}`);
  const projectIds = (projects ?? []).map((project) => project.id as string);

  if (projectIds.length > 0) {
    await expectOk(
      "commit_tags",
      admin.from("commit_tags").delete().in("project_id", projectIds),
    );
    await expectOk(
      "projects",
      admin.from("projects").delete().in("id", projectIds),
    );
  }
  await expectOk(
    "custom_sounds",
    admin.from("custom_sounds").delete().eq("owner_id", userId),
  );
  const { data: soundFiles } = await admin.storage
    .from("custom-sounds")
    .list(userId, { limit: 1000 });
  if (soundFiles && soundFiles.length > 0) {
    await admin.storage
      .from("custom-sounds")
      .remove(soundFiles.map((file) => `${userId}/${file.name}`));
  }
  await expectOk(
    "admin_audit_log",
    admin.from("admin_audit_log").delete().eq("admin_id", userId),
  );
  await expectOk("users", admin.from("users").delete().eq("id", userId));
  if (withAuth) {
    await expectOk("auth user", admin.auth.admin.deleteUser(userId));
  }
}

export interface E2eProfileFields {
  display_name?: string;
  username?: string;
  bio?: string | null;
  status?: "active" | "suspended" | "removed";
}

export async function createE2eProfile(
  user: E2eUser,
  fields: E2eProfileFields = {},
): Promise<void> {
  const username = fields.username ?? `u_${user.id.slice(0, 8)}`;
  const { error } = await adminClient()
    .from("users")
    .insert({
      id: user.id,
      email: user.email,
      display_name: fields.display_name ?? username,
      username,
      bio: fields.bio ?? null,
      status: fields.status ?? "active",
    });
  if (error) throw new Error(`Could not create e2e profile: ${error.message}`);
}

export async function fetchE2eProfile(userId: string): Promise<{
  display_name: string;
  username: string;
  bio: string | null;
} | null> {
  const { data, error } = await adminClient()
    .from("users")
    .select("display_name, username, bio")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Could not read e2e profile: ${error.message}`);
  return data;
}

export async function e2eUserExists(userId: string): Promise<boolean> {
  const { data } = await adminClient().auth.admin.getUserById(userId);
  return Boolean(data?.user);
}

export async function countProjectsOf(userId: string): Promise<number> {
  const { count, error } = await adminClient()
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId);
  if (error) throw new Error(`Could not count projects: ${error.message}`);
  return count ?? 0;
}

export async function createE2eProject(
  userId: string,
  name: string,
  visibility: "private" | "public" = "private",
  archived = false,
): Promise<string> {
  const { data, error } = await adminClient()
    .from("projects")
    .insert({
      owner_id: userId,
      name,
      visibility,
      archived_at: archived ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error || !data)
    throw new Error(`Could not create e2e project: ${error?.message}`);
  return data.id as string;
}

export interface E2eProjectRow {
  id: string;
  name: string;
  visibility: string;
  archived_at: string | null;
}

export async function listProjectsOf(userId: string): Promise<E2eProjectRow[]> {
  const { data, error } = await adminClient()
    .from("projects")
    .select("id, name, visibility, archived_at")
    .eq("owner_id", userId);
  if (error) throw new Error(`Could not list projects: ${error.message}`);
  return (data ?? []) as E2eProjectRow[];
}

export async function countCommitsOfProject(
  projectId: string,
): Promise<number> {
  const { data: branches } = await adminClient()
    .from("branches")
    .select("id")
    .eq("project_id", projectId);
  const ids = (branches ?? []).map((branch) => branch.id as string);
  if (ids.length === 0) return 0;
  const { count } = await adminClient()
    .from("commits")
    .select("id", { count: "exact", head: true })
    .in("branch_id", ids);
  return count ?? 0;
}

export async function countAccountsWithEmail(email: string): Promise<number> {
  const { data, error } = await adminClient().auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw new Error(`Could not list users: ${error.message}`);
  return data.users.filter((u) => u.email === email).length;
}

export async function cleanupE2eUsers(
  scope: "run" | "all" = "run",
): Promise<void> {
  const admin = adminClient();
  const prefix = scope === "run" ? `e2e-${runTag}-` : "e2e-";
  const suffix = `@${TEST_EMAIL_DOMAIN}`;

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error(`Cleanup lookup failed: ${error.message}`);
    const matches = data.users.filter(
      (user) => user.email?.startsWith(prefix) && user.email.endsWith(suffix),
    );
    for (const user of matches) {
      await purgeUser(user.id);
    }
    if (data.users.length < 1000) break;
  }

  const { data: orphans, error: orphanError } = await admin
    .from("users")
    .select("id")
    .like("email", `${prefix}%${suffix}`);
  if (orphanError)
    throw new Error(`Cleanup orphan lookup failed: ${orphanError.message}`);
  for (const orphan of orphans ?? []) {
    await purgeUser(orphan.id as string, false);
  }
}

export async function loginThroughUi(page: Page, user: E2eUser): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(user.password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname !== "/login");
  await page.waitForFunction(() =>
    Boolean(window.localStorage.getItem("stave_session_id")),
  );
}
