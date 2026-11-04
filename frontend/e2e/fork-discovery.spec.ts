import { expect as baseExpect, test, type Page } from "@playwright/test";
import { UserApi, type NoteSeed, type TrackSeed } from "./support/api";
import { BAR } from "./support/piano-roll";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  loginThroughUi,
  type E2eUser,
} from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });
const BACKEND = "http://localhost:3101";

interface Person {
  user: E2eUser;
  name: string;
  api: UserApi;
}

const TRACKS: TrackSeed[] = [
  { id: "track-1", name: "Lead", color: "#22c55e", instrument: "Acoustic Grand Piano" },
  { id: "track-2", name: "Bass", color: "#3b82f6", instrument: "Electric Bass (finger)" },
];
const NOTES: NoteSeed[] = [
  { id: "n1", pitch: 60, start: 0 },
  { id: "n2", pitch: 40, start: BAR, trackId: "track-2" },
];

async function person(label: string): Promise<Person> {
  const user = await createE2eUser();
  const name = `User ${label}`;
  await createE2eProfile(user, { username: `${label.toLowerCase()}_${user.id.slice(0, 6)}`, display_name: name });
  return { user, name, api: await UserApi.for(user) };
}

async function status(call: Promise<unknown>) {
  try {
    await call;
    return 200;
  } catch (error) {
    return Number(/-> (\d+)/.exec(String(error))?.[1] ?? 0);
  }
}

async function publicSong(b: Person, commits = 3) {
  const project = await b.api.createProject("Public Song");
  for (let i = 0; i < commits; i += 1) {
    await b.api.putDraft(project.id, [...NOTES, ...Array.from({ length: i }, (_, k) => ({ id: `x${k}`, pitch: 70 + k, start: (k + 2) * BAR }))], TRACKS);
    await b.api.commit(project.branchId, `Commit ${i + 1}`);
  }
  await b.api.setVisibility(project.id, "public");
  return project;
}

async function forkCount(id: string) {
  const res = await fetch(`${BACKEND}/explore/projects/${id}`);
  return ((await res.json()) as { fork_count: number }).fork_count;
}

async function myProjects(who: Person) {
  return (await who.api.call("GET", "/projects")) as Array<{ id: string; name: string; visibility: string; forked_from_project_id: string | null }>;
}

async function notificationTypes(who: Person) {
  const body = (await who.api.call("GET", "/notifications")) as { items: Array<{ type: string }> };
  return body.items.map((n) => n.type);
}

async function login(page: Page, who: Person) {
  await page.locator('input[name="email"]').fill(who.user.email);
  await page.locator('input[name="password"]').fill(who.user.password);
  await page.locator('form button[type="submit"]').click();
}

