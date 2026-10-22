import {
  expect as baseExpect,
  test,
  type Locator,
  type Page,
} from "@playwright/test";
import { snapshotOf, UserApi } from "./support/api";
import { admin } from "./support/auth-links";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  loginThroughUi,
  type E2eUser,
} from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });
const quick = { timeout: 4_000 };
const BACKEND = "http://localhost:3101";
const BUCKET = "custom-sounds";
const C2 = 36;

interface WavOptions {
  rate?: number;
  channels?: number;
  bits?: number;
}

function wavBuffer(seconds: number, options: WavOptions = {}): Buffer {
  const rate = options.rate ?? 44100;
  const channels = options.channels ?? 1;
  const bits = options.bits ?? 16;
  const bytes = bits / 8;
  const frames = Math.round(rate * seconds);
  const dataSize = frames * channels * bytes;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * channels * bytes, 28);
  buffer.writeUInt16LE(channels * bytes, 32);
  buffer.writeUInt16LE(bits, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  const peak = 0.3 * (2 ** (bits - 1) - 1);
  let offset = 44;
  for (let i = 0; i < frames; i += 1) {
    const value = Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * peak);
    for (let c = 0; c < channels; c += 1) {
      buffer.writeIntLE(value, offset, bytes);
      offset += bytes;
    }
  }
  return buffer;
}

interface Actor {
  user: E2eUser;
  api: UserApi;
}

async function makeActor(): Promise<Actor> {
  const user = await createE2eUser();
  await createE2eProfile(user);
  return { user, api: await UserApi.for(user) };
}

async function seedSound(
  actor: Actor,
  name: string,
  seconds = 1,
): Promise<string> {
  const buffer = wavBuffer(seconds);
  const upload = (await actor.api.call(
    "POST",
    "/users/me/custom-sounds/upload-url",
    { durationSec: seconds, sizeBytes: buffer.length },
  )) as { soundId: string; path: string };
  const { error } = await admin()
    .storage.from(BUCKET)
    .upload(upload.path, buffer, { contentType: "audio/wav", upsert: true });
  if (error) throw new Error(`Seed upload failed: ${error.message}`);
  await actor.api.call("POST", "/users/me/custom-sounds", {
    soundId: upload.soundId,
    name,
    source: "uploaded",
  });
  return upload.soundId;
}

async function seedProject(
  actor: Actor,
  name: string,
  soundMap?: Record<string, string>,
) {
  const project = await actor.api.createProject(name);
  const snapshot = snapshotOf([{ id: "n1", pitch: C2 }]);
  if (soundMap) {
    (snapshot.tracks[0] as Record<string, unknown>).soundMap = soundMap;
  }
  await actor.api.call("PUT", `/projects/${project.id}/draft`, snapshot);
  await actor.api.commit(project.branchId, "Verse idea");
  return { ...project, snapshot };
}

async function listSounds(api: UserApi) {
  const library = (await api.call("GET", "/users/me/custom-sounds")) as {
    items: Array<{ id: string; name: string }>;
  };
  return library.items;
}

async function storageHas(ownerId: string, soundId: string) {
  const { data } = await admin().storage.from(BUCKET).list(ownerId);
  return (data ?? []).some((file) => file.name === `${soundId}.wav`);
}

async function openLibrary(page: Page, projectId: string): Promise<Locator> {
  await page.goto(`/projects/${projectId}/edit`);
  await page.getByRole("button", { name: /^File$/ }).click();
  await page.getByRole("menuitem", { name: /custom sounds/i }).click();
  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible();
  await page.waitForLoadState("networkidle");
  return dialog;
}

function soundRow(dialog: Locator, name: string): Locator {
  return dialog
    .locator("li")
    .filter({ hasText: name })
    .filter({ has: dialog.page().getByRole("button", { name: /nghe thử/i }) });
}

async function chooseFile(
  dialog: Locator,
  file: { name: string; mimeType: string; buffer: Buffer },
) {
  await dialog.locator('input[accept*="wav"]').setInputFiles(file);
}

