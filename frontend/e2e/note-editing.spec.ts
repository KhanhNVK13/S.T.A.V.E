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
  HEADER_H,
  KEY_WIDTH,
  point,
  PPQ,
  ROW_H,
  scrollGrid,
  SIXTEENTH,
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
  tracks: Array<{ id: string; name: string }>;
  notes: FullNote[];
}

async function seed(
  page: Page,
  notes: NoteSeed[],
  options: { tracks?: TrackSeed[]; commit?: boolean } = {},
) {
  const user = await createE2eUser();
  await createE2eProfile(user);
  const api = await UserApi.for(user);
  const project = await api.createProject("Test Song");
  await api.call(
    "PUT",
    `/projects/${project.id}/draft`,
    snapshotOf(notes, options.tracks),
  );
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

async function putStatus(api: UserApi, projectId: string, body: unknown) {
  try {
    await api.call("PUT", `/projects/${projectId}/draft`, body);
    return 200;
  } catch (error) {
    return Number(/-> (\d+)/.exec(String(error))?.[1] ?? 0);
  }
}

test.describe("Note editing in the piano roll", () => {
  test.setTimeout(150_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test("EDT-010 a click without dragging creates a note one 1/16 subdivision long", async ({
    page,
  }) => {
    const { api, id, branchId } = await seed(page, []);
    await openEditor(page, id);
    await pickTool(page, "Draw");
    await page.getByRole("button", { name: "1/16", exact: true }).click();
    const g = await scrollGrid(page, { pitch: 62 });
    const p = point(g, 3 * BAR + 30, 62);
    await page.mouse.click(p.x, p.y);

    await expect
      .poll(async () => (await readDraft(api, id)).notes.length, saved)
      .toBe(1);
    const [note] = (await readDraft(api, id)).notes;
    expect(note).toMatchObject({
      pitch: 62,
      start: 3 * BAR,
      duration: SIXTEENTH,
      trackId: "track-1",
    });
    expect(await api.history(branchId)).toHaveLength(0);
  });

  test("EDT-012 a note outside pitch 0 to 127 is not created", async ({ page }) => {
    test.fail(
      true,
      "DFID088: the draft API accepts notes with pitch 128 and -1; the pitch field is only checked to be an integer",
    );
    const { api, id } = await seed(page, [{ id: "n1", pitch: 60, start: 0 }]);
    await openEditor(page, id);
    await pickTool(page, "Draw");
    const g = await scrollGrid(page, { pitch: 127 });
    expect(g.scrollTop).toBe(0);
    await page.mouse.click(g.left + KEY_WIDTH + 200, g.top + HEADER_H - 10);
    await page.waitForTimeout(3_500);
    expect((await readDraft(api, id)).notes).toHaveLength(1);

    const base = snapshotOf([{ id: "n1", pitch: 60, start: 0 }]);
    const withPitch = (pitch: number) => ({
      ...base,
      notes: [...base.notes, { ...base.notes[0], id: `bad-${pitch}`, pitch }],
    });
    expect.soft(await putStatus(api, id, withPitch(128))).toBe(400);
    expect.soft(await putStatus(api, id, withPitch(-1))).toBe(400);
    const after = await readDraft(api, id);
    expect(after.notes.map((n) => n.pitch)).toEqual([60]);
  });

  test("EDT-013 clicking an existing note with the draw tool selects it instead of stacking a duplicate", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID089: the draw tool never checks for an existing note; clicking on a note stacks a second note of the same pitch on top of it and nothing is selected",
    );
    const { api, id } = await seed(page, [
      { id: "n1", pitch: 60, start: 0, duration: PPQ },
    ]);
    await openEditor(page, id);
    await pickTool(page, "Draw");
    const g = await scrollGrid(page, { pitch: 60 });
    const p = point(g, PPQ / 2, 60);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(3_500);

    await expect
      .soft(page.getByRole("button", { name: "Copy", exact: true }))
      .toBeEnabled(quick);
    expect((await readDraft(api, id)).notes).toHaveLength(1);
  });

  test("EDT-015 no note can be added to an archived project", async ({ page }) => {
    const { api, id } = await seed(page, [{ id: "n1", pitch: 60, start: 0 }], {
      commit: true,
    });
    await api.archive(id);
    await page.goto(`/projects/${id}/edit`);
    await expect(page.getByText(/đã được lưu trữ/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Draw", exact: true })).toHaveCount(0);
    await expect(page.locator("canvas")).toHaveCount(0);
    expect((await readDraft(api, id)).notes.map((n) => n.id)).toEqual(["n1"]);
  });

  test("EDT-016 notes at pitch 0 and pitch 127 are accepted", async ({ page }) => {
    const { api, id } = await seed(page, [{ id: "n1", pitch: 60, start: 0 }]);
    await openEditor(page, id);
    await pickTool(page, "Draw");

    let g = await scrollGrid(page, { pitch: 0, tick: 5 * BAR });
    let p = point(g, 5 * BAR + 30, 0);
    await page.mouse.click(p.x, p.y);
    g = await scrollGrid(page, { pitch: 127, tick: 5 * BAR });
    p = point(g, 6 * BAR + 30, 127);
    await page.mouse.click(p.x, p.y);

    await expect
      .poll(async () => (await readDraft(api, id)).notes.length, saved)
      .toBe(3);
    const notes = (await readDraft(api, id)).notes;
    const low = notes.find((n) => n.pitch === 0);
    const high = notes.find((n) => n.pitch === 127);
    expect(low?.start).toBe(5 * BAR);
    expect(high?.start).toBe(6 * BAR);
    expect(new Set(notes.map((n) => n.id)).size).toBe(3);
    expect([low?.id, high?.id]).not.toContain("n1");
  });

  test("EDT-018 moving several selected notes applies one movement and rejects a gesture that would leave the range", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID090: a group move that would push one note past 127 is not rejected; the whole group is shifted by the largest step that still fits",
    );
    const { api, id } = await seed(page, [
      { id: "a", pitch: 60, start: BAR, duration: 240 },
      { id: "b", pitch: 64, start: BAR + PPQ, duration: 240 },
      { id: "c", pitch: 126, start: BAR + 2 * PPQ, duration: 240 },
    ]);
    await openEditor(page, id);
    await pickTool(page, "Select");

    let g = await scrollGrid(page, { pitch: 62 });
    const a = point(g, BAR + 60, 60);
    const b = point(g, BAR + PPQ + 60, 64);
    await page.mouse.click(a.x, a.y);
    await page.keyboard.down("Shift");
    await drag(page, b, { x: b.x, y: b.y - 2 * ROW_H });
    await page.keyboard.up("Shift");
    await expect
      .poll(
        async () =>
          Object.fromEntries((await readDraft(api, id)).notes.map((n) => [n.id, n.pitch])),
        saved,
      )
      .toEqual({ a: 62, b: 66, c: 126 });

    g = await scrollGrid(page, { pitch: 126 });
    const c = point(g, BAR + 2 * PPQ + 60, 126);
    await page.mouse.click(c.x, c.y);
    g = await scrollGrid(page, { pitch: 62 });
    const a2 = point(g, BAR + 60, 62);
    await page.keyboard.down("Shift");
    await drag(page, a2, { x: a2.x, y: a2.y - 3 * ROW_H });
    await page.keyboard.up("Shift");
    await page.waitForTimeout(3_500);

    const pitches = Object.fromEntries(
      (await readDraft(api, id)).notes.map((n) => [n.id, n.pitch]),
    );
    expect(pitches).toEqual({ a: 62, b: 66, c: 126 });
  });

  test("EDT-019 dragging a note onto another note of the same pitch trims the overlap", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID091: moving a note onto another note of the same pitch leaves both notes overlapping; nothing is trimmed and no message is shown",
    );
    const { api, id } = await seed(page, [
      { id: "n1", pitch: 60, start: 0, duration: PPQ },
      { id: "n2", pitch: 60, start: PPQ, duration: PPQ },
    ]);
    await openEditor(page, id);
    await pickTool(page, "Select");
    const g = await scrollGrid(page, { pitch: 60 });
    const from = point(g, 120, 60);
    await drag(page, from, { x: from.x + (PPQ / 2) * g.pxPerTick, y: from.y });
    await expect
      .poll(
        async () => (await readDraft(api, id)).notes.find((n) => n.id === "n1")?.start,
        saved,
      )
      .toBe(PPQ / 2);

    const notes = (await readDraft(api, id)).notes.filter((n) => n.pitch === 60);
    const overlaps = notes.some((x) =>
      notes.some(
        (y) => x !== y && x.start < y.start + y.duration && y.start < x.start + x.duration,
      ),
    );
    expect.soft(overlaps).toBe(false);
    expect(notes.map((n) => n.id)).toContain("n1");
  });

  test("EDT-020 dragging a note past pitch 127 or below pitch 0 stops it at the boundary", async ({
    page,
  }) => {
    const { api, id } = await seed(page, [
      { id: "hi", pitch: 126, start: 0, duration: PPQ },
      { id: "lo", pitch: 1, start: BAR, duration: PPQ },
    ]);
    await openEditor(page, id);
    await pickTool(page, "Select");

    let g = await scrollGrid(page, { pitch: 126 });
    const hi = point(g, 120, 126);
    await drag(page, hi, { x: hi.x, y: Math.max(g.top + 4, hi.y - 3 * ROW_H) });
    g = await scrollGrid(page, { pitch: 0 });
    const lo = point(g, BAR + 120, 1);
    await drag(page, lo, {
      x: lo.x,
      y: Math.min(g.top + g.height - 4, lo.y + 3 * ROW_H),
    });

    await expect
      .poll(
        async () =>
          Object.fromEntries((await readDraft(api, id)).notes.map((n) => [n.id, n.pitch])),
        saved,
      )
      .toEqual({ hi: 127, lo: 0 });
  });

  test("EDT-021 dragging a note before the start of the project stops it at the start", async ({
    page,
  }) => {
    const { api, id } = await seed(page, [
      { id: "n1", pitch: 67, start: PPQ, duration: PPQ },
    ]);
    await openEditor(page, id);
    await page.getByTitle("Thu nhỏ").click();
    await expect(page.getByText("75%", { exact: true })).toBeVisible();
    await pickTool(page, "Select");
    const g = await scrollGrid(page, { pitch: 67 });
    const from = point(g, PPQ + 120, 67);
    const to = { x: from.x - 4 * PPQ * g.pxPerTick, y: from.y };
    expect(to.x).toBeGreaterThan(g.left);
    await drag(page, from, to);

    await expect
      .poll(async () => (await readDraft(api, id)).notes[0]?.start, saved)
      .toBe(0);
    const [note] = (await readDraft(api, id)).notes;
    expect(note).toMatchObject({ id: "n1", pitch: 67 });
  });

  test("EDT-022 resizing a note to zero length keeps the smallest allowed duration", async ({
    page,
  }) => {
    const { api, id } = await seed(page, [
      { id: "n1", pitch: 60, start: 0, duration: PPQ },
    ]);
    await openEditor(page, id);
    await pickTool(page, "Select");
    const g = await scrollGrid(page, { pitch: 60 });
    const edge = point(g, PPQ, 60);
    const from = { x: edge.x - 3, y: edge.y };
    await drag(page, from, { x: from.x - 60, y: from.y });

    await expect
      .poll(async () => (await readDraft(api, id)).notes[0]?.duration, saved)
      .toBe(SIXTEENTH);
    const notes = (await readDraft(api, id)).notes;
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ id: "n1", start: 0, pitch: 60 });
  });

  test("EDT-024 deleting a selected note keeps the change in the draft and the last commit still holds it", async ({
    page,
  }) => {
    const { api, id, branchId } = await seed(
      page,
      [{ id: "n1", pitch: 60, start: 0, duration: PPQ }],
      { commit: true },
    );
    const commitsBefore = await api.history(branchId);
    await openEditor(page, id);
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    await expect(undo).toBeDisabled();
    await pickTool(page, "Select");
    const g = await scrollGrid(page, { pitch: 60 });
    const p = point(g, 120, 60);
    await page.mouse.click(p.x, p.y);
    await page.keyboard.press("Delete");

    await expect(undo).toBeEnabled(quick);
    await expect
      .poll(async () => (await readDraft(api, id)).notes.length, saved)
      .toBe(0);
    expect(await api.history(branchId)).toHaveLength(commitsBefore.length);
    const head = await api.head(branchId);
    expect(head.id).toBe(commitsBefore[0].id);
    expect((await api.commitSnapshot(head.id)).notes.map((n) => n.id)).toEqual(["n1"]);
  });

  test("EDT-025 notes selected with a selection rectangle are deleted in one action", async ({
    page,
  }) => {
    const { api, id } = await seed(page, [
      { id: "keep", pitch: 60, start: 0, duration: 240 },
      { id: "a", pitch: 60, start: BAR, duration: 240 },
      { id: "b", pitch: 62, start: BAR + PPQ, duration: 240 },
      { id: "c", pitch: 64, start: BAR + 2 * PPQ, duration: 240 },
    ]);
    await openEditor(page, id);
    await pickTool(page, "Select");
    const g = await scrollGrid(page, { pitch: 62 });
    await drag(page, point(g, BAR - 60, 66), point(g, 2 * BAR - 60, 58));
    await page.keyboard.press("Delete");
    await expect
      .poll(async () => (await readDraft(api, id)).notes.map((n) => n.id), saved)
      .toEqual(["keep"]);

    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect
      .poll(
        async () => (await readDraft(api, id)).notes.map((n) => n.id).sort(),
        saved,
      )
      .toEqual(["a", "b", "c", "keep"]);
  });

  test("EDT-026 undo restores a deleted note with its original identifier", async ({
    page,
  }) => {
    const { api, id } = await seed(page, [
      { id: "n1", pitch: 60, start: 0, duration: PPQ, velocity: 73 },
    ]);
    const original = (await readDraft(api, id)).notes[0];
    await openEditor(page, id);
    await pickTool(page, "Select");
    const g = await scrollGrid(page, { pitch: 60 });
    const p = point(g, 120, 60);
    await page.mouse.click(p.x, p.y);
    await page.keyboard.press("Delete");
    await expect
      .poll(async () => (await readDraft(api, id)).notes.length, saved)
      .toBe(0);

    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect
      .poll(async () => (await readDraft(api, id)).notes, saved)
      .toEqual([original]);
  });

  test("EDT-027 pressing Delete with no note selected does nothing", async ({ page }) => {
    const { api, id } = await seed(page, [
      { id: "n1", pitch: 60, start: 0, duration: PPQ },
      { id: "n2", pitch: 64, start: PPQ, duration: PPQ },
    ]);
    const before = await readDraft(api, id);
    await openEditor(page, id);
    await pickTool(page, "Select");
    const g = await scrollGrid(page, { pitch: 62 });
    const empty = point(g, 3 * BAR, 62);
    await page.mouse.click(empty.x, empty.y);
    await page.keyboard.press("Delete");
    await page.waitForTimeout(3_500);

    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
    expect(await readDraft(api, id)).toEqual(before);
  });

  test("EDT-029 deleting every note on a track empties it but keeps the track", async ({
    page,
  }) => {
    const tracks = [
      { id: "track-1", name: "Lead" },
      { id: "track-2", name: "Bass" },
    ];
    const { api, id } = await seed(
      page,
      [
        { id: "l1", pitch: 60, start: 0, duration: 240, trackId: "track-1" },
        { id: "l2", pitch: 62, start: PPQ, duration: 240, trackId: "track-1" },
        { id: "b1", pitch: 48, start: 2 * BAR, duration: 240, trackId: "track-2" },
        { id: "b2", pitch: 50, start: 2 * BAR + PPQ, duration: 240, trackId: "track-2" },
        { id: "b3", pitch: 52, start: 2 * BAR + 2 * PPQ, duration: 240, trackId: "track-2" },
      ],
      { tracks },
    );
    await openEditor(page, id);
    await pickTool(page, "Select");
    const g = await scrollGrid(page, { pitch: 50 });
    await drag(page, point(g, 2 * BAR - 60, 54), point(g, 3 * BAR - 60, 46));
    await page.keyboard.press("Delete");

    await expect
      .poll(
        async () =>
          (await readDraft(api, id)).notes.filter((n) => n.trackId === "track-2").length,
        saved,
      )
      .toBe(0);
    const draft = await readDraft(api, id);
    expect(draft.tracks.map((t) => t.id)).toEqual(["track-1", "track-2"]);
    expect(draft.notes.map((n) => n.id).sort()).toEqual(["l1", "l2"]);
    await expect(page.getByText("Bass", { exact: true }).first()).toBeVisible();
  });
});