test.describe("Fork and discovery", () => {
  test.setTimeout(180_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test("DISC-010 a guest selecting Fork is sent to log in and returned to the project", async ({ page }) => {
    const b = await person("B");
    const a = await person("A");
    const pub = await publicSong(b, 1);
    await page.goto(`/projects/${pub.id}`);
    await page.getByRole("button", { name: /^Fork/ }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(await myProjects(a)).toHaveLength(0);
    await login(page, a);
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+(\/edit)?$/);
    await expect.poll(async () => (await myProjects(a)).length).toBe(1);
  });

  test("Blocked by DFID132, DISC-021 rankings default to this week and switch between periods", async ({ page }) => {
    test.fail(true, "DFID132: rankings have no period selection (this week, this month, all time)");
    const b = await person("B");
    const pub = await publicSong(b, 1);
    await fetch(`${BACKEND}/explore/projects/${pub.id}`);
    await page.goto("/rankings");
    await expect(page.locator('main a[href^="/projects/"]').first()).toBeVisible();
    await expect(page.getByRole("tab", { name: /tuần này|this week/i })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: /tháng này|this month/i }).click();
    await page.getByRole("tab", { name: /mọi lúc|all time/i }).click();
  });

  test("Blocked by DFID132, DISC-022 an empty period suggests choosing a longer period", async ({ page }) => {
    test.fail(true, "DFID132: rankings have no period selection, so there is no empty period state");
    await page.goto("/rankings");
    await expect(page.getByText(/khoảng thời gian dài hơn|longer period/i)).toBeVisible();
  });

  test("Blocked by DFID131, DISC-027 forks a public project with its full history and shows its origin", async ({ page }) => {
    test.fail(true, "DFID131: the fork does not show its origin anywhere");
    const b = await person("B");
    const a = await person("A");
    const pub = await publicSong(b, 3);
    const countBefore = await forkCount(pub.id);
    const publicHead = await b.api.head(pub.branchId);
    await loginThroughUi(page, a.user);
    await page.goto(`/projects/${pub.id}`);
    await page.getByRole("button", { name: /^Fork/ }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+\/edit$/);
    const forkId = /\/projects\/([0-9a-f-]+)\/edit/.exec(page.url())![1];
    const fork = (await myProjects(a)).find((p) => p.id === forkId)!;
    expect(fork.visibility).toBe("private");
    const forkMain = (await a.api.branches(forkId)).find((x) => x.is_default)!.id;
    expect((await a.api.history(forkMain)).map((c) => c.message)).toEqual(["Commit 3", "Commit 2", "Commit 1"]);
    const draft = (await a.api.call("GET", `/projects/${forkId}/draft`)) as { tracks: Array<{ name: string; color: string; instrument: string }>; notes: unknown[] };
    expect(draft.tracks.map((t) => [t.name, t.color, t.instrument])).toEqual(TRACKS.map((t) => [t.name, t.color, t.instrument]));
    expect(draft.notes).toHaveLength(4);
    expect(await forkCount(pub.id)).toBe(countBefore + 1);
    expect((await b.api.head(pub.branchId)).id).toBe(publicHead.id);
    expect(await notificationTypes(b)).toContain("fork.created");
    await page.goto(`/projects/${forkId}`);
    await expect(page.getByText(/Public Song/).filter({ hasText: new RegExp(b.name) }).first()).toBeVisible({ timeout: 5_000 });
  });

  test("DISC-028 a guest who selects Fork logs in and the fork is completed", async ({ page }) => {
    const b = await person("B");
    const a = await person("A");
    const pub = await publicSong(b, 1);
    const countBefore = await forkCount(pub.id);
    await page.goto(`/projects/${pub.id}`);
    await page.getByRole("button", { name: /^Fork/ }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(await myProjects(a)).toHaveLength(0);
    await login(page, a);
    await expect.poll(async () => (await myProjects(a)).length, { timeout: 60_000 }).toBe(1);
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+\/edit$/, { timeout: 30_000 });
    const mine = await myProjects(a);
    expect(mine).toHaveLength(1);
    expect(mine[0].visibility).toBe("private");
    expect(await forkCount(pub.id)).toBe(countBefore + 1);
  });

  test("DISC-030 forking fails when the project was made private after the page loaded", async ({ page }) => {
    const b = await person("B");
    const a = await person("A");
    const pub = await publicSong(b, 1);
    await loginThroughUi(page, a.user);
    await page.goto(`/projects/${pub.id}`);
    await expect(page.getByRole("button", { name: /^Fork/ })).toBeVisible();
    await b.api.setVisibility(pub.id, "private");
    await page.getByRole("button", { name: /^Fork/ }).click();
    await expect(page.getByText(/không còn công khai|không fork được/i).first()).toBeVisible();
    expect(await myProjects(a)).toHaveLength(0);
  });

  test("DISC-031 the owner is not offered Fork and the API refuses it", async ({ page }) => {
    const b = await person("B");
    const pub = await publicSong(b, 1);
    expect(await status(b.api.call("POST", `/projects/${pub.id}/fork`))).toBe(400);
    expect(await myProjects(b)).toHaveLength(1);
    await loginThroughUi(page, b.user);
    await page.goto(`/projects/${pub.id}`);
    await expect(page.getByRole("heading", { name: "Public Song" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Fork/ })).toHaveCount(0);
  });

  test("DISC-033 fork and original develop independently", async () => {
    const b = await person("B");
    const a = await person("A");
    const pub = await publicSong(b, 1);
    const fork = (await a.api.call("POST", `/projects/${pub.id}/fork`)) as { id: string };
    const forkMain = (await a.api.branches(fork.id)).find((x) => x.is_default)!.id;
    await a.api.putDraft(fork.id, [...NOTES, { id: "f1", pitch: 72, start: 3 * BAR }], TRACKS);
    await a.api.commit(forkMain, "Fork change");
    await b.api.putDraft(pub.id, [...NOTES, { id: "o1", pitch: 74, start: 3 * BAR }], TRACKS);
    await b.api.commit(pub.branchId, "Original change");
    const forkHistory = (await a.api.history(forkMain)).map((c) => c.message);
    const originalHistory = (await b.api.history(pub.branchId)).map((c) => c.message);
    expect(forkHistory).toContain("Fork change");
    expect(forkHistory).not.toContain("Original change");
    expect(originalHistory).toContain("Original change");
    expect(originalHistory).not.toContain("Fork change");
  });

  test("Blocked by DFID131, DISC-034 the fork keeps its origin attribution after the original is deleted", async ({ page }) => {
    test.fail(true, "DFID131: the fork does not show its origin anywhere");
    const b = await person("B");
    const a = await person("A");
    const pub = await publicSong(b, 2);
    const fork = (await a.api.call("POST", `/projects/${pub.id}/fork`)) as { id: string };
    await b.api.call("DELETE", `/projects/${pub.id}`);
    const forkMain = (await a.api.branches(fork.id)).find((x) => x.is_default)!.id;
    expect(await a.api.history(forkMain)).toHaveLength(2);
    await loginThroughUi(page, a.user);
    await page.goto(`/projects/${fork.id}`);
    await expect(page.getByRole("heading", { name: /Public Song/ })).toBeVisible();
    await expect(page.getByText(/Public Song/).filter({ hasText: new RegExp(b.name) }).first()).toBeVisible({ timeout: 5_000 });
  });
});
