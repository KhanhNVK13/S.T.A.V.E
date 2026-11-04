import { expect as baseExpect, test, type Page } from "@playwright/test";
import { deflateSync } from "node:zlib";
import { UserApi } from "./support/api";
import { admin } from "./support/auth-links";
import { testSql } from "./support/test-sql";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  fetchE2eProfile,
  loginThroughUi,
  type E2eUser,
} from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });
const TWO_MB = 2 * 1024 * 1024;

async function profiled(fields: { display_name?: string; username?: string; bio?: string } = {}) {
  const user = await createE2eUser();
  await createE2eProfile(user, {
    display_name: fields.display_name ?? "User A",
    username: fields.username ?? `user_a_${user.id.slice(0, 6)}`,
    bio: fields.bio ?? "Test bio",
  });
  return user;
}

function crc32(buf: Buffer) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width: number, height: number, targetBytes?: number) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let i = 0; i < raw.length; i += 1) raw[i] = (i * 2654435761) >>> 24;
  for (let y = 0; y < height; y += 1) raw[y * (width * 3 + 1)] = 0;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const head = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 0 })),
  ]);
  const end = chunk("IEND", Buffer.alloc(0));
  if (!targetBytes) return Buffer.concat([head, end]);
  const padLen = targetBytes - head.length - end.length - 12;
  if (padLen < 0) throw new Error("png already larger than target");
  return Buffer.concat([head, chunk("pdNg", Buffer.alloc(padLen)), end]);
}

function padJpeg(jpeg: Buffer, targetBytes: number) {
  const segments: Buffer[] = [];
  let missing = targetBytes - jpeg.length;
  while (missing > 0) {
    const size = Math.min(missing, 65537);
    const dataLen = Math.max(size - 4, 0);
    const seg = Buffer.alloc(dataLen + 4);
    seg[0] = 0xff;
    seg[1] = 0xfe;
    seg.writeUInt16BE(dataLen + 2, 2);
    segments.push(seg);
    missing -= seg.length;
  }
  return Buffer.concat([jpeg.subarray(0, 2), ...segments, jpeg.subarray(2)]);
}

function padWebp(webp: Buffer, targetBytes: number) {
  const padLen = targetBytes - webp.length - 8;
  const pad = Buffer.alloc(8 + padLen);
  pad.write("JUNK", 0, "ascii");
  pad.writeUInt32LE(padLen, 4);
  const out = Buffer.concat([webp, pad]);
  out.writeUInt32LE(out.length - 8, 4);
  return out;
}

async function encode(page: Page, type: "image/jpeg" | "image/webp", side: number, quality: number) {
  const base64 = await page.evaluate(
    async ({ type, side, quality }) => {
      const canvas = document.createElement("canvas");
      canvas.width = side;
      canvas.height = side;
      const ctx = canvas.getContext("2d")!;
      const img = ctx.createImageData(side, side);
      for (let i = 0; i < img.data.length; i += 4) {
        img.data[i] = (i * 13) % 251;
        img.data[i + 1] = (i * 7) % 241;
        img.data[i + 2] = (i * 3) % 239;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), type, quality));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = "";
      for (const b of bytes) s += String.fromCharCode(b);
      return btoa(s);
    },
    { type, side, quality },
  );
  return Buffer.from(base64, "base64");
}

async function openProfile(page: Page) {
  await page.goto("/profile");
  await expect(page.locator('input[name="displayName"]')).not.toHaveValue("");
}

async function upload(page: Page, name: string, mimeType: string, buffer: Buffer) {
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer });
}

async function storedAvatarSize(userId: string) {
  const profile = (await admin().from("users").select("avatar_url").eq("id", userId).single()).data as { avatar_url: string | null };
  if (!profile.avatar_url) return null;
  const res = await fetch(profile.avatar_url);
  const bytes = Buffer.from(await res.arrayBuffer());
  return { url: profile.avatar_url, bytes };
}

