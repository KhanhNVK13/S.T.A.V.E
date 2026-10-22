import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTestEnv } from "./env";
import { e2eEmail, TEST_PASSWORD } from "./test-user";

let client: SupabaseClient | undefined;

export function admin(): SupabaseClient {
  if (!client) {
    const env = requireTestEnv();
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}

export interface PendingUser {
  id: string;
  email: string;
  password: string;
}

export async function createPendingUser(
  label: string,
  password = TEST_PASSWORD,
): Promise<PendingUser> {
  const email = e2eEmail(label);
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: false,
  });
  if (error || !data.user) {
    throw new Error(`Could not create pending user: ${error?.message}`);
  }
  return { id: data.user.id, email, password };
}

export type LinkType = "signup" | "recovery" | "magiclink";

export async function actionLink(
  type: LinkType,
  email: string,
  password?: string,
): Promise<string> {
  const params =
    type === "signup"
      ? { type: "signup" as const, email, password: password ?? TEST_PASSWORD }
      : { type, email };
  const { data, error } = await admin().auth.admin.generateLink(params);
  if (error || !data.properties?.action_link) {
    throw new Error(`generateLink failed: ${error?.message}`);
  }
  return data.properties.action_link;
}

export async function resolveLink(
  link: string,
  appPath: string,
): Promise<string> {
  const res = await fetch(link, { redirect: "manual" });
  const location = res.headers.get("location");
  if (!location) throw new Error(`No redirect from verify link (${res.status})`);
  const hash = location.includes("#") ? location.slice(location.indexOf("#")) : "";
  const query =
    !hash && location.includes("?") ? location.slice(location.indexOf("?")) : "";
  return `http://localhost:3100${appPath}${hash || query}`;
}

export async function authUser(userId: string) {
  const { data, error } = await admin().auth.admin.getUserById(userId);
  if (error || !data.user) throw new Error(`getUserById failed: ${error?.message}`);
  return data.user;
}

export async function passwordLoginStatus(
  email: string,
  password: string,
): Promise<number> {
  const env = requireTestEnv();
  const res = await fetch(
    `${env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    },
  );
  return res.status;
}

export async function pendingWithLink(label: string, password = "Passw0rd!") {
  const email = e2eEmail(label);
  const link = await actionLink("signup", email, password);
  const list = await admin().auth.admin.listUsers({ perPage: 200 });
  const id = list.data.users.find((u) => u.email === email)!.id;
  return { id, email, password, link };
}

export function tampered(link: string): string {
  const url = new URL(link);
  const token = url.searchParams.get("token")!;
  url.searchParams.set(
    "token",
    token.slice(0, -1) + (token.endsWith("a") ? "b" : "a"),
  );
  return url.toString();
}
