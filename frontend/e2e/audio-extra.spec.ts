import { expect as baseExpect, test, type Page } from "@playwright/test";
import { UserApi, snapshotOf } from "./support/api";
import { admin } from "./support/auth-links";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  loginThroughUi,
  type E2eUser,
} from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });

function wavBuffer(seconds: number): Buffer {
  const rate = 8000;
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
  for (let i = 0; i < frames; i += 1) buffer.writeInt16LE(Math.round(Math.sin(i / 6) * 6000), 44 + i * 2);
  return buffer;
}

async function person(label = "A") {
  const user = await createE2eUser();
  const username = `${label.toLowerCase()}_${user.id.slice(0, 6)}`;
  await createE2eProfile(user, { username, display_name: `User ${label}` });
  return { user, username, api: await UserApi.for(user) };
}

async function status(call: Promise<unknown>) {
  try {
    await call;
    return 200;
  } catch (error) {
    return Number(/-> (\d+)/.exec(String(error))?.[1] ?? 0);
  }
}

async function attachSketch(api: UserApi, projectId: string, name: string, seconds = 60) {
  const buffer = wavBuffer(seconds);
  const upload = (await api.call("POST", `/projects/${projectId}/audio-sketches/upload-url`, { durationSec: seconds, sizeBytes: buffer.length })) as {
    sketchId: string;
    path: string;
    token: string;
  };
  const { error } = await admin().storage.from("audio-sketches").uploadToSignedUrl(upload.path, upload.token, buffer, { contentType: "audio/wav" });
  if (error) throw new Error(error.message);
  await api.call("POST", `/projects/${projectId}/audio-sketches`, { sketchId: upload.sketchId, name, durationSec: seconds, sizeBytes: buffer.length });
  return upload;
}

async function seedSound(api: UserApi, name: string) {
  const buffer = wavBuffer(1);
  const upload = (await api.call("POST", "/users/me/custom-sounds/upload-url", { durationSec: 1, sizeBytes: buffer.length })) as { soundId: string; path: string };
  const { error } = await admin().storage.from("custom-sounds").upload(upload.path, buffer, { contentType: "audio/wav", upsert: true });
  if (error) throw new Error(error.message);
  await api.call("POST", "/users/me/custom-sounds", { soundId: upload.soundId, name, source: "uploaded" });
  return upload.soundId;
}

async function sketches(api: UserApi, projectId: string) {
  return (await api.call("GET", `/projects/${projectId}/audio-sketches`)) as Array<{ id: string; name: string }>;
}