test.describe("Account and profile", () => {
  test.setTimeout(150_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test("Blocked by DFID163, AUTH-050 ending another device's session starts the remote log out and keeps this browser signed in", async ({ page, browser }) => {
    test.fail(true, "DFID163: the other session is ended at once, without a confirmation naming the device");
    const user = await profiled();
    const other = await (await browser.newContext()).newPage();
    await loginThroughUi(other, user);
    await loginThroughUi(page, user);
    await page.goto("/profile/sessions");
    await page.locator("main").getByRole("button", { name: "Đăng xuất" }).first().click();
    await expect(page).toHaveURL(/\/profile\/sessions/);
    await expect(page.getByRole("button", { name: "Bảo mật" }).or(page.getByRole("heading", { name: "Thiết bị đang đăng nhập" })).first()).toBeVisible();
    await expect(page.getByRole("alertdialog").or(page.getByRole("dialog"))).toBeVisible({ timeout: 5_000 });
    await other.context().close();
  });

  test("AUTH-056 saves a new display name, username, biography and avatar", async ({ page }) => {
    const user = await profiled();
    await loginThroughUi(page, user);
    await openProfile(page);
    const username = `alice_tester_${user.id.slice(0, 4)}`;
    await page.locator('input[name="displayName"]').fill("Alice Tester");
    await page.locator('input[name="username"]').fill(username);
    await page.locator('textarea[name="bio"]').fill("Composer of test songs.");
    await upload(page, "avatar_1MB.png", "image/png", png(400, 400, 1024 * 1024));
    await expect(page.getByText("Đã cập nhật ảnh đại diện.")).toBeVisible();
    await page.getByRole("button", { name: "Lưu hồ sơ" }).click();
    await expect(page.getByText("Đã lưu.")).toBeVisible();
    await page.reload();
    await expect(page.locator('input[name="displayName"]')).toHaveValue("Alice Tester");
    await expect(page.locator('input[name="username"]')).toHaveValue(username);
    await expect(page.locator('textarea[name="bio"]')).toHaveValue("Composer of test songs.");
    await expect(page.getByRole("banner")).toContainText("Alice Tester");
    expect((await storedAvatarSize(user.id))?.bytes.length).toBeGreaterThan(0);
    await page.goto(`/creator/${user.id}`);
    await expect(page.getByText("Alice Tester").first()).toBeVisible();
    await expect(page.getByText(`@${username}`).first()).toBeVisible();
  });

  test("AUTH-057 removing the avatar replaces it with the default avatar", async ({ page }) => {
    const user = await profiled();
    await loginThroughUi(page, user);
    await openProfile(page);
    await upload(page, "a.png", "image/png", png(300, 300));
    await expect(page.getByText("Đã cập nhật ảnh đại diện.")).toBeVisible();
    await page.getByRole("button", { name: "Xoá ảnh" }).click();
    await expect(page.getByText("Đã xoá ảnh đại diện.")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Xoá ảnh" })).toHaveCount(0);
    const profile = (await admin().from("users").select("avatar_url").eq("id", user.id).single()).data as { avatar_url: string | null };
    expect(profile.avatar_url).toBeNull();
  });

  test("Blocked by DFID134, AUTH-058 Cancel discards unsaved profile changes", async ({ page }) => {
    test.fail(true, "DFID134: the profile form has no Cancel action");
    const user = await profiled();
    await loginThroughUi(page, user);
    await openProfile(page);
    await page.locator('input[name="displayName"]').fill("Alice Tester");
    await page.locator('textarea[name="bio"]').fill("Changed");
    await page.reload();
    expect((await fetchE2eProfile(user.id))).toMatchObject({ display_name: "User A", bio: "Test bio" });
    await page.locator('input[name="displayName"]').fill("Alice Tester");
    await page.getByRole("button", { name: /^huỷ$/i }).click({ timeout: 5_000 });
    await expect(page.locator('input[name="displayName"]')).toHaveValue("User A");
  });

  test("AUTH-061 saving is blocked when the biography exceeds 500 characters", async ({ page }) => {
    const user = await profiled();
    await loginThroughUi(page, user);
    await openProfile(page);
    await page.locator('textarea[name="bio"]').fill("b".repeat(501));
    await expect(page.getByText("501/500")).toHaveClass(/text-danger/);
    await page.getByRole("button", { name: "Lưu hồ sơ" }).click();
    await expect(page.getByText("Giới thiệu tối đa 500 ký tự.")).toBeVisible();
    expect((await fetchE2eProfile(user.id))?.bio).toBe("Test bio");
  });

  test("AUTH-062 a GIF avatar is rejected with the accepted types and the size limit", async ({ page }) => {
    const user = await profiled();
    await loginThroughUi(page, user);
    await openProfile(page);
    const gif = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(500 * 1024)]);
    await upload(page, "avatar.gif", "image/gif", gif);
    await expect(page.getByText("Ảnh đại diện chỉ nhận file JPG, PNG hoặc WebP.")).toBeVisible();
    expect((await storedAvatarSize(user.id))).toBeNull();
    await expect(page.getByText(/2 ?MB/).first()).toBeVisible({ timeout: 5_000 });
  });

  test("Blocked by DFID135, AUTH-063 an avatar larger than 2 MB is rejected", async ({ page }) => {
    test.fail(true, "DFID135: originals up to 10 MB are accepted and resized");
    const user = await profiled();
    await loginThroughUi(page, user);
    await openProfile(page);
    await upload(page, "avatar_3MB.png", "image/png", png(600, 600, 3 * 1024 * 1024));
    await page.waitForTimeout(5_000);
    expect(await storedAvatarSize(user.id)).toBeNull();
  });

  test("AUTH-064 JPG, PNG and WebP avatars of exactly 2 MB are accepted and stored at 256x256", async ({ page }) => {
    const user = await profiled();
    await loginThroughUi(page, user);
    await openProfile(page);
    const jpeg = padJpeg(await encode(page, "image/jpeg", 600, 0.9), TWO_MB);
    const webp = padWebp(await encode(page, "image/webp", 600, 0.9), TWO_MB);
    const files: Array<[string, string, Buffer]> = [
      ["avatar_2MB.jpg", "image/jpeg", jpeg],
      ["avatar_2MB.png", "image/png", png(600, 600, TWO_MB)],
      ["avatar_2MB.webp", "image/webp", webp],
    ];
    let previous: string | null = null;
    for (const [name, mime, buffer] of files) {
      expect(buffer.length).toBe(TWO_MB);
      await upload(page, name, mime, buffer);
      await expect(page.getByText("Đã cập nhật ảnh đại diện.")).toBeVisible();
      await expect.poll(async () => (await storedAvatarSize(user.id))?.url).not.toBe(previous);
      const stored = (await storedAvatarSize(user.id))!;
      previous = stored.url;
      const dims = await page.evaluate(async (b64) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes]));
        return [bitmap.width, bitmap.height];
      }, stored.bytes.toString("base64"));
      expect(dims).toEqual([256, 256]);
      await page.reload();
      await expect(page.locator('input[name="displayName"]')).not.toHaveValue("");
    }
  });

  test("Blocked by DFID156, AUTH-069 mismatched new password fields are rejected", async ({ page }) => {
    test.fail(true, "DFID156: the change-password form has no confirmation field");
    const user = await profiled();
    await loginThroughUi(page, user);
    await page.goto("/profile");
    await page.getByRole("button", { name: /bảo mật/i }).click();
    await page.getByRole("button", { name: /^đổi mật khẩu$/i }).click();
    await page.locator('input[name="current-password"]').fill(user.password);
    await page.locator('input[name="new-password"]').fill("NewPassw0rd!");
    const confirmField = page.locator('input[name="confirm-password"], input[name="confirmPassword"], input[name="new-password-confirm"]');
    await expect(confirmField).toHaveCount(1, { timeout: 5_000 });
    await confirmField.first().fill("NewPassw0rd?");
    await page.getByRole("button", { name: /cập nhật mật khẩu/i }).click();
    await expect(page.getByText(/không khớp/i).first()).toBeVisible();
    const api = await UserApi.for(user);
    expect(api).toBeTruthy();
  });

  test("AUTH-073 cancelling the delete account dialog changes nothing", async ({ page }) => {
    const user = await profiled();
    const api = await UserApi.for(user);
    const project = await api.createProject("Delete Me Song");
    await api.putDraft(project.id, [{ id: "n1" }]);
    await api.commit(project.branchId, "One");
    await api.putDraft(project.id, [{ id: "n1" }, { id: "n2", start: 480 }]);
    await api.commit(project.branchId, "Two");
    await loginThroughUi(page, user);
    await page.goto("/profile");
    await page.getByRole("button", { name: /bảo mật/i }).click();
    await page.getByRole("button", { name: /^xoá tài khoản$/i }).click();
    await expect(page.getByRole("button", { name: "Xác nhận xoá vĩnh viễn" })).toBeVisible();
    await page.locator("main").getByRole("button", { name: /^huỷ$/i }).click();
    await expect(page.getByRole("button", { name: "Xác nhận xoá vĩnh viễn" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^xoá tài khoản$/i })).toBeVisible();
    expect(await fetchE2eProfile(user.id)).not.toBeNull();
    expect(await api.history(project.branchId)).toHaveLength(2);
  });

  test("Blocked by DFID160, AUTH-077 other users' forks and the deleted user's comments survive account deletion", async () => {
    test.fail(true, "DFID160: comments.author_id cascades on delete, so the deleted user's comments are removed");
    const del = await profiled({ display_name: "Delete Zero One" });
    const delApi = await UserApi.for(del);
    const shared = await delApi.createProject("Shared Song");
    await delApi.putDraft(shared.id, [{ id: "n1" }, { id: "k1", pitch: 36, start: 480 }]);
    await delApi.commit(shared.branchId, "Beat");
    await delApi.setVisibility(shared.id, "public");
    const b = await profiled({ display_name: "User B" });
    const bApi = await UserApi.for(b);
    const fork = (await bApi.call("POST", `/projects/${shared.id}/fork`)) as { id: string };
    const pub = await bApi.createProject("Public Song");
    await bApi.putDraft(pub.id, [{ id: "p1" }]);
    const bUsername = (await fetchE2eProfile(b.id))!.username;
    const delUsername = (await fetchE2eProfile(del.id))!.username;
    await bApi.call("POST", `/projects/${pub.id}/collaborators`, { identifier: delUsername, permissionLevel: "view" });
    const [inv] = (await delApi.call("GET", "/users/me/collaboration-invitations")) as Array<{ id: string }>;
    await delApi.call("POST", `/users/me/collaboration-invitations/${inv.id}/accept`);
    await delApi.call("POST", `/projects/${pub.id}/comments`, { body: "Nice groove" });
    expect(bUsername).toBeTruthy();

    await delApi.call("DELETE", "/auth/account", { password: del.password });

    const forkMain = (await bApi.branches(fork.id)).find((x) => x.is_default)!.id;
    expect(await bApi.history(forkMain)).toHaveLength(1);
    expect((await bApi.draft(fork.id)).notes.map((n) => n.id).sort()).toEqual(["k1", "n1"]);
    const comments = (await bApi.call("GET", `/projects/${pub.id}/comments`)) as Array<{ body: string; author: { id: string | null; displayName: string | null } }>;
    const kept = comments.find((c) => c.body === "Nice groove");
    expect(kept).toBeTruthy();
    expect(kept!.author.displayName ?? "").not.toBe("Delete Zero One");
  });

  test("Blocked by DFID136, AUTH-098 permitted requests proceed and refused ones are recorded", async () => {
    test.fail(true, "DFID136: refused requests are not recorded anywhere");
    const a = await UserApi.for(await profiled());
    const bUser = await profiled({ display_name: "User B" });
    const cUser = await profiled({ display_name: "User C" });
    const b = await UserApi.for(bUser);
    const c = await UserApi.for(cUser);
    const project = await a.createProject("Test Song");
    await a.putDraft(project.id, [{ id: "n1" }, { id: "a1", start: 480 }]);
    await a.call("POST", `/projects/${project.id}/collaborators`, { identifier: (await fetchE2eProfile(bUser.id))!.username, permissionLevel: "edit" });
    const [inv] = (await b.call("GET", "/users/me/collaboration-invitations")) as Array<{ id: string }>;
    await b.call("POST", `/users/me/collaboration-invitations/${inv.id}/accept`);
    await b.putDraft(project.id, [{ id: "n1" }, { id: "b1", start: 960 }]);
    let refused = 0;
    try {
      await c.call("GET", `/projects/${project.id}/draft`);
    } catch (error) {
      refused = Number(/-> (\d+)/.exec(String(error))?.[1]);
      expect(String(error)).not.toContain('"notes"');
    }
    expect(refused).toBe(403);
    const tables = testSql(
      "select string_agg(table_name, ',') from information_schema.tables where table_schema = 'public' and (table_name like '%denied%' or table_name like '%access_log%' or table_name like '%security%')",
    );
    expect(tables).not.toBe("");
  });

  test("AUTH-101 a request with an ended session is refused and the user is asked to sign in again", async ({ page }) => {
    const user = await profiled();
    const api = await UserApi.for(user);
    const project = await api.createProject("Test Song");
    await loginThroughUi(page, user);
    await page.goto("/projects");
    const sessionId = await page.evaluate(() => window.localStorage.getItem("stave_session_id"));
    await admin().from("sessions").update({ revoked_at: new Date().toISOString() }).eq("id", sessionId!);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByText(/Hãy đăng nhập lại/).first()).toBeVisible();
    await expect(page.getByText("Test Song")).toHaveCount(0);
  });

  test("AUTH-105 direct API requests are checked like interface requests", async ({ page }) => {
    const owner = await profiled({ display_name: "Owner" });
    const ownerApi = await UserApi.for(owner);
    const bUser = await profiled({ display_name: "User B" });
    const b = await UserApi.for(bUser);
    const project = await ownerApi.createProject("Test Song");
    await ownerApi.putDraft(project.id, [{ id: "n1" }]);
    await ownerApi.call("POST", `/projects/${project.id}/collaborators`, { identifier: (await fetchE2eProfile(bUser.id))!.username, permissionLevel: "view" });
    const [inv] = (await b.call("GET", "/users/me/collaboration-invitations")) as Array<{ id: string }>;
    await b.call("POST", `/users/me/collaboration-invitations/${inv.id}/accept`);
    const before = await ownerApi.history(project.branchId);
    await expect(b.commit(project.branchId, "Sneaky")).rejects.toThrow(/403/);
    expect(await ownerApi.history(project.branchId)).toEqual(before);
    const aUser = await profiled();
    const a = await UserApi.for(aUser);
    await expect(a.call("GET", "/admin/users")).rejects.toThrow(/403/);
    await loginThroughUi(page, aUser);
    await page.goto("/admin/users");
    await expect(page.getByText(/Không có quyền|không có quyền/).first()).toBeVisible();
    await expect(page.getByText("@" + (await fetchE2eProfile(owner.id))!.username)).toHaveCount(0);
  });

  test("NFR-017 passwords are stored only as salted hashes", async () => {
    const one = await createE2eUser();
    const two = await createE2eUser();
    const rows = testSql(
      `select encrypted_password from auth.users where id in ('${one.id}', '${two.id}') order by id`,
    ).split("\n").map((r) => r.trim()).filter(Boolean);
    expect(rows).toHaveLength(2);
    for (const hash of rows) {
      expect(hash).not.toContain(one.password);
      expect(hash).toMatch(/^\$2[aby]\$\d\d\$/);
    }
    expect(rows[0]).not.toBe(rows[1]);
  });
});
