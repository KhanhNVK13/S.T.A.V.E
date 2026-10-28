import { expect as baseExpect, test, type Page } from "@playwright/test";
import { snapshotOf, UserApi, type NoteSeed, type TrackSeed } from "./support/api";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  loginThroughUi,
} from "./support/test-user";
import {
  BAR,
  drag,
  ONE_PIXEL_TICKS,
  point,
  PPQ,
  scrollGrid,
  seekTo,
  pickTool,
} from "./support/piano-roll";

const expect = baseExpect.configure({ timeout: 30_000 });
const quick = { timeout: 5_000 };
const saved = { timeout: 20_000 };

interface FullNote {
  id: string;
  trackId: string;
  pitch: number;
  start: number;
  duration: number;
  velocity: number;
}

interface FullDraft {
  tracks: Array<{
    id: string;
    name: string;
    instrument: string | null;
    volume: number;
    pan: number;
    muted: boolean;
  }>;
  notes: FullNote[];
}

const TWO_TRACKS: TrackSeed[] = [
  { id: "track-1", name: "Lead", instrument: "Acoustic Grand Piano" },
  { id: "track-2", name: "Bass" },
];

async function createProject(
  api: UserApi,
  name: string,
  notes: NoteSeed[],
  tracks: TrackSeed[] = TWO_TRACKS,
  tempo = 120,
) {
  const project = await api.createProject(name);
  const snapshot = snapshotOf(notes, tracks);
  await api.call("PUT", `/projects/${project.id}/draft`, {
    ...snapshot,
    meta: { ...snapshot.meta, tempo },
  });
  return project;
}