async function openEditor(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}/edit`);
  await page.getByRole("button", { name: /^File$/ }).waitFor({ timeout: 30_000 });
}

async function openSketches(page: Page) {
  await page.getByRole("button", { name: /^File$/ }).click();
  await page.getByRole("menuitem", { name: /Audio sketch/ }).click();
  return page.getByRole("dialog", { name: "Audio sketch" });
}

async function openLibrary(page: Page) {
  await page.getByRole("button", { name: /^File$/ }).click();
  await page.getByRole("menuitem", { name: /custom sounds/i }).click();
  return page.getByRole("dialog").first();
}

async function share(owner: Awaited<ReturnType<typeof person>>, projectId: string, who: Awaited<ReturnType<typeof person>>, level: "view" | "edit") {
  await owner.api.call("POST", `/projects/${projectId}/collaborators`, { identifier: who.username, permissionLevel: level });
  const [inv] = (await who.api.call("GET", "/users/me/collaboration-invitations")) as Array<{ id: string }>;
  await who.api.call("POST", `/users/me/collaboration-invitations/${inv.id}/accept`);
}

test.describe("Audio extra", () => {
  test.setTimeout(150_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test("AUD-050 deletes an attached sketch permanently and leaves the history unchanged", async ({ page }) => {
    const a = await person();
    const project = await a.api.createProject("Test Song");
    await a.api.putDraft(project.id, [{ id: "n1" }]);
    await a.api.commit(project.branchId, "Verse idea");
    const sketch = await attachSketch(a.api, project.id, "Chorus hum");
    const history = await a.api.history(project.branchId);
    await loginThroughUi(page, a.user);
    await openEditor(page, project.id);
    const dialog = await openSketches(page);
    await dialog.getByRole("button", { name: "Xoá audio sketch Chorus hum" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Xoá audio sketch?" });
    await expect(confirm).toContainText("xoá vĩnh viễn");
    await confirm.getByRole("button", { name: "Xoá vĩnh viễn" }).click();
    await expect(page.getByText("Đã xoá audio sketch.")).toBeVisible();
    expect(await sketches(a.api, project.id)).toHaveLength(0);
    const { data } = await admin().storage.from("audio-sketches").list(project.id);
    expect((data ?? []).map((f) => f.name)).not.toContain(`${sketch.sketchId}.wav`);
    expect(await a.api.history(project.branchId)).toEqual(history);
  });

  test("AUD-051 cancelling the delete confirmation keeps the sketch", async ({ page }) => {
    const a = await person();
    const project = await a.api.createProject("Test Song");
    await attachSketch(a.api, project.id, "Chorus hum");
    await loginThroughUi(page, a.user);
    await openEditor(page, project.id);
    const dialog = await openSketches(page);
    await dialog.getByRole("button", { name: "Xoá audio sketch Chorus hum" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Xoá audio sketch?" });
    await confirm.getByRole("button", { name: "Huỷ" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(dialog.getByText("Chorus hum")).toBeVisible();
    expect(await sketches(a.api, project.id)).toHaveLength(1);
  });

  for (const [caseId, title] of [
    ["AUD-014", "a view-only collaborator cannot change the trim of a sketch"],
    ["AUD-053", "a view-only collaborator cannot delete a sketch"],
  ] as const) {
    test(`Blocked by DFID123, ${caseId} ${title}`, async ({ page }) => {
      const a = await person();
      const b = await person("B");
      const project = await a.api.createProject("Test Song");
      const sketch = await attachSketch(a.api, project.id, "Chorus hum");
      await share(a, project.id, b, "view");
      expect(await status(b.api.call("DELETE", `/projects/${project.id}/audio-sketches/${sketch.sketchId}`))).toBe(403);
      expect(await sketches(a.api, project.id)).toHaveLength(1);
      await loginThroughUi(page, b.user);
      await page.goto(`/projects/${project.id}`);
      await expect(page.getByRole("heading", { name: "Test Song" })).toBeVisible();
      await expect(page.getByRole("link", { name: /mở trình soạn nhạc/i })).toHaveCount(0);
    });
  }

  async function loadRecording(page: Page, seconds: number) {
    await page.waitForFunction(() => typeof (window as unknown as { __staveLoadRecording?: unknown }).__staveLoadRecording === "function");
    await page.evaluate((value) => (window as unknown as { __staveLoadRecording: (n: number) => void }).__staveLoadRecording(value), seconds);
  }

  test("AUD-010 Reset trim returns both handles to the ends of the full recording", async ({ page }) => {
    const a = await person();
    const project = await a.api.createProject("Test Song");
    await loginThroughUi(page, a.user);
    await openEditor(page, project.id);
    const dialog = await openSketches(page);
    await loadRecording(page, 60);
    const start = dialog.getByRole("button", { name: "Điểm bắt đầu" });
    const end = dialog.getByRole("button", { name: "Điểm kết thúc" });
    const track = await start.locator("xpath=..").boundingBox();
    expect(track).not.toBeNull();
    const at = (seconds: number) => track!.x + (track!.width * seconds) / 60;
    const mid = track!.y + track!.height / 2;
    const startBox = (await start.boundingBox())!;
    await page.mouse.move(startBox.x + startBox.width / 2, mid);
    await page.mouse.down();
    await page.mouse.move(at(5), mid, { steps: 10 });
    await page.mouse.up();
    const endBox = (await end.boundingBox())!;
    await page.mouse.move(endBox.x + 1, mid);
    await page.mouse.down();
    await page.mouse.move(at(45), mid, { steps: 10 });
    await page.mouse.up();
    await expect(dialog.getByText(/Giữ lại 00:[34]\d \/ 01:00/)).toBeVisible();
    await dialog.getByRole("button", { name: "Đặt lại vùng cắt" }).click();
    await expect(dialog.getByText("Giữ lại 01:00 / 01:00")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Đặt lại vùng cắt" })).toBeDisabled();
    const left = (await start.boundingBox())!;
    const right = (await end.boundingBox())!;
    expect(Math.abs(left.x + left.width / 2 - track!.x)).toBeLessThan(6);
    expect(Math.abs(right.x + right.width / 2 - (track!.x + track!.width))).toBeLessThan(6);
  });

  test("AUD-018 attachment is refused when the recording is over 20 MB", async ({ page }) => {
    test.setTimeout(200_000);
    const a = await person();
    const project = await a.api.createProject("Test Song");
    await loginThroughUi(page, a.user);
    await openEditor(page, project.id);
    const dialog = await openSketches(page);
    await loadRecording(page, 250);
    await dialog.locator('input[name="sketchName"]').fill("Too big");
    const uploads: string[] = [];
    page.on("request", (req) => {
      if (/storage|audio-sketches/.test(req.url()) && req.method() !== "GET") uploads.push(req.url());
    });
    await expect(async () => {
      await dialog.getByRole("button", { name: "Đính kèm vào dự án" }).click();
      await expect(dialog.getByText(/vượt giới hạn 20MB/)).toBeVisible({ timeout: 45_000 });
    }).toPass({ timeout: 150_000 });
    await expect(dialog.getByRole("button", { name: "Đính kèm vào dự án" })).toBeVisible();
    expect(uploads).toEqual([]);
    expect(await sketches(a.api, project.id)).toHaveLength(0);
  });

  test("AUD-023 several files uploaded at once are processed independently", async ({ page }) => {
    const a = await person();
    const project = await a.api.createProject("Test Song");
    await loginThroughUi(page, a.user);
    await openEditor(page, project.id);
    const dialog = await openLibrary(page);
    await dialog.locator('input[type="file"]').setInputFiles([
      { name: "clap_1s.wav", mimeType: "audio/wav", buffer: wavBuffer(1) },
      { name: "hat_1s.wav", mimeType: "audio/wav", buffer: wavBuffer(1) },
      { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not audio") },
    ]);
    await expect(dialog.getByText(/notes\.txt/).first()).toBeVisible();
    await expect.poll(async () => ((await a.api.call("GET", "/users/me/custom-sounds")) as { items: Array<{ name: string }> }).items.map((s) => s.name).sort(), { timeout: 60_000 }).toEqual(["clap_1s", "hat_1s"]);
  });

  test("Blocked by DFID158, AUD-032 Change mapping starts from the current mapping and moves the sound", async ({ page }) => {
    test.fail(true, "DFID158: the Sound Library offers only rename and delete, no mapping action");
    const a = await person();
    const kick = await seedSound(a.api, "kick_1s");
    const project = await a.api.createProject("Test Song");
    const snapshot = snapshotOf([{ id: "n1", pitch: 36 }]);
    (snapshot.tracks[0] as Record<string, unknown>).soundMap = { "36": kick };
    await a.api.call("PUT", `/projects/${project.id}/draft`, snapshot);
    await loginThroughUi(page, a.user);
    await openEditor(page, project.id);
    const dialog = await openLibrary(page);
    await dialog.getByRole("button", { name: /tuỳ chọn cho kick_1s/i }).click();
    await page.getByRole("menuitem", { name: /đổi gán|change mapping|đổi nốt/i }).click({ timeout: 5_000 });
    const mapDialog = page.getByRole("dialog").last();
    await expect(mapDialog.locator("select").first()).toHaveValue("track-1");
    await expect(mapDialog).toContainText(/C2|36/);
    await mapDialog.locator("select").nth(1).selectOption({ label: /D2/ as unknown as string }).catch(async () => {
      await mapDialog.locator("select").nth(1).selectOption("38");
    });
    await mapDialog.getByRole("button", { name: /xác nhận|gán|lưu/i }).last().click();
    await expect.poll(async () => {
      const draft = (await a.api.call("GET", `/projects/${project.id}/draft`)) as { tracks: Array<{ soundMap?: Record<string, string> }> };
      return draft.tracks[0].soundMap;
    }, { timeout: 15_000 }).toEqual({ "38": kick });
  });

  test("AUD-038 the library opened from a project marks mapped sounds and disables unplayable ones", async ({ page }) => {
    const a = await person();
    const kick = await seedSound(a.api, "kick_1s");
    await seedSound(a.api, "snare_2s");
    const oldTom = await seedSound(a.api, "old_tom");
    const project = await a.api.createProject("Test Song");
    const snapshot = snapshotOf([{ id: "n1", pitch: 36 }, { id: "n2", pitch: 45 }]);
    (snapshot.tracks[0] as Record<string, unknown>).soundMap = { "36": kick, "45": oldTom };
    await a.api.call("PUT", `/projects/${project.id}/draft`, snapshot);
    await admin().from("custom_sounds").update({ deleted_at: new Date().toISOString() }).eq("id", oldTom);
    await loginThroughUi(page, a.user);
    await openEditor(page, project.id);
    const dialog = await openLibrary(page);
    const row = (name: string) => dialog.locator("li, div").filter({ hasText: name }).filter({ hasText: /Đã gán|Chưa gán/ }).last();
    await expect(row("kick_1s")).toContainText("Đã gán");
    await expect(row("snare_2s")).toContainText("Chưa gán");
    await expect(dialog.getByText("old_tom").first()).toBeVisible({ timeout: 5_000 });
  });
});
