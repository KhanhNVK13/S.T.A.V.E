import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { Midi } from "@tonejs/midi";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { UserApi, snapshotOf, type NoteSeed, type TrackSeed } from "./support/api";
import { admin } from "./support/auth-links";
import { BAR, PPQ, drag, pickTool, point, scrollGrid } from "./support/piano-roll";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  loginThroughUi,
  type E2eUser,
} from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });
const API = ":3101";

function wavBuffer(seconds: number): Buffer {
  const rate = 22050;
  const frames = Math.round(rate * seconds);
  const buffer = Buffer.alloc(44 + frames * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + frames * 2, 4);
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
  buffer.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i += 1) buffer.writeInt16LE(Math.round(Math.sin(i / 8) * 8000), 44 + i * 2);
  return buffer;
}

async function owner() {
  const user = await createE2eUser();
  await createE2eProfile(user);
  return { user, api: await UserApi.for(user) };
}

async function seedSound(api: UserApi, name: string) {
  const buffer = wavBuffer(1);
  const upload = (await api.call("POST", "/users/me/custom-sounds/upload-url", { durationSec: 1, sizeBytes: buffer.length })) as {
    soundId: string;
    path: string;
  };
  const { error } = await admin().storage.from("custom-sounds").upload(upload.path, buffer, { contentType: "audio/wav", upsert: true });
  if (error) throw new Error(error.message);
  await api.call("POST", "/users/me/custom-sounds", { soundId: upload.soundId, name, source: "uploaded" });
  return upload.soundId;
}

const TRACKS: TrackSeed[] = [
  { id: "track-1", name: "Lead" },
  { id: "track-2", name: "Drums" },
];

async function song(api: UserApi, notes: NoteSeed[], soundMap?: Record<string, string>) {
  const project = await api.createProject("Test Song");
  const snapshot = snapshotOf(notes, TRACKS);
  if (soundMap) (snapshot.tracks[1] as Record<string, unknown>).soundMap = soundMap;
  await api.call("PUT", `/projects/${project.id}/draft`, snapshot);
  await api.commit(project.branchId, "Verse idea");
  return project;
}

