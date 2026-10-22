import { readFile } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { Midi } from "@tonejs/midi";
import { createClient } from "@supabase/supabase-js";
import {
  expect as baseExpect,
  test,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import { snapshotOf, UserApi, type NoteSeed } from "./support/api";
import { admin } from "./support/auth-links";
import { requireTestEnv } from "./support/env";
import { BAR, pickTool, point, scrollGrid } from "./support/piano-roll";
import { testSql } from "./support/test-sql";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  loginThroughUi,
  type E2eUser,
} from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });
const quick = { timeout: 5_000 };
const saved = { timeout: 20_000 };
const BACKEND = "http://localhost:3101";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface Actor {
  user: E2eUser;
  api: UserApi;
}

interface DraftNote {
  id: string;
  pitch: number;
  start: number;
}

async function makeActor(role?: "admin"): Promise<Actor> {
  const user = await createE2eUser();
  await createE2eProfile(user);
  if (role) await admin().from("users").update({ role }).eq("id", user.id);
  return { user, api: await UserApi.for(user) };
}

async function songWithCommit(actor: Actor, notes: NoteSeed[] = [{ id: "n1" }]) {
  const project = await actor.api.createProject("Test Song");
  await actor.api.putDraft(project.id, notes);
  const commit = await actor.api.commit(project.branchId, "Verse idea");
  return { ...project, commit };
}

async function openEditor(page: Page, projectId: string): Promise<void> {
  await page.goto(`/projects/${projectId}/edit`);
  await page.getByRole("button", { name: /^File$/ }).waitFor();
  await page.waitForLoadState("networkidle");
}

async function draftNotes(api: UserApi, projectId: string): Promise<DraftNote[]> {
  return (await api.draft(projectId)).notes;
}

async function drawNotes(page: Page, ticks: number[], pitch = 64) {
  await pickTool(page, "Draw");
  const g = await scrollGrid(page, { pitch });
  for (const tick of ticks) {
    const p = point(g, tick + 30, pitch);
    await page.mouse.click(p.x, p.y);
  }
}

