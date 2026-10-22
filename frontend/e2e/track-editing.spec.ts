import { expect as baseExpect, test, type Page } from "@playwright/test";
import { snapshotOf, UserApi, type NoteSeed, type TrackSeed } from "./support/api";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  loginThroughUi,
} from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });
const quick = { timeout: 5_000 };
const saved = { timeout: 20_000 };

const PALETTE = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981",
  "#3b82f6", "#ef4444", "#8b5cf6", "#14b8a6",
  "#f97316", "#84cc16", "#06b6d4", "#a855f7",
];

interface FullTrack {
  id: string;
  name: string;
  color: string;
  instrument: string | null;
  order: number;
}

interface FullDraft {
  tracks: FullTrack[];
  notes: Array<{ id: string; trackId: string; pitch: number; start: number }>;
}

function tracksOf(count: number, colors?: string[]): TrackSeed[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `track-${i + 1}`,
    name: `Track ${i + 1}`,
    color: colors?.[i] ?? PALETTE[i % PALETTE.length],
  }));
}

function notesOn(trackId: string, count: number, pitch = 60): NoteSeed[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${trackId}-n${i + 1}`,
    trackId,
    pitch,
    start: i * 480,
    duration: 240,
  }));
}

async function seed(
  page: Page,
  tracks: TrackSeed[],
  notes: NoteSeed[],
  options: { commit?: boolean } = {},
) {
  const user = await createE2eUser();
  await createE2eProfile(user);
  const api = await UserApi.for(user);
  const project = await api.createProject("Test Song");
  await api.call("PUT", `/projects/${project.id}/draft`, snapshotOf(notes, tracks));
  if (options.commit) await api.commit(project.branchId, "Initial idea");
  await page.setViewportSize({ width: 1280, height: 720 });
  await loginThroughUi(page, user);
  return { api, ...project };
}

async function openEditor(page: Page, projectId: string): Promise<void> {
  await page.goto(`/projects/${projectId}/edit`);
  await page.getByRole("button", { name: /^File$/ }).waitFor();
  await page.waitForLoadState("networkidle");
}

async function readDraft(api: UserApi, projectId: string): Promise<FullDraft> {
  return (await api.call("GET", `/projects/${projectId}/draft`)) as FullDraft;
}

function nameButton(page: Page, name: string) {
  return page.getByTitle("Đổi tên track").filter({ hasText: new RegExp(`^${name}$`) });
}

function trackCard(page: Page, name: string) {
  return nameButton(page, name).locator("xpath=../..");
}

async function isSelected(page: Page, name: string): Promise<boolean> {
  return trackCard(page, name).evaluate((el) =>
    getComputedStyle(el).boxShadow.includes("inset"),
  );
}

function addTrackButton(page: Page) {
  return page.getByRole("button", { name: "+ Add Track" });
}

function confirmDialog(page: Page) {
  return page.getByRole("alertdialog");
}

async function statusColors(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    ["--accent", "--danger", "--warning"].map((token) => {
      const probe = document.createElement("span");
      probe.style.color = `var(${token})`;
      document.body.appendChild(probe);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = getComputedStyle(probe).color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      probe.remove();
      return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
    }),
  );
}

async function notePixel(page: Page, pitch: number, tick: number) {
  return page.evaluate(
    async ({ pitch, tick }) => {
      const canvas = Array.from(document.querySelectorAll("canvas")).find(
        (c) => (c.parentElement?.parentElement?.scrollHeight ?? 0) > 2000,
      )!;
      const container = canvas.parentElement!.parentElement!;
      const frame = () =>
        new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      const top = 34 + (127 - pitch) * 22 + 11 - container.clientHeight / 2;
      container.scrollTop = top + 1;
      await frame();
      container.scrollTop = top;
      await frame();
      const dpr = window.devicePixelRatio || 1;
      const x = 72 + tick * 0.06 - container.scrollLeft;
      const y = 34 + (127 - pitch) * 22 + 11 - container.scrollTop;
      const [r, g, b] = canvas
        .getContext("2d")!
        .getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data;
      return { r, g, b };
    },
    { pitch, tick },
  );
}

async function openCompare(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}?tab=commits`);
  await page.getByLabel(/Chọn commit/).nth(0).check();
  await page.getByLabel(/Chọn commit/).nth(1).check();
  await page.getByRole("button", { name: /so sánh/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Đang so sánh…")).toHaveCount(0);
  return page.getByRole("dialog");
}

async function waitSaved(page: Page) {
  await expect(page.getByText("Đã lưu nháp").first()).toBeVisible(saved);
}

test.describe("Track editing", () => {
  test.setTimeout(150_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test.describe("UC-28 add track", () => {
    test("EDT-030 adds an empty track with default settings and a decorative colour", async ({
      page,
    }) => {
      const { api, id, branchId } = await seed(page, tracksOf(2), notesOn("track-1", 2));
      await openEditor(page, id);
      await addTrackButton(page).click();

      await expect
        .poll(async () => (await readDraft(api, id)).tracks.length, saved)
        .toBe(3);
      const added = (await readDraft(api, id)).tracks[2];
      expect(added).toMatchObject({ name: "Track 3", instrument: null, order: 2 });
      expect(PALETTE).toContain(added.color);
      expect(["#6366f1", "#ec4899"]).not.toContain(added.color);
      expect(await statusColors(page)).not.toContain(added.color.toLowerCase());
      await expect(nameButton(page, "Track 3")).toBeVisible();
      expect(await isSelected(page, "Track 3")).toBe(true);
      expect(await isSelected(page, "Track 1")).toBe(false);
      expect(await api.history(branchId)).toHaveLength(0);
    });

    test("EDT-031 when every palette colour is used the new track restarts from the first colour", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID094: the new track colour is picked by track index from an 8-colour list, not as the next unused colour of the 12-colour palette, so with all 12 colours used it gets the fifth colour",
      );
      const { api, id } = await seed(page, tracksOf(12, PALETTE), []);
      await openEditor(page, id);
      await addTrackButton(page).click();
      await expect
        .poll(async () => (await readDraft(api, id)).tracks.length, saved)
        .toBe(13);
      await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
      expect((await readDraft(api, id)).tracks[12].color).toBe(PALETTE[0]);
    });

    test("EDT-032 a track cannot be added when the project already has 32 tracks", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID095: at 32 tracks the add button is only disabled; the limit is explained only in a hover tooltip and the in-editor limit message can never appear",
      );
      const { api, id } = await seed(page, tracksOf(32), []);
      await openEditor(page, id);
      await addTrackButton(page).click({ force: true });
      await expect(page.getByText(/tối đa 32 track/i).first()).toBeVisible(quick);
      expect((await readDraft(api, id)).tracks).toHaveLength(32);
    });

    test("EDT-034 no track can be added to an archived project", async ({ page }) => {
      const { api, id } = await seed(page, tracksOf(2), notesOn("track-1", 2), {
        commit: true,
      });
      await api.archive(id);
      await page.goto(`/projects/${id}/edit`);
      await expect(page.getByText(/đã được lưu trữ/)).toBeVisible();
      await expect(addTrackButton(page)).toHaveCount(0);
      expect((await readDraft(api, id)).tracks).toHaveLength(2);
    });

    test("EDT-035 the 32nd track can be added to a project with 31 tracks", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID095: after the 32nd track the add button is only disabled; the limit is explained only in a hover tooltip",
      );
      const { api, id } = await seed(page, tracksOf(31), []);
      await openEditor(page, id);
      await addTrackButton(page).click();
      await expect
        .poll(async () => (await readDraft(api, id)).tracks.length, saved)
        .toBe(32);
      await nameButton(page, "Track 32").scrollIntoViewIfNeeded();
      expect(await isSelected(page, "Track 32")).toBe(true);

      await addTrackButton(page).click({ force: true });
      await expect(page.getByText(/tối đa 32 track/i).first()).toBeVisible(quick);
      await page.waitForTimeout(3_000);
      expect((await readDraft(api, id)).tracks).toHaveLength(32);
    });
  });

  test.describe("UC-29 remove track", () => {
    const twoTracks = () => [
      { id: "track-1", name: "Lead", color: "#6366f1", instrument: "Acoustic Grand Piano" },
      { id: "track-2", name: "Bass", color: "#10b981", instrument: "Violin" },
    ];
    const notes = () => [...notesOn("track-1", 2, 72), ...notesOn("track-2", 8, 48)];

    test("EDT-036 removes a track with notes after confirmation and earlier commits keep it", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID096: the confirmation does not state how many notes will be removed and says the removal cannot be undone although Undo restores it",
      );
      const { api, id, branchId } = await seed(page, twoTracks(), notes(), {
        commit: true,
      });
      const head = (await api.history(branchId))[0];
      await openEditor(page, id);
      await trackCard(page, "Bass").click();
      await trackCard(page, "Bass").getByTitle("Xoá track").click();
      const dialog = confirmDialog(page);
      await expect(dialog).toBeVisible();
      await expect.soft(dialog).toContainText(/8 (note|nốt)/i, quick);
      await expect.soft(dialog).not.toContainText(/không thể hoàn tác/i);
      await dialog.getByRole("button", { name: "Xoá track" }).click();

      await expect
        .poll(async () => (await readDraft(api, id)).tracks.map((t) => t.id), saved)
        .toEqual(["track-1"]);
      expect((await readDraft(api, id)).notes.every((n) => n.trackId === "track-1")).toBe(
        true,
      );
      expect(await isSelected(page, "Lead")).toBe(true);
      await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
      const history = await api.history(branchId);
      expect(history.map((c) => c.id)).toEqual([head.id]);
      const snap = await api.commitSnapshot(head.id);
      expect(snap.notes.filter((n) => n.trackId === "track-2")).toHaveLength(8);
    });

    test("EDT-037 cancelling the confirmation makes no change", async ({ page }) => {
      const { api, id } = await seed(page, twoTracks(), notes());
      const before = await readDraft(api, id);
      await openEditor(page, id);
      expect(await isSelected(page, "Lead")).toBe(true);
      await trackCard(page, "Bass").getByTitle("Xoá track").click();
      const dialog = confirmDialog(page);
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Huỷ" }).click();
      await expect(dialog).toHaveCount(0);
      await page.waitForTimeout(3_000);

      expect(await readDraft(api, id)).toEqual(before);
      await expect(nameButton(page, "Bass")).toBeVisible();
      expect(await isSelected(page, "Lead")).toBe(true);
      await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
    });

    test("EDT-038 undo restores a removed track and its notes with their identifiers", async ({
      page,
    }) => {
      const { api, id } = await seed(page, twoTracks(), notes());
      const before = await readDraft(api, id);
      await openEditor(page, id);
      await trackCard(page, "Bass").getByTitle("Xoá track").click();
      await confirmDialog(page).getByRole("button", { name: "Xoá track" }).click();
      await expect
        .poll(async () => (await readDraft(api, id)).tracks.length, saved)
        .toBe(1);

      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await expect.poll(async () => readDraft(api, id), saved).toEqual(before);
      await expect(nameButton(page, "Bass")).toBeVisible();
    });

    test("EDT-039 the only track of a project cannot be removed", async ({ page }) => {
      test.fail(
        true,
        "DFID097: the last track can be removed after the usual confirmation; there is no refusal and no offer to delete its notes instead",
      );
      const { api, id } = await seed(
        page,
        [{ id: "track-1", name: "Solo" }],
        notesOn("track-1", 4),
      );
      await openEditor(page, id);
      await trackCard(page, "Solo").getByTitle("Xoá track").click();
      await expect
        .soft(page.getByText(/ít nhất (một|1) track/i).first())
        .toBeVisible(quick);
      const dialog = confirmDialog(page);
      if (await dialog.isVisible()) {
        await dialog.getByRole("button", { name: "Xoá track" }).click();
      }
      await page.waitForTimeout(3_500);
      expect((await readDraft(api, id)).tracks).toHaveLength(1);
    });

    test("EDT-040 an empty track is removed at once without confirmation", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID098: removing a track without notes still opens the same confirmation as a track with notes",
      );
      const { api, id } = await seed(page, tracksOf(3), [
        ...notesOn("track-1", 2),
        ...notesOn("track-2", 2, 64),
      ]);
      await openEditor(page, id);
      await trackCard(page, "Track 3").click();
      await trackCard(page, "Track 3").getByTitle("Xoá track").click();
      await expect(confirmDialog(page)).toHaveCount(0, quick);
      await expect
        .poll(async () => (await readDraft(api, id)).tracks.length, saved)
        .toBe(2);
      expect(await isSelected(page, "Track 1")).toBe(true);
    });
  });

  test.describe("UC-34 track colour", () => {
    test("EDT-063 changing a track colour redraws it and appears in the comparison", async ({
      page,
    }) => {
      const { api, id, branchId } = await seed(
        page,
        tracksOf(2),
        [{ id: "n1", pitch: 60, start: 0, duration: 960, trackId: "track-1" }],
        { commit: true },
      );
      const before = await readDraft(api, id);
      await openEditor(page, id);
      const pixelBefore = await notePixel(page, 60, 240);
      expect(pixelBefore.b).toBeGreaterThan(pixelBefore.g);

      const dot = trackCard(page, "Track 1").getByTitle("Đổi màu track");
      await dot.click();
      const swatches = page.locator('button[title^="#"]');
      await expect(swatches).toHaveCount(PALETTE.length);
      await page.getByTitle("#10b981", { exact: true }).click();

      await expect(dot).toHaveCSS("background-color", "rgb(16, 185, 129)");
      await expect
        .poll(async () => {
          const p = await notePixel(page, 60, 240);
          return p.g > p.r && p.g > p.b;
        })
        .toBe(true);
      await expect
        .poll(async () => (await readDraft(api, id)).tracks[0].color, saved)
        .toBe("#10b981");
      expect((await readDraft(api, id)).notes).toEqual(before.notes);

      await waitSaved(page);
      await api.commit(branchId, "Recolour track 1");
      const dialog = await openCompare(page, id);
      await expect(dialog.getByText(/Màu: #6366f1 → #10b981/)).toBeVisible();
    });

    test("EDT-064 a colour already used by another track can be chosen without a warning", async ({
      page,
    }) => {
      const { api, id } = await seed(page, tracksOf(2), []);
      await openEditor(page, id);
      await trackCard(page, "Track 1").getByTitle("Đổi màu track").click();
      await page.getByTitle(PALETTE[1], { exact: true }).click();
      await expect
        .poll(async () => (await readDraft(api, id)).tracks.map((t) => t.color), saved)
        .toEqual([PALETTE[1], PALETTE[1]]);
      await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
    });

    test("EDT-066 the colour picker never offers the reserved status colours", async ({
      page,
    }) => {
      const { id } = await seed(page, tracksOf(1), []);
      await openEditor(page, id);
      await trackCard(page, "Track 1").getByTitle("Đổi màu track").click();
      const offered = await page
        .locator('button[title^="#"]')
        .evaluateAll((els) => els.map((e) => e.getAttribute("title")!.toLowerCase()));
      expect(offered).toEqual(PALETTE);
      const reserved = await statusColors(page);
      for (const color of offered) expect(reserved).not.toContain(color);
    });
  });

  test.describe("UC-35 track label", () => {
    test("EDT-067 renaming a track stores the label and it appears in the comparison", async ({
      page,
    }) => {
      const { api, id, branchId } = await seed(page, tracksOf(2), [], { commit: true });
      await openEditor(page, id);
      await nameButton(page, "Track 1").click();
      const input = page.locator('input[maxlength="50"]');
      await expect(input).toBeFocused();
      expect(
        await input.evaluate((el: HTMLInputElement) => [
          el.selectionStart,
          el.selectionEnd,
          el.value.length,
        ]),
      ).toEqual([0, 7, 7]);
      await page.keyboard.type("Bass line");
      await page.keyboard.press("Enter");
      await expect(nameButton(page, "Bass line")).toBeVisible();
      await expect
        .poll(async () => (await readDraft(api, id)).tracks[0].name, saved)
        .toBe("Bass line");

      await waitSaved(page);
      await api.commit(branchId, "Rename track 1");
      const dialog = await openCompare(page, id);
      await expect(dialog.getByText(/Tên: Track 1 → Bass line/)).toBeVisible();
    });

    test("EDT-068 pressing Escape discards the new label", async ({ page }) => {
      const { api, id } = await seed(page, tracksOf(2), []);
      await openEditor(page, id);
      await nameButton(page, "Track 1").click();
      await page.keyboard.type("Temp name");
      await page.keyboard.press("Escape");
      await expect(page.locator('input[maxlength="50"]')).toHaveCount(0);
      await expect(nameButton(page, "Track 1")).toBeVisible();
      await page.waitForTimeout(3_000);
      expect((await readDraft(api, id)).tracks[0].name).toBe("Track 1");
    });

    test("EDT-069 an empty label restores the previous label", async ({ page }) => {
      const { api, id } = await seed(page, tracksOf(2), []);
      await openEditor(page, id);
      await nameButton(page, "Track 1").click();
      await page.keyboard.press("Control+A");
      await page.keyboard.press("Delete");
      await expect(page.locator('input[maxlength="50"]')).toHaveValue("");
      await page.keyboard.press("Enter");
      await expect(nameButton(page, "Track 1")).toBeVisible();
      await page.waitForTimeout(3_000);
      expect((await readDraft(api, id)).tracks[0].name).toBe("Track 1");
    });

    test("EDT-070 a label longer than 50 characters is not accepted", async ({ page }) => {
      const { api, id } = await seed(page, tracksOf(2), []);
      await openEditor(page, id);
      await nameButton(page, "Track 1").click();
      const long = "abcdefghij".repeat(5) + "Z";
      await page.keyboard.type(long);
      const input = page.locator('input[maxlength="50"]');
      await expect(input).toHaveValue(long.slice(0, 50));
      await expect(page.getByText("50/50", { exact: true })).toBeVisible();
      await page.keyboard.press("Enter");
      await expect
        .poll(async () => (await readDraft(api, id)).tracks[0].name, saved)
        .toBe(long.slice(0, 50));
    });

    test("EDT-072 labels of 1 and 50 characters are accepted", async ({ page }) => {
      const { api, id } = await seed(page, tracksOf(2), []);
      await openEditor(page, id);
      const fifty = "Fifty characters long track label for boundary 50!";
      expect(fifty).toHaveLength(50);
      await nameButton(page, "Track 1").click();
      await page.keyboard.type("B");
      await page.keyboard.press("Enter");
      await expect(nameButton(page, "B")).toBeVisible();
      await nameButton(page, "Track 2").click();
      await page.keyboard.type(fifty);
      await page.keyboard.press("Enter");
      await expect(page.getByTitle("Đổi tên track").filter({ hasText: fifty })).toBeVisible();
      await expect
        .poll(async () => (await readDraft(api, id)).tracks.map((t) => t.name), saved)
        .toEqual(["B", fifty]);
    });
  });
});