test.describe("Custom sound library", () => {
  test.setTimeout(150_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test("AUD-022 uploads a valid WAV file to the personal library", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID080: the library shows no waveform preview and no mapping status for a sound",
    );
    const a = await makeActor();
    const project = await seedProject(a, "Test Song");
    const second = await a.api.createProject("Second Song");
    await loginThroughUi(page, a.user);
    const dialog = await openLibrary(page, project.id);
    await chooseFile(dialog, {
      name: "snare_2s.wav",
      mimeType: "audio/wav",
      buffer: wavBuffer(2),
    });
    const row = soundRow(dialog, "snare_2s");
    await expect(row).toBeVisible();
    await expect(row).toContainText(/0?0:02/);
    await expect(row).toContainText(/\d+ KB/);
    expect((await listSounds(a.api)).map((s) => s.name)).toContain("snare_2s");
    await expect(row.getByRole("button", { name: /nghe thử/i })).toBeEnabled();
    expect(second.id).toBeTruthy();
    await expect(row.locator("canvas, img")).not.toHaveCount(0, quick);
    await expect(row).toContainText(/chưa gán|not mapped/i, quick);
  });

  test("AUD-024 rejects a file that is not WAV or MP3", async ({ page }) => {
    const a = await makeActor();
    const project = await seedProject(a, "Test Song");
    await loginThroughUi(page, a.user);
    const dialog = await openLibrary(page, project.id);
    await chooseFile(dialog, {
      name: "loop.ogg",
      mimeType: "audio/ogg",
      buffer: Buffer.alloc(100 * 1024, 3),
    });
    await expect(dialog.getByRole("alert")).toContainText(/WAV.*MP3/);
    await expect(soundRow(dialog, "loop")).toHaveCount(0);
    expect(await listSounds(a.api)).toHaveLength(0);
  });

  test("AUD-025 rejects a file longer than 30 seconds and explains why", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID081: the over-length message states the 30 second limit but does not explain that custom sounds are played as individual notes",
    );
    const a = await makeActor();
    const project = await seedProject(a, "Test Song");
    await loginThroughUi(page, a.user);
    const dialog = await openLibrary(page, project.id);
    await chooseFile(dialog, {
      name: "pad_31s.wav",
      mimeType: "audio/wav",
      buffer: wavBuffer(31),
    });
    await expect(dialog.getByRole("alert")).toContainText(/30 giây/);
    await expect(dialog.locator("li")).toHaveCount(0);
    expect(await listSounds(a.api)).toHaveLength(0);
    await expect(dialog.getByRole("alert")).toContainText(
      /từng nốt|nốt nhạc|nguyên/i,
      quick,
    );
  });

  test("AUD-026 rejects a file larger than 10 MB", async ({ page }) => {
    test.fail(
      true,
      "DFID082: the size limit is applied after the file is converted to mono 44.1 kHz, so an 11.5 MB high resolution WAV of 20 seconds is accepted instead of rejected",
    );
    const a = await makeActor();
    const project = await seedProject(a, "Test Song");
    await loginThroughUi(page, a.user);
    const dialog = await openLibrary(page, project.id);
    const big = wavBuffer(20, { rate: 96000, channels: 2, bits: 24 });
    expect(big.length).toBeGreaterThan(10 * 1024 * 1024);
    await chooseFile(dialog, {
      name: "hires_11MB.wav",
      mimeType: "audio/wav",
      buffer: big,
    });
    await expect(dialog.getByRole("alert")).toContainText(/10 ?MB/, quick);
    await page.waitForTimeout(2_000);
    expect(await listSounds(a.api)).toHaveLength(0);
  });

  test("AUD-027 leaves no partial entry when the upload is interrupted", async ({
    page,
  }) => {
    const a = await makeActor();
    const project = await seedProject(a, "Test Song");
    await loginThroughUi(page, a.user);
    const dialog = await openLibrary(page, project.id);
    await page.route("**/storage/v1/object/upload/sign/**", (route) =>
      route.abort(),
    );
    await chooseFile(dialog, {
      name: "snare_2s.wav",
      mimeType: "audio/wav",
      buffer: wavBuffer(2),
    });
    await expect(dialog.getByRole("alert")).toContainText(/tải file lên thất bại/i);
    await page.unroute("**/storage/v1/object/upload/sign/**");
    await page.reload();
    expect(await listSounds(a.api)).toHaveLength(0);
    const { data } = await admin().storage.from(BUCKET).list(a.user.id);
    expect(data ?? []).toHaveLength(0);
    const { count } = await admin()
      .from("custom_sounds")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", a.user.id);
    expect(count).toBe(0);
  });

  test("AUD-029 keeps an uploaded sound private to its owner on the free plan", async ({
    page,
  }) => {
    const a = await makeActor();
    const b = await makeActor();
    const soundId = await seedSound(a, "snare_2s", 2);
    expect(await listSounds(a.api)).toHaveLength(1);
    expect(await listSounds(b.api)).toHaveLength(0);
    for (const path of [
      `/users/me/custom-sounds/${soundId}/usage`,
      `/users/${a.user.id}/custom-sounds`,
    ]) {
      await expect(b.api.call("GET", path)).rejects.toThrow(/-> (403|404)/);
    }
    await expect(
      b.api.call("DELETE", `/users/me/custom-sounds/${soundId}?mode=hard`),
    ).rejects.toThrow(/-> (403|404)/);
    expect(await storageHas(a.user.id, soundId)).toBe(true);
    const projectB = await seedProject(b, "B Song");
    await loginThroughUi(page, b.user);
    const dialog = await openLibrary(page, projectB.id);
    await expect(soundRow(dialog, "snare_2s")).toHaveCount(0);
  });

  test("AUD-031 asks for confirmation before replacing a sound already mapped to a pitch", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID083: mapping a second sound to a pitch that already has one replaces it at once without asking",
    );
    const a = await makeActor();
    const kick = await seedSound(a, "kick_1s");
    await seedSound(a, "snare_2s", 2);
    const project = await seedProject(a, "Test Song", { [C2]: kick });
    await loginThroughUi(page, a.user);
    await page.goto(`/projects/${project.id}/edit`);
    await page.getByText("Track 1", { exact: true }).first().click();
    await page.getByRole("button", { name: /^File$/ }).click();
    await page.getByRole("menuitem", { name: /custom sounds/i }).click();
    const dialog = page.getByRole("dialog").first();
    await dialog.locator('select[name="sound-pitch"]').selectOption(String(C2));
    await soundRow(dialog, "snare_2s")
      .getByRole("button", { name: /gán vào c2/i })
      .click();
    await expect(
      page.getByRole("alertdialog").or(page.getByText(/thay thế|replace/i)).first(),
    ).toBeVisible(quick);
  });

  test("AUD-037 shows each sound in the library with waveform, details, mapping status and a menu", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID080: the library shows no waveform preview, no mapping status and no rename action for a sound",
    );
    const a = await makeActor();
    const kick = await seedSound(a, "kick_1s");
    await seedSound(a, "snare_2s", 2);
    const project = await seedProject(a, "Test Song", { [C2]: kick });
    await loginThroughUi(page, a.user);
    const dialog = await openLibrary(page, project.id);
    const kickRow = soundRow(dialog, "kick_1s");
    const snareRow = soundRow(dialog, "snare_2s");
    await expect(kickRow).toContainText(/0?0:01/);
    await expect(snareRow).toContainText(/0?0:02/);
    await expect(kickRow.getByRole("button", { name: /nghe thử/i })).toBeEnabled();
    await expect.soft(kickRow.locator("canvas, img")).not.toHaveCount(0, quick);
    await expect.soft(kickRow).toContainText(/đã gán|mapped/i, quick);
    await expect.soft(snareRow).toContainText(/chưa gán|not mapped/i, quick);
    await expect
      .soft(snareRow.getByRole("button", { name: /đổi tên|rename|menu|thêm/i }))
      .toBeVisible(quick);
    expect(await listSounds(a.api)).toHaveLength(2);
  });

  test("AUD-041 marks a sound whose stored file is missing as unavailable", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID087: a sound whose file is gone from storage is not marked unavailable; its Play button is just disabled with no visible reason",
    );
    const a = await makeActor();
    await seedSound(a, "kick_1s");
    const snare = await seedSound(a, "snare_2s", 2);
    await admin().storage.from(BUCKET).remove([`${a.user.id}/${snare}.wav`]);
    const project = await seedProject(a, "Test Song");
    await loginThroughUi(page, a.user);
    const dialog = await openLibrary(page, project.id);
    const row = soundRow(dialog, "snare_2s");
    await expect(row).toBeVisible();
    await expect(row.getByRole("button", { name: /nghe thử/i })).toBeDisabled();
    await expect(row).toContainText(/không (khả dụng|phát được|dùng được)|unavailable/i, quick);
  });

  test("AUD-049 keeps commits and the draft unchanged when a sound is deleted completely", async ({
    page,
  }) => {
    const a = await makeActor();
    const kick = await seedSound(a, "kick_1s");
    const project = await seedProject(a, "Beat Demo", { [C2]: kick });
    const mappingCommit = await a.api.head(project.branchId);
    await a.api.call("DELETE", `/users/me/custom-sounds/${kick}?mode=hard`);
    const committed = (await a.api.commitSnapshot(mappingCommit.id)) as unknown as {
      tracks: Array<{ soundMap?: Record<string, string> }>;
    };
    expect(committed.tracks[0].soundMap).toEqual({ [C2]: kick });
    const draft = (await a.api.call(
      "GET",
      `/projects/${project.id}/draft`,
    )) as { tracks: Array<{ soundMap?: Record<string, string> }> };
    expect(draft.tracks[0].soundMap).toEqual({ [C2]: kick });

    await loginThroughUi(page, a.user);
    const dialog = await openLibrary(page, project.id);
    await expect(dialog.getByText(/không phát được|đã xoá/i).first()).toBeVisible();
    await dialog
      .getByRole("button", { name: /bỏ gán âm thanh cho nốt c2/i })
      .click();
    await expect
      .poll(
        async () =>
          (
            (await a.api.call("GET", `/projects/${project.id}/draft`)) as {
              tracks: Array<{ soundMap?: Record<string, string> }>;
            }
          ).tracks[0].soundMap,
        { timeout: 20_000 },
      )
      .toBeUndefined();
    const after = (await a.api.commitSnapshot(mappingCommit.id)) as unknown as {
      tracks: Array<{ soundMap?: Record<string, string> }>;
    };
    expect(after.tracks[0].soundMap).toEqual({ [C2]: kick });
    expect((await a.api.history(project.branchId)).length).toBe(1);
  });

  test("AUD-039 shows an empty state with the upload action for a user without sounds", async ({
    page,
  }) => {
    const b = await makeActor();
    const project = await seedProject(b, "B Song");
    await loginThroughUi(page, b.user);
    const dialog = await openLibrary(page, project.id);
    await expect(dialog.getByText("Chưa có âm thanh nào")).toBeVisible();
    await expect(dialog.getByText(/tải lên file hoặc ghi âm/i)).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^Tải lên$/ })).toBeVisible();
  });

  test("AUD-040 shows a retry message instead of an empty list when the library cannot be retrieved", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID084: when the library request fails the error is shown together with the empty library state and there is no retry action",
    );
    const a = await makeActor();
    await seedSound(a, "kick_1s");
    const project = await seedProject(a, "Test Song");
    await loginThroughUi(page, a.user);
    await page.route(
      /^http:\/\/localhost:3101\/users\/me\/custom-sounds$/,
      (route) =>
        route.request().method() === "GET"
          ? route.fulfill({
              status: 500,
              contentType: "application/json",
              body: JSON.stringify({ message: "Internal server error" }),
            })
          : route.continue(),
    );
    const dialog = await openLibrary(page, project.id);
    await expect(dialog.getByRole("alert")).toContainText(
      /không tải được thư viện/i,
    );
    await expect(dialog.getByText("Chưa có âm thanh nào")).toHaveCount(0, quick);
    await expect(dialog.getByRole("button", { name: /thử lại/i })).toBeVisible(
      quick,
    );
  });

  test("AUD-042 lists only the user's own sounds", async ({ page }) => {
    const a = await makeActor();
    const b = await makeActor();
    await seedSound(a, "kick_1s");
    await seedSound(a, "snare_2s", 2);
    await seedSound(b, "tom_1s");
    const project = await seedProject(b, "B Song");
    await loginThroughUi(page, b.user);
    const dialog = await openLibrary(page, project.id);
    await expect(dialog.locator("li")).toHaveCount(1);
    await expect(soundRow(dialog, "tom_1s")).toBeVisible();
    await expect(dialog.getByText("kick_1s")).toHaveCount(0);
    await expect(dialog.getByText("snare_2s")).toHaveCount(0);
  });

  test("AUD-044 explains the deletion of a sound that no other user's project uses", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID085: the delete dialog for an unshared sound does not say that no other user's project uses it, and offers a single delete option instead of two options that both remove the file at once",
    );
    const a = await makeActor();
    const snare = await seedSound(a, "snare_2s", 2);
    const project = await seedProject(a, "Test Song", { [C2]: snare });
    await loginThroughUi(page, a.user);
    const dialog = await openLibrary(page, project.id);
    await soundRow(dialog, "snare_2s")
      .getByRole("button", { name: /xoá/i })
      .click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toBeVisible();
    await expect(confirm.getByText(/xoá vĩnh viễn/i)).toBeVisible();
    await confirm.getByRole("button", { name: /^Xoá$/ }).click();
    await expect(soundRow(dialog, "snare_2s")).toHaveCount(0);
    await expect
      .poll(async () => storageHas(a.user.id, snare))
      .toBe(false);
    expect(await listSounds(a.api)).toHaveLength(0);
    await expect(
      confirm.getByText(/không.*dự án của người khác|không ai khác/i),
    ).toBeVisible(quick);
  });

  test("AUD-045 leaves the sound unchanged when the delete dialog is cancelled", async ({
    page,
  }) => {
    const a = await makeActor();
    const kick = await seedSound(a, "kick_1s");
    const project = await seedProject(a, "Test Song");
    await loginThroughUi(page, a.user);
    const dialog = await openLibrary(page, project.id);
    await soundRow(dialog, "kick_1s")
      .getByRole("button", { name: /xoá/i })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: /huỷ/i })
      .click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(soundRow(dialog, "kick_1s")).toBeVisible();
    expect(await listSounds(a.api)).toHaveLength(1);
    expect(await storageHas(a.user.id, kick)).toBe(true);
  });

  test("AUD-046 reports a server error on deletion and leaves the sound unchanged", async ({
    page,
  }) => {
    const a = await makeActor();
    const b = await makeActor();
    const kick = await seedSound(a, "kick_1s");
    const beat = await seedProject(a, "Beat Demo", { [C2]: kick });
    const bBeat = await seedProject(b, "Beat Demo fork", { [C2]: kick });
    await loginThroughUi(page, a.user);
    const dialog = await openLibrary(page, beat.id);
    await page.route(
      new RegExp(`^${BACKEND}/users/me/custom-sounds/[^/?]+(\\?.*)?$`),
      (route) =>
        route.request().method() === "DELETE"
          ? route.fulfill({
              status: 500,
              contentType: "application/json",
              body: JSON.stringify({ message: "Internal server error" }),
            })
          : route.continue(),
    );
    await soundRow(dialog, "kick_1s")
      .getByRole("button", { name: /xoá/i })
      .click();
    const confirm = page.getByRole("alertdialog");
    await confirm.getByRole("button", { name: /xoá hoàn toàn/i }).click();
    await expect(confirm.getByRole("alert")).toBeVisible();
    await confirm.getByRole("button", { name: /huỷ/i }).click();
    await expect(soundRow(dialog, "kick_1s")).toBeVisible();
    expect(await storageHas(a.user.id, kick)).toBe(true);
    for (const [api, id] of [
      [a.api, beat.id],
      [b.api, bBeat.id],
    ] as const) {
      const resolved = (await api.call(
        "GET",
        `/projects/${id}/custom-sounds?ids=${kick}`,
      )) as Array<{ playable: boolean }>;
      expect(resolved[0].playable).toBe(true);
    }
  });

  test("AUD-047 lists the affected project of another owner in the delete dialog", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID086: the delete dialog only counts the other users' projects that use the sound and does not list them by name",
    );
    const a = await makeActor();
    const b = await makeActor();
    const kick = await seedSound(a, "kick_1s");
    const own = await seedProject(a, "Test Song");
    await seedProject(b, "Shared Beat", { [C2]: kick });
    await loginThroughUi(page, a.user);
    const dialog = await openLibrary(page, own.id);
    await soundRow(dialog, "kick_1s")
      .getByRole("button", { name: /xoá/i })
      .click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm.getByText(/1 dự án của người khác/)).toBeVisible();
    await expect(confirm.getByText("Shared Beat")).toBeVisible(quick);
  });
});