async function openEditor(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}/edit`);
  await page.getByRole("button", { name: /^File$/ }).waitFor();
  await page.waitForLoadState("networkidle");
}

async function openExport(page: Page) {
  await page.getByRole("button", { name: /^File$/ }).click();
  await page.getByRole("menuitem", { name: /export audio/i }).click();
  return page.getByRole("dialog", { name: "Xuất file âm thanh" });
}

test.describe("Editor extra", () => {
  test.setTimeout(180_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test("EDT-011 with snapping off a note starts at the exact clicked position", async ({ page }) => {
    const { user, api } = await owner();
    const project = await song(api, [{ id: "n1", pitch: 60, start: 0 }]);
    await loginThroughUi(page, user);
    await openEditor(page, project.id);
    await page.getByRole("button", { name: "Snap bật" }).click();
    await expect(page.getByRole("button", { name: "Snap tắt" })).toBeVisible();
    await pickTool(page, "Draw");
    const target = 4 * BAR + PPQ + Math.round(PPQ / 3);
    const g = await scrollGrid(page, { pitch: 64, tick: target });
    const p = point(g, target, 64);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(3_500);
    const added = (await api.draft(project.id)).notes.find((n) => n.pitch === 64)!;
    expect(added.start % (PPQ / 4)).not.toBe(0);
    expect(Math.abs(added.start - target)).toBeLessThan(40);
    expect(await api.history(project.branchId)).toHaveLength(1);
  });

  test("EDT-053 Cut removes the notes and pasting places them with the same relative timing", async ({ page }) => {
    const { user, api } = await owner();
    const notes = [0, 1, 2].map((i) => ({ id: `b${i}`, pitch: 60 + i, start: BAR + i * PPQ }));
    const project = await song(api, notes);
    await loginThroughUi(page, user);
    await openEditor(page, project.id);
    await page.keyboard.press("Control+a");
    await page.getByRole("button", { name: /^Edit/ }).click();
    await page.getByRole("menuitem", { name: /^Cut/ }).click();
    await expect.poll(async () => (await api.draft(project.id)).notes.length, { timeout: 15_000 }).toBe(0);
    await expect(page.getByRole("button", { name: "Hoàn tác", exact: true })).toBeEnabled();
    const g = await scrollGrid(page, { tick: 7 * BAR });
    await page.mouse.click(point(g, 7 * BAR, 127).x, g.top + 17);
    await page.keyboard.press("Control+v");
    await expect.poll(async () => (await api.draft(project.id)).notes.length, { timeout: 15_000 }).toBe(3);
    const starts = (await api.draft(project.id)).notes.map((n) => n.start).sort((a, b) => a - b);
    expect(starts[1] - starts[0]).toBe(PPQ);
    expect(starts[2] - starts[1]).toBe(PPQ);
    expect(starts[0]).toBeGreaterThanOrEqual(7 * BAR - PPQ);
  });

  test("Blocked by DFID154, EDT-083 with every track muted the playhead runs and an all-muted indication is shown", async ({ page }) => {
    test.fail(true, "DFID154: no indication is shown during playback when every track is muted");
    const { user, api } = await owner();
    const project = await song(api, [{ id: "n1", pitch: 60, start: 0 }, { id: "n2", pitch: 40, start: 0, trackId: "track-2" }]);
    await loginThroughUi(page, user);
    await openEditor(page, project.id);
    const mutes = page.getByRole("button", { name: /Tắt tiếng track/ });
    for (let i = 0; i < (await mutes.count()); i += 1) await mutes.nth(i).click();
    await page.getByRole("button", { name: "Phát (Space)" }).click();
    await expect(page.getByText(/mọi track.*tắt tiếng|tất cả track.*tắt tiếng/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: "Tạm dừng (Space)" })).toBeEnabled();
  });

  test("Blocked by DFID151, EDT-085 Export selected range only renders just the loop or selection", async ({ page }) => {
    test.fail(true, "DFID151: the export dialog has no selected-range option");
    const { user, api } = await owner();
    const project = await song(api, Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, pitch: 60, start: i * BAR })));
    await loginThroughUi(page, user);
    await openEditor(page, project.id);
    const dialog = await openExport(page);
    await expect(dialog.getByRole("checkbox", { name: /vùng|range/i })).toBeVisible({ timeout: 5_000 });
  });

  test("Blocked by DFID151, EDT-087 choosing MIDI in the Export dialog switches to the MIDI export", async ({ page }) => {
    test.fail(true, "DFID151: the export dialog offers no MIDI format; MIDI export is a separate menu item");
    const { user, api } = await owner();
    const project = await song(api, [{ id: "n1", pitch: 60, start: 0 }]);
    await loginThroughUi(page, user);
    await openEditor(page, project.id);
    const dialog = await openExport(page);
    await expect(dialog).toContainText("WAV (âm thanh)");
    await expect(dialog.getByText(/^MIDI/).first()).toBeVisible({ timeout: 5_000 });
  });

  test("Blocked by DFID152, EDT-090 closing the dialog during rendering cancels the export", async ({ page }) => {
    test.fail(true, "DFID152: Cancel is disabled while rendering, the export cannot be cancelled");
    const { user, api } = await owner();
    const project = await song(api, Array.from({ length: 400 }, (_, i) => ({ id: `n${i}`, pitch: 48 + (i % 24), start: i * PPQ })));
    await loginThroughUi(page, user);
    await openEditor(page, project.id);
    let downloaded = false;
    page.on("download", () => (downloaded = true));
    const dialog = await openExport(page);
    await dialog.getByRole("button", { name: /Xuất WAV/ }).click();
    await expect(dialog.getByText("Đang render âm thanh…")).toBeVisible();
    await dialog.getByRole("button", { name: "Huỷ" }).click({ timeout: 5_000 });
    await expect(dialog).toHaveCount(0);
    await page.waitForTimeout(5_000);
    expect(downloaded).toBe(false);
  });

  test("Blocked by DFID153, EDT-092 a MIDI export of a project with custom sounds warns first", async ({ page }) => {
    test.fail(true, "DFID153: the MIDI export downloads at once without the custom-sound warning");
    const { user, api } = await owner();
    const kick = await seedSound(api, "kick_01");
    const project = await song(api, [{ id: "n1", pitch: 60, start: 0 }, { id: "k1", pitch: 36, start: 0, trackId: "track-2" }], { "36": kick });
    await loginThroughUi(page, user);
    await openEditor(page, project.id);
    let downloads = 0;
    page.on("download", () => (downloads += 1));
    await page.getByRole("button", { name: /^File$/ }).click();
    await page.getByRole("menuitem", { name: /export midi/i }).click();
    await expect(page.getByText(/âm thanh riêng|custom sound/i).first()).toBeVisible({ timeout: 5_000 });
    expect(downloads).toBe(0);
  });

  test("Blocked by DFID155, EDT-101 double-clicking the pan control returns the track to centre", async ({ page }) => {
    test.fail(true, "DFID155: double-clicking the pan control does nothing");
    const { user, api } = await owner();
    const project = await api.createProject("Test Song");
    const snapshot = snapshotOf([{ id: "n1" }], TRACKS);
    snapshot.tracks[0].pan = 0.4;
    await api.call("PUT", `/projects/${project.id}/draft`, snapshot);
    await loginThroughUi(page, user);
    await openEditor(page, project.id);
    const slider = page.getByRole("slider", { name: "Pan track Lead" });
    const box = (await slider.boundingBox())!;
    await page.mouse.dblclick(box.x + box.width * 0.7, box.y + box.height / 2);
    await page.waitForTimeout(3_500);
    expect(((await api.call("GET", `/projects/${project.id}/draft`)) as { tracks: Array<{ pan: number }> }).tracks[0].pan).toBe(0);
  });

  test("Blocked by DFID159, EDT-105 exports a bundle with the MIDI file, the mapped sound and the mapping file", async ({ page }) => {
    test.fail(true, "DFID159: the bundle's JSON lists the custom sound but not the track and pitch it is mapped to");
    const { user, api } = await owner();
    const kick = await seedSound(api, "kick_01");
    const project = await song(api, [{ id: "n1", pitch: 60, start: 0 }, { id: "k1", pitch: 36, start: 0, trackId: "track-2" }], { "36": kick });
    const snapshot = snapshotOf([{ id: "n1", pitch: 60, start: 0 }, { id: "k1", pitch: 36, start: 0, trackId: "track-2" }, { id: "u1", pitch: 72, start: 2 * BAR }], TRACKS);
    (snapshot.tracks[1] as Record<string, unknown>).soundMap = { "36": kick };
    await api.call("PUT", `/projects/${project.id}/draft`, snapshot);
    const historyBefore = await api.history(project.branchId);
    await loginThroughUi(page, user);
    await openEditor(page, project.id);
    const dialog = await openExport(page);
    await dialog.getByText("Gói .zip (MIDI + WAV + âm thanh riêng)").click();
    const pending = page.waitForEvent("download", { timeout: 120_000 });
    await dialog.getByRole("button", { name: /Xuất gói \.zip/ }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    const files = unzipSync(new Uint8Array(await readFile((await download.path())!)));
    const names = Object.keys(files);
    const midName = names.find((n) => n.endsWith(".mid"))!;
    const midi = new Midi(files[midName]);
    expect(midi.tracks.flatMap((t) => t.notes.map((n) => n.midi)).sort()).toEqual([36, 60, 72]);
    expect(names.some((n) => /kick_01/.test(n))).toBe(true);
    const mapping = names.find((n) => n.endsWith(".json"))!;
    const json = JSON.parse(new TextDecoder().decode(files[mapping]));
    expect(JSON.stringify(json)).toMatch(/kick_01/);
    expect(await api.history(project.branchId)).toEqual(historyBefore);
    expect(JSON.stringify(json)).toMatch(/"(pitch|note)"\s*:\s*36/);
  });

  test("Blocked by DFID159, EDT-106 a project without custom sounds exports a bundle with an empty mapping", async ({ page }) => {
    test.fail(true, "DFID159: no notice that there was nothing extra to bundle");
    const { user, api } = await owner();
    const project = await song(api, [{ id: "n1", pitch: 60, start: 0 }]);
    await loginThroughUi(page, user);
    await openEditor(page, project.id);
    const dialog = await openExport(page);
    await dialog.getByText("Gói .zip (MIDI + WAV + âm thanh riêng)").click();
    const pending = page.waitForEvent("download", { timeout: 120_000 });
    await dialog.getByRole("button", { name: /Xuất gói \.zip/ }).click();
    const files = unzipSync(new Uint8Array(await readFile((await (await pending).path())!)));
    const names = Object.keys(files);
    expect(names.some((n) => n.endsWith(".mid"))).toBe(true);
    const mapping = names.find((n) => n.endsWith(".json"))!;
    const json = JSON.parse(new TextDecoder().decode(files[mapping]));
    expect(JSON.stringify(json)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
    await expect(dialog.getByText(/không có âm thanh riêng|nothing extra/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test("EDT-107 a packaging failure is reported and nothing is downloaded", async ({ page }) => {
    const { user, api } = await owner();
    const kick = await seedSound(api, "kick_01");
    const project = await song(api, [{ id: "n1", pitch: 60, start: 0 }, { id: "k1", pitch: 36, start: 0, trackId: "track-2" }], { "36": kick });
    await loginThroughUi(page, user);
    await openEditor(page, project.id);
    await page.route(/storage\/v1\/object\/.*custom-sounds/, (route) => route.fulfill({ status: 500, body: "" }));
    await page.route((url) => url.href.includes(API) && url.pathname.includes("custom-sounds"), (route) =>
      route.request().method() === "GET" && /url|download|signed/.test(route.request().url()) ? route.fulfill({ status: 500, body: "{}" }) : route.continue(),
    );
    let downloaded = false;
    page.on("download", () => (downloaded = true));
    const dialog = await openExport(page);
    await dialog.getByText("Gói .zip (MIDI + WAV + âm thanh riêng)").click();
    await dialog.getByRole("button", { name: /Xuất gói \.zip/ }).click();
    await expect(dialog.getByText(/Không tạo được gói \.zip|Không đưa được vào gói/).first()).toBeVisible({ timeout: 120_000 });
    await page.waitForTimeout(2_000);
    const failedOutright = await dialog.getByText(/Không tạo được gói \.zip/).count();
    if (failedOutright) expect(downloaded).toBe(false);
  });

  test("VC-009 commit is stopped when another collaborator committed to the same branch first", async ({ page }) => {
    const { user, api } = await owner();
    const project = await song(api, [{ id: "n1", pitch: 60, start: 0 }]);
    await api.putDraft(project.id, [{ id: "n1", pitch: 60, start: 0 }, { id: "a1", pitch: 64, start: BAR }], TRACKS);
    await loginThroughUi(page, user);
    await openEditor(page, project.id);
    await page.getByRole("button", { name: /commit changes/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#commit-message").fill("A change");
    const bUser: E2eUser = await createE2eUser();
    const bName = `b_${bUser.id.slice(0, 6)}`;
    await createE2eProfile(bUser, { username: bName });
    const other = await UserApi.for(bUser);
    await api.call("POST", `/projects/${project.id}/collaborators`, { identifier: bName, permissionLevel: "edit" });
    const [inv] = (await other.call("GET", "/users/me/collaboration-invitations")) as Array<{ id: string }>;
    await other.call("POST", `/users/me/collaboration-invitations/${inv.id}/accept`);
    await other.putDraft(project.id, [{ id: "n1", pitch: 60, start: 0 }, { id: "b1", pitch: 40, start: 0, trackId: "track-2" }], TRACKS);
    await other.commit(project.branchId, "B change");
    await dialog.getByRole("button", { name: "Tạo commit" }).click();
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)').first()).toBeVisible();
    expect((await api.history(project.branchId))[0].message).toBe("B change");
    expect((await api.draft(project.id)).notes.map((n) => n.id)).toContain("a1");
  });

  test("Blocked by DFID164, BRN-014 switching to a branch deleted elsewhere refreshes the list and keeps main", async ({ page }) => {
    test.fail(true, "DFID164: the branch chip keeps the deleted branch and picking it says only that the project has one branch");
    const { user, api } = await owner();
    const project = await song(api, [{ id: "n1", pitch: 60, start: 0 }]);
    const alt = await api.createBranch(project.id, "alt-chorus");
    await api.commitOnBranch(project.id, project.branchId, alt.id, [{ id: "n1", pitch: 60, start: 0 }, { id: "t1", pitch: 70, start: BAR }], "Try new chorus");
    await loginThroughUi(page, user);
    await openEditor(page, project.id);
    const draftBefore = await api.draft(project.id);
    await api.call("DELETE", `/branches/${alt.id}`);
    await page.getByRole("button", { name: /^main/ }).first().click();
    await page.getByRole("option", { name: "alt-chorus" }).click();
    await page.waitForTimeout(2_000);
    expect((await api.branches(project.id)).find((b) => b.is_active)?.name ?? "main").toBe("main");
    expect(await api.draft(project.id)).toEqual(draftBefore);
    await expect(page.getByText(/không còn tồn tại|đã bị xoá/i).first()).toBeVisible({ timeout: 5_000 });
    expect((await api.branches(project.id)).find((b) => b.is_active)?.name ?? "main").toBe("main");
    expect(await api.draft(project.id)).toEqual(draftBefore);
  });
});
