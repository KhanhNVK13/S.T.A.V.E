import { expect as baseExpect, test, type Page } from "@playwright/test";
import { UserApi, snapshotOf, type NoteSeed, type TrackSeed } from "./support/api";
import { BAR } from "./support/piano-roll";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  loginThroughUi,
  type E2eUser,
} from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });
const DFID123 = "DFID123: an accepted collaborator cannot open the shared project (owner-only project read)";

interface Person {
  user: E2eUser;
  username: string;
  api: UserApi;
}

const TRACKS: TrackSeed[] = [
  { id: "track-1", name: "Track 1" },
  { id: "track-2", name: "Track 2" },
];
const NOTES: NoteSeed[] = [{ id: "n1", pitch: 60, start: 0 }, { id: "n2", pitch: 64, start: BAR, trackId: "track-2" }];

async function person(label: string): Promise<Person> {
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

async function shared(level: "view" | "edit") {
  const a = await person("A");
  const b = await person("B");
  const project = await a.api.createProject("Test Song");
  await a.api.putDraft(project.id, NOTES, TRACKS);
  const first = await a.api.commit(project.branchId, "Verse idea");
  await a.api.call("POST", `/projects/${project.id}/collaborators`, { identifier: b.username, permissionLevel: level });
  const [inv] = (await b.api.call("GET", "/users/me/collaboration-invitations")) as Array<{ id: string }>;
  await b.api.call("POST", `/users/me/collaboration-invitations/${inv.id}/accept`);
  return { a, b, ...project, first };
}

function snapshotWith(change: (s: ReturnType<typeof snapshotOf>) => void) {
  const s = snapshotOf(NOTES, TRACKS);
  change(s);
  return s;
}

async function openAsCollaborator(page: Page, who: Person, projectId: string) {
  await loginThroughUi(page, who.user);
  await page.goto(`/projects/${projectId}/edit`);
  await page.getByRole("button", { name: /^File$/ }).waitFor({ timeout: 30_000 });
}

const DRAFT_EDITS: Array<[string, string, (s: ReturnType<typeof snapshotOf>) => void, string]> = [
  ["EDT-014", "a view-only collaborator cannot add notes", (s) => s.notes.push({ ...s.notes[0], id: "x", pitch: 72 }), "Vẽ"],
  ["EDT-023", "a view-only collaborator cannot move or resize notes", (s) => (s.notes[0].pitch = 61), "Select"],
  ["EDT-028", "a view-only collaborator cannot delete notes", (s) => s.notes.splice(0, 1), "Erase"],
  ["EDT-033", "a view-only collaborator is not offered Add track", (s) => s.tracks.push({ ...s.tracks[0], id: "track-3", order: 2 }), "Add track"],
  ["EDT-041", "a view-only collaborator is not offered Remove track", (s) => s.tracks.splice(1, 1), "Remove track"],
  ["EDT-045", "the instrument dropdown is read-only for a view-only collaborator", (s) => (s.tracks[0].instrument = "Acoustic Guitar (nylon)"), "instrument"],
  ["EDT-050", "Quantize is unavailable to a view-only collaborator", (s) => (s.notes[0].start = 10), "Quantize"],
  ["EDT-062", "Paste is unavailable to a view-only collaborator", (s) => s.notes.push({ ...s.notes[0], id: "p", start: 2 * BAR }), "Paste"],
  ["EDT-065", "the colour swatch cannot be changed by a view-only collaborator", (s) => (s.tracks[0].color = "#ef4444"), "colour"],
  ["EDT-071", "a view-only collaborator cannot edit a track label", (s) => (s.tracks[0].name = "Renamed"), "label"],
  ["EDT-102", "the pan control is read-only for a view-only collaborator", (s) => (s.tracks[0].pan = 0.4), "pan"],
  ["AUD-035", "mapping a custom sound is unavailable to a view-only collaborator", (s) => ((s.tracks[0] as Record<string, unknown>).soundMap = { "36": "00000000-0000-4000-8000-000000000000" }), "Map to note"],
];

test.describe("Collaborator permissions", () => {
  test.setTimeout(150_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  for (const [id, title, change] of DRAFT_EDITS) {
    test(`Blocked by DFID123, ${id} ${title}`, async ({ page }) => {
      test.fail(true, DFID123);
      const { a, b, id: projectId } = await shared("view");
      const before = await a.api.draft(projectId);
      expect(await status(b.api.call("PUT", `/projects/${projectId}/draft`, snapshotWith(change)))).toBe(403);
      expect(await a.api.draft(projectId)).toEqual(before);
      await openAsCollaborator(page, b, projectId);
      await expect(page.getByText(/chỉ có quyền xem|quyền xem/i).first()).toBeVisible();
    });
  }

  test("Blocked by DFID123, VC-006 a view-only collaborator cannot commit", async ({ page }) => {
    test.fail(true, DFID123);
    const { a, b, id, branchId } = await shared("view");
    const before = await a.api.history(branchId);
    expect(await status(b.api.commit(branchId, "Sneaky"))).toBe(403);
    expect(await a.api.history(branchId)).toEqual(before);
    await openAsCollaborator(page, b, id);
    await expect(page.getByRole("button", { name: /commit changes/i })).toHaveCount(0);
  });

  test("Blocked by DFID123, VC-040 a view-only collaborator is not offered restore", async ({ page }) => {
    test.fail(true, DFID123);
    const { a, b, id, branchId, first } = await shared("view");
    await a.api.putDraft(id, [...NOTES, { id: "n3", start: 2 * BAR }], TRACKS);
    await a.api.commit(branchId, "Change chorus");
    const before = await a.api.history(branchId);
    expect(await status(b.api.restore(first.id, branchId))).toBe(403);
    expect(await a.api.history(branchId)).toEqual(before);
    await openAsCollaborator(page, b, id);
    await expect(page.getByRole("button", { name: /khôi phục/i })).toHaveCount(0);
  });

  test("Blocked by DFID123, VC-047 no draft is saved for a view-only collaborator", async ({ page }) => {
    test.fail(true, DFID123);
    const { b, id } = await shared("view");
    expect(await status(b.api.call("PUT", `/projects/${id}/draft`, snapshotOf([...NOTES, { id: "z" }], TRACKS)))).toBe(403);
    await openAsCollaborator(page, b, id);
    await expect(page.getByText(/quyền xem/i).first()).toBeVisible();
  });

  test("Blocked by DFID123, BRN-010 a view-only collaborator cannot create a branch", async ({ page }) => {
    test.fail(true, DFID123);
    const { a, b, id } = await shared("view");
    expect(await status(b.api.createBranch(id, "sneaky"))).toBe(403);
    expect(await a.api.branchNames(id)).toEqual(["main"]);
    await loginThroughUi(page, b.user);
    await page.goto(`/projects/${id}?tab=branches`);
    await expect(page.getByRole("button", { name: "Tạo nhánh" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Test Song" })).toBeVisible();
  });

  test("Blocked by DFID123, BRN-032 a view-only collaborator is not offered merge", async ({ page }) => {
    test.fail(true, DFID123);
    const { a, b, id, branchId } = await shared("view");
    const alt = await a.api.createBranch(id, "alt-chorus");
    await a.api.commitOnBranch(id, branchId, alt.id, [...NOTES, { id: "a1", start: 8 * BAR, trackId: "track-2" }], "Alt notes");
    const mainBefore = await a.api.head(branchId);
    expect(await status(b.api.merge(alt.id, branchId))).toBe(403);
    expect((await a.api.head(branchId)).id).toBe(mainBefore.id);
    await loginThroughUi(page, b.user);
    await page.goto(`/projects/${id}?tab=branches`);
    await expect(page.getByRole("heading", { name: "Test Song" })).toBeVisible();
    await expect(page.getByRole("button", { name: /hợp nhất vào main/i })).toHaveCount(0);
  });

  test("Blocked by DFID123, BRN-041 a view-only collaborator cannot delete a branch", async ({ page }) => {
    test.fail(true, DFID123);
    const { a, b, id } = await shared("view");
    const experiment = await a.api.createBranch(id, "experiment");
    expect(await status(b.api.call("DELETE", `/branches/${experiment.id}`))).toBe(403);
    expect(await a.api.branchNames(id)).toContain("experiment");
    await loginThroughUi(page, b.user);
    await page.goto(`/projects/${id}?tab=branches`);
    await expect(page.getByRole("heading", { name: "Test Song" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Xoá nhánh experiment" })).toHaveCount(0);
  });

  test("Blocked by DFID123, AUTH-100 a permission change takes effect during an open session", async ({ page }) => {
    test.fail(true, DFID123);
    const { a, b, id, branchId } = await shared("edit");
    const rows = (await a.api.call("GET", `/projects/${id}/collaborators`)) as Array<{ id: string }>;
    await a.api.call("PATCH", `/projects/${id}/collaborators/${rows[0].id}`, { permissionLevel: "view" });
    expect(await status(b.api.call("PUT", `/projects/${id}/draft`, snapshotOf([...NOTES, { id: "z" }], TRACKS)))).toBe(403);
    expect(await status(b.api.commit(branchId, "Late"))).toBe(403);
    await openAsCollaborator(page, b, id);
    await expect(page.getByText(/quyền xem/i).first()).toBeVisible();
  });

  for (const [caseId, title, call] of [
    ["PRJ-014", "a collaborator cannot edit project details", (b: Person, id: string) => b.api.call("PATCH", `/projects/${id}`, { name: "Hijacked" })],
    ["PRJ-022", "a collaborator cannot archive the project", (b: Person, id: string) => b.api.archive(id)],
    ["PRJ-028", "a collaborator cannot delete the project", (b: Person, id: string) => b.api.call("DELETE", `/projects/${id}`)],
    ["PRJ-039", "a collaborator cannot change visibility", (b: Person, id: string) => b.api.setVisibility(id, "public")],
  ] as const) {
    test(`Blocked by DFID123, ${caseId} ${title}`, async ({ page }) => {
      test.fail(true, `${DFID123}; the project is also missing from the collaborator's dashboard`);
      const { a, b, id } = await shared("edit");
      expect(await status(call(b, id))).toBeGreaterThanOrEqual(400);
      const project = (await a.api.call("GET", `/projects/${id}`)) as { name: string; visibility: string; archived_at: string | null };
      expect(project).toMatchObject({ name: "Test Song", visibility: "private", archived_at: null });
      await loginThroughUi(page, b.user);
      await page.goto("/projects");
      await expect(page.getByText("Test Song")).toBeVisible();
    });
  }
});
