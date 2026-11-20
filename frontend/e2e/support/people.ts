import type { Page } from "@playwright/test";
import { UserApi } from "./api";
import { admin } from "./auth-links";
import {
  createE2eProfile,
  createE2eUser,
  type E2eUser,
} from "./test-user";

export interface Person {
  user: E2eUser;
  username: string;
  name: string;
  api: UserApi;
}

let counter = 0;

export async function person(
  label: string,
  role: "user" | "admin" = "user",
): Promise<Person> {
  counter += 1;
  const user = await createE2eUser();
  const username = `${label.toLowerCase().replace(/\W/g, "")}${counter}_${user.id.slice(0, 5)}`;
  const name = `User ${label} ${counter}`;
  await createE2eProfile(user, { username, display_name: name });
  if (role === "admin") {
    await admin().from("users").update({ role: "admin" }).eq("id", user.id);
  }
  let real: Promise<UserApi> | undefined;
  const api = new Proxy({} as UserApi, {
    get: (_target, prop) => {
      return async (...args: unknown[]) => {
        real ??= UserApi.for(user);
        const target = (await real) as unknown as Record<
          string | symbol,
          (...a: unknown[]) => unknown
        >;
        return target[prop](...args);
      };
    },
  });
  return { user, username, name, api };
}

export async function httpStatus(call: Promise<unknown>): Promise<number> {
  try {
    await call;
    return 200;
  } catch (error) {
    return Number(/-> (\d+)/.exec(String(error))?.[1] ?? 0);
  }
}

export async function publicProject(
  owner: Person,
  name: string,
): Promise<{ id: string; branchId: string }> {
  const project = await owner.api.createProject(name);
  await owner.api.putDraft(project.id, [{ id: `${name}-n1` }]);
  await owner.api.commit(project.branchId, "First idea");
  await admin()
    .from("projects")
    .update({ license: "CC-BY" })
    .eq("id", project.id);
  await owner.api.setVisibility(project.id, "public");
  return project;
}

export function wavBuffer(seconds: number): Buffer {
  const rate = 8000;
  const frames = Math.round(rate * seconds);
  const dataSize = frames * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < frames; i += 1) {
    buffer.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 9000), 44 + i * 2);
  }
  return buffer;
}

export async function seedSound(owner: Person, name: string): Promise<string> {
  const buffer = wavBuffer(1);
  const upload = (await owner.api.call(
    "POST",
    "/users/me/custom-sounds/upload-url",
    { durationSec: 1, sizeBytes: buffer.length },
  )) as { soundId: string; path: string };
  const { error } = await admin()
    .storage.from("custom-sounds")
    .upload(upload.path, buffer, { contentType: "audio/wav", upsert: true });
  if (error) throw new Error(`Seed upload failed: ${error.message}`);
  await owner.api.call("POST", "/users/me/custom-sounds", {
    soundId: upload.soundId,
    name,
    source: "uploaded",
  });
  return upload.soundId;
}

export async function ensurePlans(): Promise<void> {
  const db = admin();
  const { data: free } = await db
    .from("subscription_plans")
    .select("id")
    .eq("is_default", true)
    .maybeSingle();
  if (!free) {
    const { error } = await db.from("subscription_plans").insert({
      name: "Free",
      price_vnd: 0,
      features: {},
      is_active: true,
      is_default: true,
      sort_order: 0,
      description: "Free plan",
    });
    if (error) throw new Error(`Could not seed the free plan: ${error.message}`);
  }
  const { data: paid } = await db
    .from("subscription_plans")
    .select("id")
    .eq("name", "STAVE+")
    .maybeSingle();
  if (!paid) {
    const { error } = await db.from("subscription_plans").insert({
      name: "STAVE+",
      price_vnd: 49000,
      features: { extra_storage: true, theme_from_image: true },
      is_active: true,
      is_default: false,
      sort_order: 1,
      description: "Paid plan",
    });
    if (error) throw new Error(`Could not seed the paid plan: ${error.message}`);
  }
}

export function anyDialog(page: Page) {
  return page.locator('[role="dialog"]:not([data-nextjs-dialog]), [role="alertdialog"]');
}