async function commitThroughUi(page: Page, message: string) {
  await page.getByRole("button", { name: /commit changes/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#commit-message").fill(message);
  await dialog.getByRole("button", { name: /tạo commit/i }).click();
  return dialog;
}

async function status(
  method: string,
  route: string,
  token?: string,
  sessionId?: string,
  body?: unknown,
) {
  const res = await fetch(`${BACKEND}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(sessionId ? { "X-Session-Id": sessionId } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.text() };
}

async function apiStatus(api: UserApi, method: string, route: string, body?: unknown) {
  try {
    const data = await api.call(method, route, body);
    return { status: 200, body: JSON.stringify(data) };
  } catch (error) {
    const match = /-> (\d+) ([\s\S]*)$/.exec(String((error as Error).message));
    return { status: Number(match?.[1] ?? 0), body: match?.[2] ?? "" };
  }
}

async function accessToken(user: E2eUser): Promise<string> {
  const env = requireTestEnv();
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  return ((await res.json()) as { access_token: string }).access_token;
}

async function tabTo(page: Page, target: Locator, limit = 60): Promise<void> {
  for (let i = 0; i < limit; i += 1) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("element not reachable with Tab");
}

function commitStats() {
  return testSql(
    "select n_tup_upd || ',' || n_tup_del from pg_stat_user_tables where schemaname = 'public' and relname = 'commits'",
  );
}

test.describe("Non-functional requirements", () => {
  test.setTimeout(240_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test("NFR-013 the latest autosaved draft is recovered after the browser closes", async ({
    browser,
  }) => {
    test.fail(
      true,
      "DFID047: the draft is restored silently after the browser is reopened; no notice says that unsaved changes were recovered or when they were saved",
    );
    const actor = await makeActor();
    const { id, branchId } = await songWithCommit(actor, [{ id: "n1", pitch: 60 }]);

    const first = await newSession(browser, actor.user);
    await openEditor(first, id);
    await drawNotes(first, [BAR, BAR + 480, BAR + 960]);
    await expect
      .poll(async () => (await draftNotes(actor.api, id)).length, saved)
      .toBe(4);
    await first.context().close();

    const second = await newSession(browser, actor.user);
    await openEditor(second, id);
    await expect(second.getByText(/^4 note/)).toBeVisible();
    expect(await actor.api.history(branchId)).toHaveLength(1);
    await expect(
      second.getByText(/khôi phục|recovered|chưa commit.*lưu lúc/i).first(),
    ).toBeVisible(quick);
    await second.context().close();
  });

  test("NFR-014 committed versions never change after later edits, merges or restores", async () => {
    const actor = await makeActor();
    const { id, branchId, commit } = await songWithCommit(actor, [
      { id: "n1", pitch: 60 },
      { id: "n2", pitch: 64, start: 480 },
    ]);
    const exported = JSON.stringify(
      ((await actor.api.call("GET", `/commits/${commit.id}`)) as { snapshot: unknown })
        .snapshot,
    );
    const statsBefore = commitStats();

    await actor.api.putDraft(id, [
      { id: "n1", pitch: 62 },
      { id: "n3", pitch: 67, start: 960 },
    ]);
    await actor.api.commit(branchId, "Edit melody");
    const feature = await actor.api.createBranch(id, "feature");
    await actor.api.commitOnBranch(
      id,
      branchId,
      feature.id,
      [
        { id: "n1", pitch: 62 },
        { id: "n3", pitch: 67, start: 960 },
        { id: "n4", pitch: 72, start: 1920 },
      ],
      "Add bridge",
    );
    await actor.api.merge(feature.id, branchId);
    await actor.api.restore(commit.id, branchId);

    const again = JSON.stringify(
      ((await actor.api.call("GET", `/commits/${commit.id}`)) as { snapshot: unknown })
        .snapshot,
    );
    expect(again).toBe(exported);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    expect(commitStats()).toBe(statsBefore);
  });

  test("NFR-015 two tabs editing the same project do not overwrite each other silently", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID110: the second tab is told to reload, but its autosave has already replaced the shared draft, so after reloading and committing the note committed from the first tab is gone from the latest version",
    );
    const actor = await makeActor();
    const { id, branchId } = await songWithCommit(actor, [{ id: "n1", pitch: 60 }]);
    await page.setViewportSize({ width: 1280, height: 720 });
    await loginThroughUi(page, actor.user);
    const tab2 = await page.context().newPage();
    await tab2.setViewportSize({ width: 1280, height: 720 });
    await openEditor(page, id);
    await openEditor(tab2, id);

    await drawNotes(page, [BAR], 64);
    await expect(page.getByText("Đã lưu nháp").first()).toBeVisible(saved);
    await expect(await commitThroughUi(page, "Tab one note")).toHaveCount(0);

    await drawNotes(tab2, [2 * BAR], 67);
    const dialog = await commitThroughUi(tab2, "Tab two note");
    await expect(dialog.getByText(/commit mới từ nơi khác|tải lại trang/i)).toBeVisible();

    await tab2.reload();
    await tab2.getByRole("button", { name: /^File$/ }).waitFor();
    await tab2.waitForLoadState("networkidle");
    await expect(await commitThroughUi(tab2, "Tab two note")).toHaveCount(0);

    const history = await actor.api.history(branchId);
    expect(history.map((c) => c.message).slice(0, 2)).toEqual(["Tab two note", "Tab one note"]);
    const latest = await actor.api.commitSnapshot(history[0].id);
    const pitches = latest.notes.map((n) => n.pitch).sort();
    expect(pitches).toEqual([60, 64, 67]);
  });

  test("NFR-018 API endpoints enforce roles when called directly", async () => {
    test.fail(
      true,
      "DFID113: three endpoints answer a private project of another user differently from a random ID (branch list 403, commit 403, commit list 400 instead of 404), which reveals that the project exists",
    );
    const owner = await makeActor();
    const other = await makeActor();
    const { id, branchId, commit } = await songWithCommit(owner);
    await owner.api.setVisibility(id, "private");
    const random = "00000000-0000-4000-8000-000000000000";

    for (const route of [
      "/projects",
      `/projects/${id}`,
      `/projects/${id}/draft`,
      `/commits?branch_id=${branchId}`,
      "/admin/users",
    ]) {
      expect((await status("GET", route)).status, route).toBe(401);
    }

    const probes: Array<[string, (target: string) => string, unknown?]> = [
      ["GET", (p) => `/projects/${p}`],
      ["GET", (p) => `/projects/${p}/draft`],
      ["GET", (p) => `/projects/${p}/branches`],
      ["PATCH", (p) => `/projects/${p}`, { name: "Hijacked" }],
      ["PUT", (p) => `/projects/${p}/draft`, snapshotOf([])],
    ];
    for (const [method, route, body] of probes) {
      const real = await apiStatus(other.api, method, route(id), body);
      const missing = await apiStatus(other.api, method, route(random), body);
      expect(real.status, `${method} ${route(id)}`).toBeGreaterThanOrEqual(400);
      expect.soft(real, `${method} ${route(id)}`).toEqual(missing);
    }
    const commitReal = await apiStatus(other.api, "GET", `/commits/${commit.id}`);
    const commitMissing = await apiStatus(other.api, "GET", `/commits/${random}`);
    expect(commitReal.status).toBeGreaterThanOrEqual(400);
    expect.soft(commitReal).toEqual(commitMissing);
    const listReal = await apiStatus(other.api, "GET", `/commits?branch_id=${branchId}`);
    const listMissing = await apiStatus(other.api, "GET", `/commits?branch_id=${random}`);
    expect(listReal.status).toBeGreaterThanOrEqual(400);
    expect.soft(listReal).toEqual(listMissing);

    expect((await apiStatus(owner.api, "GET", "/admin/users")).status).toBe(403);
    expect(
      (await apiStatus(owner.api, "POST", `/admin/users/${other.user.id}/suspend`, {
        reason: "Probe",
      })).status,
    ).toBe(403);

    const project = (await owner.api.call("GET", `/projects/${id}`)) as { name: string };
    expect(project.name).toBe("Test Song");
    expect(await draftNotes(owner.api, id)).toHaveLength(1);
  });

  test("NFR-019 row-level security blocks access through the database API", async () => {
    const owner = await makeActor();
    const other = await makeActor();
    const { id, branchId, commit } = await songWithCommit(owner);
    await owner.api.setVisibility(id, "private");
    const env = requireTestEnv();
    const otherToken = await accessToken(other.user);

    for (const token of [otherToken, env.SUPABASE_ANON_KEY]) {
      const headers = {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      };
      for (const query of [
        `projects?id=eq.${id}`,
        `commits?branch_id=eq.${branchId}`,
        `drafts?branch_id=eq.${branchId}`,
        `branches?project_id=eq.${id}`,
      ]) {
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${query}`, { headers });
        const rows = res.ok ? ((await res.json()) as unknown[]) : [];
        expect(rows, query).toHaveLength(0);
      }
      const update = await fetch(`${env.SUPABASE_URL}/rest/v1/commits?id=eq.${commit.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ message: "Tampered" }),
      });
      expect(update.ok ? await update.json() : []).toHaveLength(0);
      const remove = await fetch(`${env.SUPABASE_URL}/rest/v1/commits?id=eq.${commit.id}`, {
        method: "DELETE",
        headers,
      });
      expect(remove.ok ? await remove.json() : []).toHaveLength(0);
    }

    const ownerToken = await accessToken(owner.user);
    const ownHeaders = {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${ownerToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };
    const ownUpdate = await fetch(`${env.SUPABASE_URL}/rest/v1/commits?id=eq.${commit.id}`, {
      method: "PATCH",
      headers: ownHeaders,
      body: JSON.stringify({ message: "Tampered" }),
    });
    expect(ownUpdate.ok ? await ownUpdate.json() : []).toHaveLength(0);
    const after = (await owner.api.call("GET", `/commits/${commit.id}`)) as { message: string };
    expect(after.message).toBe("Verse idea");
  });

  test("NFR-026 main pages have no critical or serious accessibility violation", async ({
    page,
    browser,
  }) => {
    test.fail(
      true,
      "DFID114: the placeholder tab on the project page is drawn at 60 percent opacity, so its 12px label has a contrast of 2.49 to 1 (axe color-contrast, serious)",
    );
    const actor = await makeActor();
    const adminActor = await makeActor("admin");
    const { id } = await songWithCommit(actor);
    const violations: string[] = [];
    const scan = async (target: Page, name: string) => {
      await target.waitForLoadState("networkidle");
      const result = await new AxeBuilder({ page: target }).analyze();
      for (const v of result.violations) {
        if (v.impact === "critical" || v.impact === "serious") {
          violations.push(
            `${name}: ${v.id} (${v.impact}) ${v.nodes.map((n) => `${n.target.join(" ")} ${n.failureSummary ?? ""}`).join(" | ")}`,
          );
        }
      }
    };

    await page.goto("/");
    await scan(page, "Landing");
    await page.goto("/login");
    await scan(page, "Login");

    await tabTo(page, page.locator('input[type="email"]'));
    await page.keyboard.type(actor.user.email);
    await tabTo(page, page.locator('input[type="password"]'));
    await page.keyboard.type(actor.user.password);
    await page.keyboard.press("Enter");
    await page.waitForURL((url) => url.pathname === "/");
    await page.waitForFunction(() => Boolean(window.localStorage.getItem("stave_session_id")));

    await page.goto("/projects");
    await expect(page.getByText("Test Song").first()).toBeVisible();
    await scan(page, "Dashboard");
    await openEditor(page, id);
    await scan(page, "MIDI Editor");
    await page.goto(`/projects/${id}?tab=commits`);
    await expect(page.getByText("Verse idea").first()).toBeVisible();
    await scan(page, "Commit History");

    await page.goto("/projects/new");
    const nameInput = page.locator('input[name="name"]');
    await tabTo(page, nameInput);
    await page.keyboard.type("Keyboard Song");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByText("Keyboard Song").first()).toBeVisible();

    await actor.api.putDraft(id, [{ id: "n1" }, { id: "n2", pitch: 64, start: 480 }]);
    await openEditor(page, id);
    await tabTo(page, page.getByRole("button", { name: /commit changes/i }));
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("#commit-message")).toBeFocused();
    await page.keyboard.type("Keyboard commit");
    await tabTo(page, dialog.getByRole("button", { name: /tạo commit/i }), 10);
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
    expect((await actor.api.history((await actor.api.branches(id))[0].id))[0].message).toBe(
      "Keyboard commit",
    );

    const adminPage = await newSession(browser, adminActor.user);
    await adminPage.goto("/admin/users");
    await expect(adminPage.getByRole("table").or(adminPage.getByText(/người dùng/i)).first()).toBeVisible();
    await scan(adminPage, "Admin Users");
    await adminPage.context().close();

    expect(violations).toEqual([]);
  });

  test("NFR-032 every pull request runs lint, type check, build and tests, and a failure blocks the merge", async () => {
    test.fail(
      true,
      "DFID111: the CI workflow runs build (with type check), lint, unit and integration tests on every pull request, but main has no branch protection or ruleset, so a failing check does not block the merge",
    );
    const workflow = await readFile(
      path.resolve(__dirname, "../../.github/workflows/ci.yml"),
      "utf8",
    );
    expect(workflow).toMatch(/pull_request:\s*\n\s*branches: \[main\]/);
    for (const step of [
      "npm run build --workspace=frontend",
      "npm run lint --workspace=frontend",
      "npm test --workspace=frontend",
      "npm run build --workspace=backend",
      "npm run lint --workspace=backend",
      "npm test --workspace=backend",
      "npm run test:int --workspace=backend",
    ]) {
      expect(workflow).toContain(step);
    }
    const branch = (await (
      await fetch("https://api.github.com/repos/KhanhNVK13/S.T.A.V.E/branches/main")
    ).json()) as { protected: boolean };
    const rulesets = (await (
      await fetch("https://api.github.com/repos/KhanhNVK13/S.T.A.V.E/rulesets")
    ).json()) as unknown[];
    expect(branch.protected || rulesets.length > 0).toBe(true);
  });

  test("NFR-034 timestamps are stored in UTC and shown in the browser time zone", async ({
    browser,
  }) => {
    const actor = await makeActor();
    const { branchId, id } = await songWithCommit(actor);
    expect(
      testSql(
        "select data_type from information_schema.columns where table_schema = 'public' and table_name = 'commits' and column_name = 'created_at'",
      ),
    ).toBe("timestamp with time zone");
    const list = (await actor.api.call("GET", `/commits?branch_id=${branchId}`)) as {
      items: Array<Record<string, unknown>>;
    };
    const item = list.items[0];
    const createdAt = String(item.created_at);
    expect(createdAt).toMatch(/(Z|\+00:00)$/);
    for (const [key, value] of Object.entries(item)) {
      if (key === "id" || key.endsWith("_id")) {
        if (value !== null) expect(String(value), key).toMatch(UUID);
      }
    }

    const shown: string[] = [];
    for (const timeZone of ["Asia/Ho_Chi_Minh", "Europe/London"]) {
      const expected = new Date(createdAt).toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone,
      });
      const context = await browser.newContext({ timezoneId: timeZone });
      const page = await context.newPage();
      await loginThroughUi(page, actor.user);
      await page.goto(`/projects/${id}?tab=commits`);
      await expect(page.getByText(expected).first()).toBeVisible();
      shown.push(expected);
      await context.close();
    }
    expect(shown[0]).not.toBe(shown[1]);
  });

  test("NFR-036 success messages are toasts and validation errors are shown inline", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID112 and DFID018: creating a project only returns to the list with no success toast, and an empty name only disables the Create button with no inline error",
    );
    const actor = await makeActor();
    await loginThroughUi(page, actor.user);
    await page.goto("/projects/new");
    const nameInput = page.locator('input[name="name"]');
    await nameInput.fill("Toast Song");
    await page.getByRole("button", { name: /tạo dự án/i }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect
      .soft(page.getByRole("status").filter({ hasText: /đã tạo|thành công/i }))
      .toBeVisible(quick);

    await page.goto("/projects/new");
    await nameInput.fill("x");
    await nameInput.fill("");
    await nameInput.blur();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByText(/tên dự án.*(bắt buộc|không được để trống)|nhập tên/i).first()).toBeVisible(
      quick,
    );
  });

  test("NFR-039 file type and size are validated on the server even when the client check is bypassed", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID076: MIDI files are only read in the browser and have no type or size check anywhere; a 6 MB file and an .exe renamed to .mid reach the importer and no message is shown",
    );
    const actor = await makeActor();
    const env = requireTestEnv();
    const storage = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY).storage;
    const bypass = async (file: Buffer, label: string) => {
      const upload = (await actor.api.call("POST", "/users/me/custom-sounds/upload-url", {
        durationSec: 2,
        sizeBytes: 1000,
      })) as { soundId: string; path: string; token: string };
      const { error } = await storage
        .from("custom-sounds")
        .uploadToSignedUrl(upload.path, upload.token, file, { contentType: "audio/wav" });
      expect(error, label).toBeNull();
      const result = await apiStatus(actor.api, "POST", "/users/me/custom-sounds", {
        soundId: upload.soundId,
        name: label,
        source: "uploaded",
      });
      const folder = upload.path.split("/").slice(0, -1).join("/");
      const { data: left } = await admin().storage.from("custom-sounds").list(folder);
      return { result, stored: (left ?? []).map((f) => f.name) };
    };

    const long = await bypass(wavBuffer(40), "Too long");
    expect(long.result.status).toBe(400);
    expect(long.result.body).toContain("30 giây");
    const fake = await bypass(Buffer.concat([Buffer.from("MZ"), Buffer.alloc(4096, 1)]), "Program");
    expect(fake.result.status).toBe(400);
    expect(fake.result.body).toMatch(/không phải âm thanh WAV/);
    expect(long.stored).toHaveLength(0);
    expect(fake.stored).toHaveLength(0);
    expect(
      ((await actor.api.call("GET", "/users/me/custom-sounds")) as { items: unknown[] }).items,
    ).toHaveLength(0);

    const project = await actor.api.createProject("Import Song");
    await actor.api.putDraft(project.id, [{ id: "n1" }]);
    await loginThroughUi(page, actor.user);
    await openEditor(page, project.id);
    const midi = new Midi();
    midi.addTrack().addNote({ midi: 60, ticks: 0, durationTicks: 240 });
    await page.locator('input[type="file"]').setInputFiles({
      name: "sample_6MB.mid",
      mimeType: "audio/midi",
      buffer: Buffer.concat([Buffer.from(midi.toArray()), Buffer.alloc(6 * 1024 * 1024)]),
    });
    await expect(page.getByText(/5 ?MB/i).first()).toBeVisible(quick);
    await page.locator('input[type="file"]').setInputFiles({
      name: "setup.mid",
      mimeType: "audio/midi",
      buffer: Buffer.concat([Buffer.from("MZ"), Buffer.alloc(4096, 1)]),
    });
    await expect(page.getByText(/không hợp lệ|không đọc được/i).first()).toBeVisible(quick);
  });
});

async function newSession(browser: Browser, user: E2eUser): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await loginThroughUi(page, user);
  return page;
}

function wavBuffer(seconds: number): Buffer {
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
  return buffer;
}