async function seed(page: Page, notes: NoteSeed[], tracks: TrackSeed[] = TWO_TRACKS) {
  const user = await createE2eUser();
  await createE2eProfile(user);
  const api = await UserApi.for(user);
  const project = await createProject(api, "Test Song", notes, tracks);
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

function trackCard(page: Page, name: string) {
  return page
    .getByTitle("Đổi tên track")
    .filter({ hasText: new RegExp(`^${name}$`) })
    .locator("xpath=../..");
}

async function selectTrack(page: Page, name: string) {
  await trackCard(page, name).click({ position: { x: 6, y: 6 } });
}

function toolbarButton(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

async function editItem(page: Page, name: string) {
  const item = page.getByRole("menuitem", { name: new RegExp(`^${name}`) });
  if (!(await item.isVisible())) {
    await page.getByRole("button", { name: /^Edit/ }).click();
  }
  return item;
}

async function closeEditMenu(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
}

function starts(notes: FullNote[]) {
  return Object.fromEntries(notes.map((n) => [n.id, n.start]));
}

async function clickNote(page: Page, note: { start: number; pitch: number }, shift = false) {
  const g = await scrollGrid(page, { pitch: note.pitch });
  const p = point(g, note.start + 30, note.pitch);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.click(p.x, p.y);
  if (shift) await page.keyboard.up("Shift");
}

async function boxSelect(
  page: Page,
  from: { tick: number; pitch: number },
  to: { tick: number; pitch: number },
) {
  const g = await scrollGrid(page, { pitch: Math.round((from.pitch + to.pitch) / 2) });
  await drag(page, point(g, from.tick, from.pitch), point(g, to.tick, to.pitch));
}

function copyMessage(page: Page) {
  return page.getByText(/(đã )?(sao chép|copy).*\d+ (note|nốt)|\d+ (note|nốt).*(sao chép|copy)/i);
}

const OFF_GRID: NoteSeed[] = [
  { id: "q1", pitch: 60, start: BAR + 10, duration: 240, velocity: 70 },
  { id: "q2", pitch: 62, start: BAR + PPQ - 10, duration: 240, velocity: 80 },
  { id: "q3", pitch: 64, start: BAR + 2 * PPQ + 25, duration: 240, velocity: 90 },
  { id: "q4", pitch: 65, start: BAR + 3 * PPQ - 35, duration: 240, velocity: 100 },
];
const ON_GRID_STARTS = { q1: BAR, q2: BAR + PPQ, q3: BAR + 2 * PPQ, q4: BAR + 3 * PPQ };

const BAR2_PATTERN: NoteSeed[] = [
  { id: "p1", pitch: 60, start: BAR, duration: 240, velocity: 70 },
  { id: "p2", pitch: 64, start: BAR + 240, duration: 120, velocity: 90 },
  { id: "p3", pitch: 67, start: BAR + 720, duration: 480, velocity: 100 },
];

async function selectBar2Pattern(page: Page) {
  await pickTool(page, "Select");
  await boxSelect(page, { tick: BAR - 60, pitch: 69 }, { tick: 2 * BAR - 60, pitch: 58 });
  await expect(await editItem(page, "Copy")).toBeEnabled();
      await closeEditMenu(page);
}

test.describe("Editing tools", () => {
  test.setTimeout(150_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test.describe("UC-30 instrument", () => {
    test("EDT-044 keeps the previous instrument when its samples cannot be loaded", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID099: choosing an instrument never loads or checks its samples; the instrument is switched at once and no error is shown when its sample files return 404",
      );
      const { api, id } = await seed(page, [{ id: "n1", pitch: 60, start: 0 }]);
      const sampleRequests: string[] = [];
      await page.route("**/instruments/flute/**", (route) => {
        sampleRequests.push(route.request().url());
        return route.fulfill({ status: 404, body: "" });
      });
      await openEditor(page, id);
      await trackCard(page, "Lead").getByTitle("Acoustic Grand Piano").click();
      await page.getByPlaceholder("Tìm nhạc cụ…").fill("Flute");
      await page.getByRole("button", { name: "Flute", exact: true }).click();
      await page.waitForTimeout(3_500);

      await expect
        .soft(page.getByText(/không tải được|tải.*thất bại|không thể tải/i).first())
        .toBeVisible(quick);
      expect((await readDraft(api, id)).tracks[0].instrument).toBe("Acoustic Grand Piano");
    });
  });

  test.describe("UC-31 quantize", () => {
    test("EDT-046 quantizes the notes of the track and keeps identity, pitch and velocity", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID100: quantize moves the notes silently; there is no message saying how many notes were moved",
      );
      const { api, id, branchId } = await seed(page, OFF_GRID);
      const before = (await readDraft(api, id)).notes;
      await openEditor(page, id);
      await toolbarButton(page, "1/16").click();
      await (await editItem(page, "Quantize")).click();

      await expect
        .poll(async () => starts((await readDraft(api, id)).notes), saved)
        .toEqual(ON_GRID_STARTS);
      const after = (await readDraft(api, id)).notes;
      expect(after.map(({ id: i, pitch, velocity }) => ({ i, pitch, velocity }))).toEqual(
        before.map(({ id: i, pitch, velocity }) => ({ i, pitch, velocity })),
      );
      expect(await api.history(branchId)).toHaveLength(0);
      await expect(toolbarButton(page, "Undo")).toBeEnabled();
      await expect(
        page.getByText(/^(?=.{0,120}$).*((di chuyển|quantize|căn).*4 (note|nốt)|4 (note|nốt).*(di chuyển|quantize|căn))/i).first(),
      ).toBeVisible(quick);
    });

    test("EDT-047 undo after quantizing restores the original start positions", async ({
      page,
    }) => {
      const { api, id } = await seed(page, OFF_GRID);
      const before = starts((await readDraft(api, id)).notes);
      await openEditor(page, id);
      await toolbarButton(page, "1/16").click();
      await (await editItem(page, "Quantize")).click();
      await expect
        .poll(async () => starts((await readDraft(api, id)).notes), saved)
        .toEqual(ON_GRID_STARTS);
      await toolbarButton(page, "Undo").click();
      await expect
        .poll(async () => starts((await readDraft(api, id)).notes), saved)
        .toEqual(before);
    });

    test("EDT-048 quantizing notes already on the grid reports that nothing moved", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID100: quantize gives no feedback; when no note needs moving nothing tells the user so",
      );
      const notes: NoteSeed[] = [
        { id: "b1", pitch: 48, start: 0, trackId: "track-2" },
        { id: "b2", pitch: 50, start: 120, trackId: "track-2" },
        { id: "b3", pitch: 52, start: 600, trackId: "track-2" },
      ];
      const { api, id } = await seed(page, notes);
      const before = await readDraft(api, id);
      await openEditor(page, id);
      await selectTrack(page, "Bass");
      await toolbarButton(page, "1/16").click();
      await (await editItem(page, "Quantize")).click();
      await page.waitForTimeout(3_500);

      expect(await readDraft(api, id)).toEqual(before);
      await expect(
        page.getByText(/không có (note|nốt) nào cần|đã nằm trên lưới|không cần (di chuyển|căn)/i).first(),
      ).toBeVisible(quick);
    });

    test("EDT-049 a quantize collision keeps the earlier note and is reported", async ({
      page,
    }) => {
      const tracks = [...TWO_TRACKS, { id: "track-3", name: "Keys" }];
      const { api, id } = await seed(
        page,
        [
          { id: "early", pitch: 60, start: PPQ - 15, duration: 240, trackId: "track-3" },
          { id: "late", pitch: 60, start: PPQ + 15, duration: 240, trackId: "track-3" },
        ],
        tracks,
      );
      await openEditor(page, id);
      await selectTrack(page, "Keys");
      await toolbarButton(page, "1/4").click();
      await (await editItem(page, "Quantize")).click();
      await expect
        .poll(async () => (await readDraft(api, id)).notes.find((n) => n.id === "early")?.start, saved)
        .toBe(PPQ);

      await expect.soft(page.getByText(/trùng|chồng|va chạm/i).first()).toBeVisible(quick);
      const atBeat = (await readDraft(api, id)).notes.filter(
        (n) => n.pitch === 60 && n.start === PPQ,
      );
      expect(atBeat.map((n) => n.id)).toEqual(["early"]);
    });

    test("EDT-051 quantize applies only to the selected notes", async ({ page }) => {
      const { api, id } = await seed(page, OFF_GRID);
      await openEditor(page, id);
      await toolbarButton(page, "1/16").click();
      await pickTool(page, "Select");
      await clickNote(page, { start: BAR + 10, pitch: 60 });
      await clickNote(page, { start: BAR + PPQ - 10, pitch: 62 }, true);
      await (await editItem(page, "Quantize")).click();

      await expect
        .poll(async () => starts((await readDraft(api, id)).notes).q1, saved)
        .toBe(BAR);
      expect(starts((await readDraft(api, id)).notes)).toEqual({
        q1: BAR,
        q2: BAR + PPQ,
        q3: BAR + 2 * PPQ + 25,
        q4: BAR + 3 * PPQ - 35,
      });
    });
  });

  test.describe("UC-32 copy", () => {
    test("EDT-052 copying 3 notes confirms the copy and leaves the project unchanged", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID103: copying gives no confirmation of what was copied; the only sign is that the Paste button becomes enabled",
      );
      const { api, id, branchId } = await seed(page, BAR2_PATTERN);
      const before = await readDraft(api, id);
      await openEditor(page, id);
      await expect(await editItem(page, "Paste")).toBeDisabled();
      await closeEditMenu(page);
      await selectBar2Pattern(page);
      await page.keyboard.press("Control+C");

      await expect(await editItem(page, "Paste")).toBeEnabled();
      await closeEditMenu(page);
      await page.waitForTimeout(3_000);
      expect(await readDraft(api, id)).toEqual(before);
      expect(await api.history(branchId)).toHaveLength(0);
      await expect(copyMessage(page).first()).toBeVisible(quick);
    });

    test("EDT-054 copy with no note selected does nothing and keeps the earlier pattern", async ({
      page,
    }) => {
      const { api, id } = await seed(page, [
        { id: "n1", pitch: 64, start: 0, duration: 240, velocity: 77 },
      ]);
      await openEditor(page, id);
      await pickTool(page, "Select");
      await clickNote(page, { start: 0, pitch: 64 });
      await page.keyboard.press("Control+C");
      const g = await scrollGrid(page, { pitch: 64 });
      const empty = point(g, 3 * BAR, 70);
      await page.mouse.click(empty.x, empty.y);
      await expect(await editItem(page, "Copy")).toBeDisabled();
      await closeEditMenu(page);
      await page.keyboard.press("Control+C");
      await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);

      await seekTo(page, 4 * BAR);
      await page.keyboard.press("Control+V");
      await expect
        .poll(async () => (await readDraft(api, id)).notes.length, saved)
        .toBe(2);
      const pasted = (await readDraft(api, id)).notes.find((n) => n.id !== "n1");
      expect(pasted).toMatchObject({ pitch: 64, velocity: 77 });
      expect(Math.abs(pasted!.start - 4 * BAR)).toBeLessThan(ONE_PIXEL_TICKS);
    });

    test("EDT-055 a selection across tracks is pasted back with its track grouping", async ({
      page,
    }) => {
      const { api, id } = await seed(page, [
        { id: "l1", pitch: 72, start: BAR, duration: 240, trackId: "track-1" },
        { id: "b1", pitch: 48, start: BAR + PPQ, duration: 240, trackId: "track-2" },
      ]);
      await openEditor(page, id);
      await page.keyboard.press("Control+A");
      await page.keyboard.press("Control+C");
      await expect.soft(copyMessage(page).first()).toBeVisible(quick);
      await selectTrack(page, "Lead");
      await seekTo(page, 8 * BAR);
      await page.keyboard.press("Control+V");

      await expect
        .poll(async () => (await readDraft(api, id)).notes.length, saved)
        .toBe(4);
      const pasted = (await readDraft(api, id)).notes
        .filter((n) => n.start >= 8 * BAR)
        .map((n) => ({ pitch: n.pitch, start: n.start, trackId: n.trackId }))
        .sort((a, b) => a.start - b.start);
      expect(pasted).toEqual([
        { pitch: 72, start: 8 * BAR, trackId: "track-1" },
        { pitch: 48, start: 8 * BAR + PPQ, trackId: "track-2" },
      ]);
    });
  });

  test.describe("UC-33 paste", () => {
    test("EDT-056 pastes the copied pattern at the playhead with new identifiers", async ({
      page,
    }) => {
      const { api, id, branchId } = await seed(page, BAR2_PATTERN);
      await openEditor(page, id);
      await selectBar2Pattern(page);
      await page.keyboard.press("Control+C");
      await selectTrack(page, "Bass");
      await seekTo(page, 4 * BAR);
      await page.keyboard.press("Control+V");

      await expect
        .poll(async () => (await readDraft(api, id)).notes.length, saved)
        .toBe(6);
      const notes = (await readDraft(api, id)).notes;
      const pasted = notes
        .filter((n) => n.trackId === "track-2")
        .sort((a, b) => a.start - b.start);
      const offset = pasted[0].start;
      expect(Math.abs(offset - 4 * BAR)).toBeLessThan(ONE_PIXEL_TICKS);
      expect(
        pasted.map(({ pitch, start, duration, velocity }) => ({
          pitch,
          start: start - offset,
          duration,
          velocity,
        })),
      ).toEqual(
        BAR2_PATTERN.map((n) => ({
          pitch: n.pitch,
          start: n.start! - BAR,
          duration: n.duration,
          velocity: n.velocity,
        })),
      );
      for (const n of pasted) expect(["p1", "p2", "p3"]).not.toContain(n.id);
      expect(new Set(notes.map((n) => n.id)).size).toBe(6);
      await expect(await editItem(page, "Copy")).toBeEnabled();
      await closeEditMenu(page);
      expect(await api.history(branchId)).toHaveLength(0);
    });

    test("EDT-057 pasting into another project keeps bar positions under the destination tempo", async ({
      page,
    }) => {
      const { api, id } = await seed(page, BAR2_PATTERN);
      const second = await createProject(api, "Second Song", [], [{ id: "track-1", name: "Track 1" }], 90);
      const sourceBefore = await readDraft(api, id);
      await openEditor(page, id);
      await selectBar2Pattern(page);
      await page.keyboard.press("Control+C");
      await page.getByRole("link", { name: "Dự án của tôi" }).click();
      await page.locator(`a[href="/projects/${second.id}/edit"]`).click();
      await page.getByRole("button", { name: /^File$/ }).waitFor();
      await page.waitForLoadState("networkidle");
      await seekTo(page, 2 * BAR);
      await page.keyboard.press("Control+V");

      await expect
        .poll(async () => (await readDraft(api, second.id)).notes.length, { timeout: 8_000 })
        .toBe(3);
      const pastedStarts = (await readDraft(api, second.id)).notes
        .map((n) => n.start)
        .sort((x, y) => x - y);
      expect(Math.abs(pastedStarts[0] - 2 * BAR)).toBeLessThan(ONE_PIXEL_TICKS);
      expect(pastedStarts.map((t) => t - pastedStarts[0])).toEqual([0, 240, 720]);
      expect(await readDraft(api, id)).toEqual(sourceBefore);
    });

    test("EDT-058 a multi-track pattern is pasted onto the selected track and the next one, creating it", async ({
      page,
    }) => {
      const { api, id } = await seed(page, [
        { id: "l1", pitch: 72, start: BAR, duration: 240, trackId: "track-1" },
        { id: "b1", pitch: 48, start: BAR + PPQ, duration: 240, trackId: "track-2" },
      ]);
      await openEditor(page, id);
      await page.keyboard.press("Control+A");
      await page.keyboard.press("Control+C");
      await selectTrack(page, "Bass");
      await seekTo(page, 9 * BAR);
      await page.keyboard.press("Control+V");

      await expect
        .poll(async () => (await readDraft(api, id)).notes.length, saved)
        .toBe(4);
      const draft = await readDraft(api, id);
      expect(draft.tracks).toHaveLength(3);
      const third = draft.tracks[2]?.id;
      const pasted = draft.notes.filter((n) => n.start >= 9 * BAR);
      expect(pasted.find((n) => n.pitch === 72)?.trackId).toBe("track-2");
      expect(pasted.find((n) => n.pitch === 48)?.trackId).toBe(third);
    });

    test("EDT-059 paste does nothing when no pattern has been copied", async ({ page }) => {
      const { api, id } = await seed(page, BAR2_PATTERN);
      const before = await readDraft(api, id);
      await openEditor(page, id);
      await expect(await editItem(page, "Paste")).toBeDisabled();
      await closeEditMenu(page);
      await selectTrack(page, "Lead");
      await page.keyboard.press("Control+V");
      await page.waitForTimeout(3_500);
      expect(await readDraft(api, id)).toEqual(before);
      await expect(toolbarButton(page, "Undo")).toBeDisabled();
    });

    test("EDT-060 a pattern pasted at the last bar is kept whole past the previous end", async ({
      page,
    }) => {
      const pattern: NoteSeed[] = [
        { id: "p1", pitch: 60, start: BAR, duration: 480 },
        { id: "p2", pitch: 64, start: BAR + 2 * PPQ, duration: 480 },
        { id: "p3", pitch: 67, start: BAR + 3 * PPQ, duration: 480 },
        { id: "end", pitch: 55, start: 3 * BAR, duration: 480 },
      ];
      const { api, id } = await seed(page, pattern);
      await openEditor(page, id);
      await selectBar2Pattern(page);
      await page.keyboard.press("Control+C");
      await seekTo(page, 3 * BAR);
      await page.keyboard.press("Control+V");

      await expect
        .poll(async () => (await readDraft(api, id)).notes.length, saved)
        .toBe(7);
      const pasted = (await readDraft(api, id)).notes
        .filter((n) => !["p1", "p2", "p3", "end"].includes(n.id))
        .map((n) => n.start)
        .sort((a, b) => a - b);
      expect(Math.abs(pasted[0] - 3 * BAR)).toBeLessThan(ONE_PIXEL_TICKS);
      expect(pasted.map((t) => t - pasted[0])).toEqual([0, 2 * PPQ, 3 * PPQ]);
    });

    test("EDT-061 pasting over a note of the same pitch trims it and reports the change", async ({
      page,
    }) => {
      const { api, id } = await seed(page, [
        { id: "src", pitch: 60, start: BAR, duration: PPQ, trackId: "track-1" },
        { id: "long", pitch: 60, start: 3 * BAR, duration: 2 * PPQ, trackId: "track-2" },
      ]);
      await openEditor(page, id);
      await pickTool(page, "Select");
      await clickNote(page, { start: BAR, pitch: 60 });
      await page.keyboard.press("Control+C");
      await selectTrack(page, "Bass");
      await seekTo(page, 3 * BAR);
      await page.keyboard.press("Control+V");

      await expect
        .poll(async () => (await readDraft(api, id)).notes.length, saved)
        .toBe(3);
      const onTrack2 = (await readDraft(api, id)).notes.filter((n) => n.trackId === "track-2");
      const pasted = onTrack2.find((n) => n.id !== "long");
      expect(Math.abs(pasted!.start - 3 * BAR)).toBeLessThan(ONE_PIXEL_TICKS);
      await expect.soft(page.getByText(/cắt|trùng|chồng/i).first()).toBeVisible(quick);
      const overlaps = onTrack2.some((x) =>
        onTrack2.some(
          (y) => x !== y && x.start < y.start + y.duration && y.start < x.start + x.duration,
        ),
      );
      expect(overlaps).toBe(false);
    });
  });

  test.describe("UC-40/41 volume and pan", () => {
    async function dragSlider(page: Page, label: string, to: "left" | "right") {
      const slider = page.getByLabel(label);
      const box = (await slider.boundingBox())!;
      const y = box.y + box.height / 2;
      await page.mouse.move(box.x + box.width / 2, y);
      await page.mouse.down();
      await page.mouse.move(to === "right" ? box.x + box.width + 300 : box.x - 300, y, {
        steps: 15,
      });
      return { slider, box };
    }

    test("EDT-099 dragging the volume slider past either end stops at 100 and 0", async ({
      page,
    }) => {
      const { api, id } = await seed(page, [{ id: "n1", pitch: 60, start: 0 }]);
      await openEditor(page, id);
      const label = "Âm lượng track Lead";
      const { slider, box } = await dragSlider(page, label, "right");
      await expect(slider).toHaveValue("100");
      await page.mouse.move(box.x - 300, box.y + box.height / 2, { steps: 15 });
      await expect(slider).toHaveValue("0");
      await page.mouse.up();

      await expect
        .poll(async () => (await readDraft(api, id)).tracks[0].volume, saved)
        .toBe(0);
      await expect(slider.locator("xpath=../following-sibling::span[1]")).toHaveText("0");
    });

    test("EDT-104 the pan control stops and stores -100 and +100 at its ends", async ({
      page,
    }) => {
      const { api, id } = await seed(page, [{ id: "n1", pitch: 60, start: 0 }]);
      await openEditor(page, id);
      const label = "Pan track Lead";
      const { slider } = await dragSlider(page, label, "left");
      await page.mouse.up();
      await expect(slider).toHaveValue("-100");
      await expect
        .poll(async () => (await readDraft(api, id)).tracks[0].pan, saved)
        .toBe(-1);
      await expect(slider.locator("xpath=../following-sibling::span[1]")).toHaveText("L100");

      await dragSlider(page, label, "right");
      await page.mouse.up();
      await expect(slider).toHaveValue("100");
      await expect
        .poll(async () => (await readDraft(api, id)).tracks[0].pan, saved)
        .toBe(1);
      await expect(slider.locator("xpath=../following-sibling::span[1]")).toHaveText("R100");
    });
  });

  test.describe("UC-120 velocity lane", () => {
    async function lane(page: Page) {
      return page.evaluate(() => {
        const canvas = Array.from(document.querySelectorAll("canvas")).find(
          (c) => c.parentElement?.style.height === "104px",
        );
        if (!canvas) throw new Error("velocity lane not found");
        const r = canvas.getBoundingClientRect();
        return { left: r.left, top: r.top, height: canvas.clientHeight };
      });
    }

    function barPoint(
      l: { left: number; top: number; height: number },
      note: { start: number; duration: number },
      velocity: number,
    ) {
      const width = Math.max(3, Math.min(note.duration * 0.06 - 1, 13));
      const estimate = l.top + l.height - 8 - (velocity / 127) * (l.height - 18);
      const at = (clientY: number) =>
        Math.round(((l.height - 8 - (clientY - l.top)) / (l.height - 18)) * 127);
      let y = Math.round(estimate);
      for (let d = 0; d <= 3; d += 1) {
        if (at(y + d) === velocity) { y += d; break; }
        if (at(y - d) === velocity) { y -= d; break; }
      }
      return { x: Math.round(l.left + 72 + note.start * 0.06 + width / 2), y };
    }

    async function dragVelocity(
      page: Page,
      note: { start: number; duration: number },
      from: number,
      to: number | "bottom",
    ) {
      const l = await lane(page);
      const start = barPoint(l, note, from);
      const end = to === "bottom" ? { x: start.x, y: l.top + l.height - 1 } : barPoint(l, note, to);
      await drag(page, start, end);
    }

    async function velocities(api: UserApi, id: string) {
      return Object.fromEntries((await readDraft(api, id)).notes.map((n) => [n.id, n.velocity]));
    }

    test("EDT-109 dragging a selected note shifts every selected velocity by the same amount", async ({
      page,
    }) => {
      const { api, id } = await seed(page, [
        { id: "v60", pitch: 60, start: BAR, duration: 480, velocity: 60 },
        { id: "v80", pitch: 62, start: BAR + PPQ, duration: 480, velocity: 80 },
        { id: "v100", pitch: 64, start: BAR + 2 * PPQ, duration: 480, velocity: 100 },
      ]);
      await openEditor(page, id);
      await page.keyboard.press("Control+A");
      await dragVelocity(page, { start: BAR + PPQ, duration: 480 }, 80, 90);

      await expect
        .poll(async () => velocities(api, id), saved)
        .toEqual({ v60: 70, v80: 90, v100: 110 });
    });

    test("EDT-110 a velocity dragged past 1 or 127 stops at the boundary", async ({ page }) => {
      const { api, id } = await seed(page, [
        { id: "a", pitch: 60, start: 2 * BAR, duration: 480, velocity: 100 },
        { id: "b", pitch: 64, start: 2 * BAR + PPQ, duration: 480, velocity: 120 },
      ]);
      await openEditor(page, id);
      await page.keyboard.press("Control+A");
      const note = { start: 2 * BAR, duration: 480 };
      await dragVelocity(page, note, 100, 120);
      await expect
        .poll(async () => velocities(api, id), saved)
        .toEqual({ a: 120, b: 127 });

      await dragVelocity(page, note, 120, "bottom");
      await expect.poll(async () => (await velocities(api, id)).a, saved).toBe(1);
      const values = Object.values(await velocities(api, id));
      for (const v of values) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(127);
      }
    });
  });

  test.describe("UC-38 audio export", () => {
    async function openExport(page: Page) {
      await page.getByRole("button", { name: /^File$/ }).click();
      await page.getByRole("menuitem", { name: /export audio/i }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      return dialog;
    }

    test("EDT-088 exporting a project with no audible content warns before rendering", async ({
      page,
    }) => {
      const { id } = await seed(page, [
        { id: "l1", pitch: 72, start: 0, trackId: "track-1" },
        { id: "b1", pitch: 48, start: PPQ, trackId: "track-2" },
      ]);
      await openEditor(page, id);
      await trackCard(page, "Lead").getByTitle("Tắt tiếng track").click();
      await trackCard(page, "Bass").getByTitle("Tắt tiếng track").click();
      const dialog = await openExport(page);
      await expect(
        dialog.getByText(/không có nội dung nghe được|tắt tiếng/i).first(),
      ).toBeVisible(quick);
      await expect(dialog.getByRole("button", { name: /Xuất WAV/ })).toBeDisabled();
    });

    test("EDT-089 a rendering failure is reported with a suggestion to export a shorter range", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID108: a rendering failure shows only the raw error text (Out of memory); it does not say the export failed in plain words and does not suggest a shorter range",
      );
      const { api, id } = await seed(page, [
        { id: "l1", pitch: 72, start: 0, trackId: "track-1" },
      ]);
      const before = await readDraft(api, id);
      await page.addInitScript(() => {
        OfflineAudioContext.prototype.startRendering = function () {
          return Promise.reject(new RangeError("Out of memory"));
        };
      });
      await openEditor(page, id);
      const dialog = await openExport(page);
      let downloads = 0;
      page.on("download", () => {
        downloads += 1;
      });
      await dialog.getByRole("button", { name: /Xuất WAV/ }).click();
      await expect(dialog.getByText(/Out of memory/)).toBeVisible();

      expect(downloads).toBe(0);
      expect(await readDraft(api, id)).toEqual(before);
      await expect
        .soft(dialog.getByText(/xuất.*(thất bại|không thành công)|không xuất được/i).first())
        .toBeVisible(quick);
      await expect(dialog.getByText(/ngắn hơn|đoạn ngắn|khoảng ngắn/i).first()).toBeVisible(
        quick,
      );
    });
  });
});
