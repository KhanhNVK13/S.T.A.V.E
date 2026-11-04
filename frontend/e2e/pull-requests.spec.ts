import { expect as baseExpect, test, type Browser, type Page } from "@playwright/test";
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
const API = ":3101";

interface Person {
  user: E2eUser;
  username: string;
  name: string;
  api: UserApi;
}

const TRACKS: TrackSeed[] = [
  { id: "track-1", name: "Melody" },
  { id: "track-2", name: "Harmony" },
];
const BASE: NoteSeed[] = [
  { id: "c1", pitch: 60, start: 2 * BAR },
  { id: "c2", pitch: 64, start: 4 * BAR },
];
const HARMONY: NoteSeed[] = [...BASE, { id: "h1", pitch: 67, start: 0, trackId: "track-2" }];

async function person(label: string): Promise<Person> {
  const user = await createE2eUser();
  const username = `${label.toLowerCase()}_${user.id.slice(0, 6)}`;
  const name = `User ${label}`;
  await createE2eProfile(user, { username, display_name: name });
  return { user, username, name, api: await UserApi.for(user) };
}

async function status(call: Promise<unknown>) {
  try {
    await call;
    return 200;
  } catch (error) {
    return Number(/-> (\d+)/.exec(String(error))?.[1] ?? 0);
  }
}

async function mainOf(who: Person, projectId: string) {
  return (await who.api.branches(projectId)).find((b) => b.is_default)!.id;
}

interface Scenario {
  a: Person;
  b: Person;
  publicId: string;
  publicMain: string;
  forkId: string;
  forkMain: string;
}

async function forked(options: { harmony?: boolean } = {}): Promise<Scenario> {
  const b = await person("B");
  const a = await person("A");
  const pub = await b.api.createProject("Public Song");
  await b.api.putDraft(pub.id, BASE, TRACKS);
  await b.api.commit(pub.branchId, "Verse idea");
  await b.api.setVisibility(pub.id, "public");
  const fork = (await a.api.call("POST", `/projects/${pub.id}/fork`)) as { id: string };
  const forkMain = await mainOf(a, fork.id);
  if (options.harmony !== false) {
    await a.api.putDraft(fork.id, HARMONY, TRACKS);
    await a.api.commit(forkMain, "Add harmony on track 2");
  }
  return { a, b, publicId: pub.id, publicMain: pub.branchId, forkId: fork.id, forkMain };
}

async function openPr(s: Scenario, title = "Add harmony to chorus", sourceBranchId = s.forkMain) {
  return (await s.a.api.call("POST", `/projects/${s.forkId}/pull-requests`, {
    sourceBranchId,
    targetBranchId: s.publicMain,
    title,
    description: "Adds a harmony line on track 2.",
  })) as { id: string; number: number };
}

async function conflicting(): Promise<Scenario> {
  const s = await forked({ harmony: false });
  await s.a.api.putDraft(s.forkId, [{ id: "c1", pitch: 62, start: 2 * BAR }, BASE[1]], TRACKS);
  await s.a.api.commit(s.forkMain, "Fork bar 3");
  await s.b.api.putDraft(s.publicId, [{ id: "c1", pitch: 65, start: 2 * BAR }, BASE[1]], TRACKS);
  await s.b.api.commit(s.publicMain, "Original bar 3");
  return s;
}

async function prDetail(who: Person, id: string) {
  return (await who.api.call("GET", `/pull-requests/${id}`)) as {
    pullRequest: { status: string; applicable: boolean; title: string; description: string };
    comments: Array<{ id: string; body: string; author: { id: string } | null }>;
    permissions: { canMerge: boolean; canClose: boolean; canComment: boolean };
    analysis: { conflictsCount: number } | null;
  };
}

async function headMessage(who: Person, branchId: string) {
  return (await who.api.history(branchId))[0]?.message;
}

async function lineage(who: Person, branchId: string) {
  const out: Array<{ id: string; message: string; author_id: string }> = [];
  let id: string | null = (await who.api.head(branchId)).id;
  while (id && out.length < 30) {
    const c = (await who.api.call("GET", `/commits/${id}`)) as { id: string; message: string; author_id: string; parent_commit_id: string | null; merged_from_commit_id?: string | null };
    out.push(c);
    id = c.parent_commit_id;
  }
  return out;
}

async function notificationTypes(who: Person) {
  const body = (await who.api.call("GET", "/notifications")) as { items: Array<{ type: string }> };
  return body.items.map((n) => n.type);
}

async function second(browser: Browser, who: Person) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginThroughUi(page, who.user);
  return { context, page };
}

async function openNewPrDialog(page: Page, forkId: string) {
  await page.goto(`/projects/${forkId}?tab=pulls`);
  await page.getByRole("button", { name: "Pull request mới" }).click();
  return page.getByRole("dialog", { name: "Pull request mới" });
}

async function openDetail(page: Page, id: string) {
  await page.goto(`/pull-requests/${id}`);
  await expect(page.getByRole("heading", { level: 2, name: /^Thảo luận/ })).toBeVisible();
}

function failApi(page: Page, method: string, pathPattern: RegExp) {
  return page.route(
    (url) => url.href.includes(API) && pathPattern.test(url.pathname),
    (route) =>
      route.request().method() === method ? route.fulfill({ status: 500, body: "{}" }) : route.continue(),
  );
}

async function comment(page: Page, body: string) {
  await page.locator("#pr-comment").fill(body);
  await page.getByRole("button", { name: "Bình luận", exact: true }).click();
}

test.describe("Pull requests", () => {
  test.setTimeout(180_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test.describe("UC-86 Merge conflicts", () => {
    async function branchConflict(page: Page) {
      const a = await person("A");
      const project = await a.api.createProject("Test Song");
      await a.api.putDraft(project.id, BASE, TRACKS);
      await a.api.commit(project.branchId, "Verse idea");
      const alt = await a.api.createBranch(project.id, "alt-chorus");
      await a.api.putDraft(project.id, [{ id: "c1", pitch: 65, start: 2 * BAR }, { id: "c2", pitch: 66, start: 4 * BAR }], TRACKS);
      await a.api.commit(project.branchId, "Main change");
      await a.api.commitOnBranch(
        project.id,
        project.branchId,
        alt.id,
        [{ id: "c1", pitch: 67, start: 2 * BAR }],
        "Alt change",
      );
      await loginThroughUi(page, a.user);
      return { a, id: project.id, mainId: project.branchId, altId: alt.id };
    }

    async function startMerge(page: Page, projectId: string) {
      await page.goto(`/projects/${projectId}?tab=branches`);
      await page.getByRole("button", { name: /hợp nhất vào main/i }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: /^hợp nhất$/i }).click();
      const dialog = page.getByRole("dialog", { name: /có xung đột/i });
      await expect(dialog).toBeVisible();
      return dialog;
    }

    test("Blocked by DFID125, BRN-043 Keep both includes both notes when they do not clash", async ({ page }) => {
      test.fail(true, "DFID125: the conflict screen offers only keep ours or take theirs, there is no Keep both choice");
      const { id } = await branchConflict(page);
      const dialog = await startMerge(page, id);
      await expect(dialog.getByRole("radio", { name: /giữ cả hai|keep both/i }).first()).toBeVisible({ timeout: 5_000 });
    });

    test("Blocked by DFID125, BRN-046 Keep both is refused when the notes share pitch and moment", async ({ page }) => {
      test.fail(true, "DFID125: there is no Keep both choice to refuse");
      const { id } = await branchConflict(page);
      const dialog = await startMerge(page, id);
      await expect(dialog.getByRole("radio", { name: /giữ cả hai|keep both/i }).first()).toBeVisible({ timeout: 5_000 });
    });

    test("Blocked by DFID129, BRN-047 resolution stops when someone commits to the target meanwhile", async ({ page }) => {
      test.fail(true, "DFID129: the merge is applied on top of the new target commit instead of asking to restart");
      const { a, id, mainId } = await branchConflict(page);
      const dialog = await startMerge(page, id);
      await a.api.putDraft(id, [{ id: "c1", pitch: 65, start: 2 * BAR }, { id: "c2", pitch: 66, start: 4 * BAR }, { id: "u1", pitch: 50, start: 0 }], TRACKS);
      await a.api.commit(mainId, "B update");
      await dialog.getByRole("button", { name: /xác nhận và hợp nhất/i }).click();
      await page.waitForTimeout(3_000);
      expect(await headMessage(a, mainId)).toBe("B update");
      await expect(dialog.getByRole("alert")).toContainText(/thay đổi|bắt đầu lại|tải lại|mới/i);
    });

    test("BRN-049 leaving before every conflict is resolved applies nothing", async ({ page }) => {
      const { a, id, mainId, altId } = await branchConflict(page);
      const mainBefore = await a.api.head(mainId);
      const altBefore = await a.api.head(altId);
      const dialog = await startMerge(page, id);
      await dialog.getByRole("radio").nth(1).click();
      await page.goto("/projects");
      expect((await a.api.head(mainId)).id).toBe(mainBefore.id);
      expect((await a.api.head(altId)).id).toBe(altBefore.id);
      const again = await startMerge(page, id);
      await expect(again).toContainText("2 xung đột");
    });
  });

  test.describe("UC-87 Create pull request", () => {
    test("Blocked by DFID126, DFID133, PR-001 opens a pull request from a fork to the original project", async ({ page }) => {
      test.fail(true, "DFID133: the dialog lists no commits; DFID126: no success message after creating");
      const s = await forked();
      const publicHead = await s.b.api.head(s.publicMain);
      const forkHead = await s.a.api.head(s.forkMain);
      await loginThroughUi(page, s.a.user);
      const dialog = await openNewPrDialog(page, s.forkId);
      await expect(dialog.locator('select[name="source-branch"] option:checked')).toHaveText(/main/);
      await expect(dialog.locator('select[name="target-branch"] option:checked')).toHaveText(/main/);
      await expect(dialog).toContainText("Public Song");
      await expect(dialog).toContainText("1 commit mới");
      await expect(dialog).toContainText("+1 nốt");
      await dialog.locator('input[name="title"]').fill("Add harmony to chorus");
      await dialog.locator('textarea[name="description"]').fill("Adds a harmony line on track 2.");
      await dialog.getByRole("button", { name: "Tạo pull request" }).click();
      await expect(page).toHaveURL(/\/pull-requests\//);
      await expect(page.getByText("Add harmony to chorus").first()).toBeVisible();
      await expect(page.getByText("Đang mở").first()).toBeVisible();
      expect(await notificationTypes(s.b)).toContain("pr.opened");
      expect((await s.b.api.head(s.publicMain)).id).toBe(publicHead.id);
      expect((await s.a.api.head(s.forkMain)).id).toBe(forkHead.id);
      await page.goto(`/projects/${s.forkId}?tab=pulls`);
      await page.getByRole("button", { name: "Pull request mới" }).click();
      await expect(page.getByRole("dialog", { name: "Pull request mới" })).toContainText("Add harmony on track 2", { timeout: 5_000 });
      await expect(page.getByText(/tạo pull request thành công|pull request created successfully/i)).toBeVisible({
        timeout: 5_000,
      });
    });

    test("Blocked by DFID133, PR-002 changing the source branch redoes the comparison", async ({ page }) => {
      test.fail(true, "DFID133: the summary shows only counts, not the commits of the chosen source branch");
      const s = await forked();
      const fix = await s.a.api.createBranch(s.forkId, "chorus-fix", (await s.a.api.head(s.forkMain)).id);
      await s.a.api.commitOnBranch(s.forkId, s.forkMain, fix.id, [...HARMONY, { id: "t1", pitch: 72, start: BAR }], "Fix chorus timing");
      await loginThroughUi(page, s.a.user);
      const dialog = await openNewPrDialog(page, s.forkId);
      await expect(dialog).toContainText("1 commit mới");
      await dialog.locator('select[name="source-branch"]').selectOption({ label: "chorus-fix" });
      await expect(dialog).toContainText("2 commit mới");
      await expect(dialog).toContainText("Fix chorus timing", { timeout: 5_000 });
    });

    test("PR-003 a conflicting pull request can still be opened and is marked as conflicting", async ({ page, browser }) => {
      const s = await conflicting();
      await loginThroughUi(page, s.a.user);
      const dialog = await openNewPrDialog(page, s.forkId);
      await expect(dialog).toContainText(/Có xung đột \(1\)/);
      await dialog.locator('input[name="title"]').fill("Change bar 3");
      await dialog.getByRole("button", { name: "Tạo pull request" }).click();
      await expect(page).toHaveURL(/\/pull-requests\//);
      await expect(page.getByText(/Có 1 nốt xung đột/)).toBeVisible();
      const other = await second(browser, s.b);
      await other.page.goto(page.url().replace(/^https?:\/\/[^/]+/, ""));
      await expect(other.page.getByText(/Có 1 nốt xung đột/)).toBeVisible();
      await other.context.close();
    });

    test("PR-004 a fork with nothing new cannot open a pull request", async ({ page }) => {
      const s = await forked({ harmony: false });
      await loginThroughUi(page, s.a.user);
      const dialog = await openNewPrDialog(page, s.forkId);
      await expect(dialog).toContainText(/Không có gì để đề xuất/);
      await expect(dialog.getByRole("button", { name: "Tạo pull request" })).toBeDisabled();
      expect(await status(openPr(s, "Nothing"))).toBe(400);
    });

    test("PR-005 an empty title shows an inline error and opens nothing", async ({ page }) => {
      const s = await forked();
      await loginThroughUi(page, s.a.user);
      const dialog = await openNewPrDialog(page, s.forkId);
      await expect(dialog).toContainText("1 commit mới");
      await dialog.getByRole("button", { name: "Tạo pull request" }).click();
      await expect(dialog.getByRole("alert")).toContainText("Hãy nhập tiêu đề.");
      const list = (await s.a.api.call("GET", "/pull-requests?view=created")) as unknown[];
      expect(list).toHaveLength(0);
    });

    test("PR-006 a title over the limit shows the maximum and opens nothing", async ({ page }) => {
      const s = await forked();
      await loginThroughUi(page, s.a.user);
      const dialog = await openNewPrDialog(page, s.forkId);
      await expect(dialog).toContainText("1 commit mới");
      await dialog.locator('input[name="title"]').fill("t".repeat(1000));
      await dialog.getByRole("button", { name: "Tạo pull request" }).click();
      await expect(dialog.getByRole("alert").first()).toContainText("150");
      expect((await s.a.api.call("GET", "/pull-requests?view=created")) as unknown[]).toHaveLength(0);
    });

    test("Blocked by DFID143, PR-007 no pull request can be sent when the original became private", async ({ page }) => {
      test.fail(true, "DFID143: the New pull request button disappears without explaining why");
      const s = await forked();
      await s.b.api.setVisibility(s.publicId, "private");
      const forkHead = await s.a.api.head(s.forkMain);
      expect(await status(openPr(s, "Late proposal"))).toBeGreaterThanOrEqual(400);
      expect((await s.a.api.call("GET", "/pull-requests?view=created")) as unknown[]).toHaveLength(0);
      expect((await s.a.api.head(s.forkMain)).id).toBe(forkHead.id);
      expect(JSON.stringify(await s.a.api.call("GET", "/projects"))).toContain(s.forkId);
      await loginThroughUi(page, s.a.user);
      await page.goto(`/projects/${s.forkId}?tab=pulls`);
      await expect(page.getByText(/Chưa có pull request nào/)).toBeVisible();
      await expect(page.getByText(/không còn công khai|Không gửi được đề xuất/).first()).toBeVisible({ timeout: 5_000 });
    });

    test("Blocked by DFID143, PR-008 no pull request can be sent when the original was deleted", async ({ page }) => {
      test.fail(true, "DFID143: the New pull request button disappears without explaining why");
      const s = await forked();
      await s.b.api.call("DELETE", `/projects/${s.publicId}`);
      const forkHead = await s.a.api.head(s.forkMain);
      expect(await status(openPr(s, "Late proposal"))).toBeGreaterThanOrEqual(400);
      expect((await s.a.api.call("GET", "/pull-requests?view=created")) as unknown[]).toHaveLength(0);
      expect((await s.a.api.head(s.forkMain)).id).toBe(forkHead.id);
      expect(JSON.stringify(await s.a.api.call("GET", "/projects"))).toContain(s.forkId);
      await loginThroughUi(page, s.a.user);
      await page.goto(`/projects/${s.forkId}?tab=pulls`);
      await expect(page.getByText(/Chưa có pull request nào/)).toBeVisible();
      await expect(page.getByText(/không còn công khai|Không gửi được đề xuất/).first()).toBeVisible({ timeout: 5_000 });
    });

    test("PR-009 a second open pull request to the same target points to the existing one", async ({ page }) => {
      const s = await forked();
      const first = await openPr(s);
      await loginThroughUi(page, s.a.user);
      const dialog = await openNewPrDialog(page, s.forkId);
      await expect(dialog).toContainText("1 commit mới");
      await dialog.locator('input[name="title"]').fill("Again");
      await dialog.getByRole("button", { name: "Tạo pull request" }).click();
      await expect(dialog.getByRole("alert").first()).toContainText("Đã có một pull request đang mở");
      await dialog.getByRole("link", { name: "Mở pull request đang mở" }).click();
      await expect(page).toHaveURL(new RegExp(`/pull-requests/${first.id}`));
      expect((await s.a.api.call("GET", "/pull-requests?view=created")) as unknown[]).toHaveLength(1);
    });
  });

  test.describe("UC-88 Pull request list", () => {
    async function fourPrs() {
      const s = await forked();
      const open1 = await openPr(s, "Add harmony to chorus");
      const second2 = await s.a.api.createBranch(s.forkId, "bar-3", (await s.a.api.head(s.forkMain)).id);
      await s.a.api.commitOnBranch(s.forkId, s.forkMain, second2.id, [{ id: "c1", pitch: 62, start: 2 * BAR }, BASE[1], HARMONY[2]], "Fork bar 3");
      await s.b.api.putDraft(s.publicId, [{ id: "c1", pitch: 65, start: 2 * BAR }, BASE[1]], TRACKS);
      await s.b.api.commit(s.publicMain, "Original bar 3");
      const open2 = await openPr(s, "Change bar 3", second2.id);
      const third = await s.a.api.createBranch(s.forkId, "merged-one", (await s.a.api.head(s.forkMain)).id);
      await s.a.api.commitOnBranch(s.forkId, s.forkMain, third.id, [...HARMONY, { id: "m1", pitch: 40, start: 5 * BAR }], "Merged idea");
      const toMerge = await openPr(s, "Merged proposal", third.id);
      const fourth = await s.a.api.createBranch(s.forkId, "closed-one", (await s.a.api.head(s.forkMain)).id);
      await s.a.api.commitOnBranch(s.forkId, s.forkMain, fourth.id, [...HARMONY, { id: "x1", pitch: 41, start: 6 * BAR }], "Closed idea");
      const toClose = await openPr(s, "Old idea", fourth.id);
      await s.a.api.call("POST", `/pull-requests/${toClose.id}/close`, {});
      return { s, open1, open2, toMerge, toClose };
    }

    test("Blocked by DFID127, PR-010 lists incoming and created pull requests with their details", async ({ page, browser }) => {
      test.fail(true, "DFID127: the pull request list has no sort order control");
      const { s } = await fourPrs();
      await loginThroughUi(page, s.b.user);
      await page.goto("/pull-requests");
      const rows = page.locator("main a[href^='/pull-requests/']");
      await expect(rows).toHaveCount(3);
      await expect(page.getByText("Add harmony to chorus")).toBeVisible();
      await expect(page.getByText("Change bar 3")).toBeVisible();
      await expect(page.locator("main").getByText("Có xung đột")).toHaveCount(1);
      await expect(page.locator("main")).toContainText("User A");

      const other = await second(browser, s.a);
      await other.page.goto("/pull-requests");
      await other.page.getByRole("tab", { name: "Tôi đã tạo" }).click();
      await expect(other.page.locator("main a[href^='/pull-requests/']")).toHaveCount(3);
      await other.context.close();

      await page.getByRole("combobox", { name: /sắp xếp|sort/i }).selectOption({ index: 1 });
    });

    test("PR-011 merged and closed pull requests stay listed", async ({ page }) => {
      const { s, toMerge } = await fourPrs();
      await s.b.api.call("POST", `/pull-requests/${toMerge.id}/merge`, {});
      await loginThroughUi(page, s.b.user);
      await page.goto("/pull-requests");
      await page.getByRole("tab", { name: "Đã hợp nhất" }).click();
      await expect(page.getByText("Merged proposal")).toBeVisible();
      await page.getByRole("tab", { name: "Đã đóng" }).click();
      await expect(page.getByText("Old idea")).toBeVisible();
      await page.getByText("Old idea").click();
      await expect(page).toHaveURL(/\/pull-requests\/[0-9a-f-]+$/);
      await expect(page.getByText("Đã đóng").first()).toBeVisible();
    });

    test("PR-012 an empty view explains what pull requests are", async ({ page }) => {
      const c = await person("C");
      await c.api.createProject("C Song");
      await loginThroughUi(page, c.user);
      await page.goto("/pull-requests");
      await expect(page.getByText("Chưa có pull request nào.")).toBeVisible();
      await expect(page.getByText(/Pull request là đề xuất/)).toBeVisible();
      await page.getByRole("tab", { name: "Tôi đã tạo" }).click();
      await expect(page.getByText(/Pull request là đề xuất/)).toBeVisible();
    });

    test("PR-013 a list failure is reported instead of an empty list", async ({ page }) => {
      const s = await forked();
      await openPr(s);
      await loginThroughUi(page, s.b.user);
      await failApi(page, "GET", /^\/pull-requests$/);
      await page.goto("/pull-requests");
      await expect(page.getByText("Không tải được danh sách pull request.")).toBeVisible();
      await expect(page.getByText("Chưa có pull request nào.")).toHaveCount(0);
    });

    test("PR-014 a pull request whose target was deleted is shown as no longer applicable", async ({ page }) => {
      const s = await forked();
      await openPr(s, "Old proposal");
      await s.b.api.call("DELETE", `/projects/${s.publicId}`);
      await loginThroughUi(page, s.a.user);
      await page.goto("/pull-requests");
      await page.getByRole("tab", { name: "Tôi đã tạo" }).click();
      const row = page.locator("main").locator("a[href^='/pull-requests/']").filter({ hasText: "Old proposal" });
      await expect(row).toBeVisible();
      await expect(page.locator("main")).toContainText("Không còn áp dụng");
    });
  });

  test.describe("UC-89 Pull request detail", () => {
    test("PR-016 the target owner is offered approve and merge and close", async ({ page }) => {
      const s = await forked();
      const pr = await openPr(s);
      await loginThroughUi(page, s.b.user);
      await openDetail(page, pr.id);
      await expect(page.getByRole("button", { name: "Duyệt và hợp nhất" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Đóng không hợp nhất" })).toBeVisible();
      expect((await prDetail(s.b, pr.id)).pullRequest.status).toBe("open");
    });

    test("PR-017 the author is offered only the close action", async ({ page }) => {
      const s = await forked();
      const pr = await openPr(s);
      await loginThroughUi(page, s.a.user);
      await openDetail(page, pr.id);
      await expect(page.getByRole("button", { name: /Rút lại|Đóng không hợp nhất/ })).toBeVisible();
      await expect(page.getByRole("button", { name: "Duyệt và hợp nhất" })).toHaveCount(0);
    });

    test("PR-019 conflicts are reported plainly on the pull request", async ({ page }) => {
      const s = await conflicting();
      const pr = await openPr(s, "Change bar 3");
      const before = await s.b.api.head(s.publicMain);
      await loginThroughUi(page, s.b.user);
      await openDetail(page, pr.id);
      await expect(page.getByText(/Có 1 nốt xung đột\. Cần chọn giữ bên nào/)).toBeVisible();
      expect((await s.b.api.head(s.publicMain)).id).toBe(before.id);
      expect((await prDetail(s.b, pr.id)).pullRequest.status).toBe("open");
    });

    test("PR-020 a pull request whose source fork was deleted is kept but not mergeable", async ({ page }) => {
      const s = await forked();
      const pr = await openPr(s);
      await s.a.api.call("POST", `/pull-requests/${pr.id}/comments`, { body: "Please review" });
      await s.a.api.call("DELETE", `/projects/${s.forkId}`);
      await loginThroughUi(page, s.b.user);
      await openDetail(page, pr.id);
      await expect(page.getByText(/không thể hợp nhất nữa/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Duyệt và hợp nhất" })).toHaveCount(0);
      await expect(page.getByText("Add harmony to chorus").first()).toBeVisible();
      await expect(page.getByText("Adds a harmony line on track 2.")).toBeVisible();
      await expect(page.getByText("Please review")).toBeVisible();
    });

    test("PR-021 a user without access gets the same result as for a missing pull request", async ({ page }) => {
      const s = await forked();
      const pr = await openPr(s, "Private proposal");
      await s.b.api.setVisibility(s.publicId, "private");
      const c = await person("C");
      expect(await status(c.api.call("GET", `/pull-requests/${pr.id}`))).toBe(404);
      expect(await status(c.api.call("GET", "/pull-requests/00000000-0000-4000-8000-000000000000"))).toBe(404);
      await loginThroughUi(page, c.user);
      await page.goto("/pull-requests/00000000-0000-4000-8000-000000000000");
      const alert = page.locator('[role="alert"]:not(#__next-route-announcer__)');
      await expect(alert.first()).toBeVisible();
      const text = async () => (await alert.first().innerText()).replace(/\s+/g, " ").trim();
      const missing = await text();
      await page.goto(`/pull-requests/${pr.id}`);
      await expect(alert.first()).toBeVisible();
      await expect.poll(text).toBe(missing);
      await expect(page.getByText("Private proposal")).toHaveCount(0);
    });
  });

  test.describe("UC-90 Pull request comments", () => {
    test("PR-022 posts a comment and notifies the author and the target owner", async ({ page }) => {
      const s = await forked();
      const pr = await openPr(s);
      const c = await person("C");
      await loginThroughUi(page, c.user);
      await openDetail(page, pr.id);
      await comment(page, "Nice harmony, but check bar 7.");
      const item = page.locator("li").filter({ hasText: "Nice harmony, but check bar 7." });
      await expect(item).toContainText("User C");
      await expect(item).toContainText(/vừa xong|giây/);
      expect(await notificationTypes(s.a)).toContain("pr.comment");
      expect(await notificationTypes(s.b)).toContain("pr.comment");
    });

    test("PR-023 a comment on a closed pull request is accepted", async ({ page }) => {
      const s = await forked();
      const pr = await openPr(s, "Old idea");
      await s.a.api.call("POST", `/pull-requests/${pr.id}/close`, {});
      await loginThroughUi(page, s.a.user);
      await openDetail(page, pr.id);
      await comment(page, "Closing because the tempo changed.");
      await expect(page.locator("li").filter({ hasText: "Closing because the tempo changed." })).toBeVisible();
      expect((await prDetail(s.a, pr.id)).pullRequest.status).toBe("closed");
    });

    test("PR-024 the author of a comment can delete it after confirming", async ({ page }) => {
      const s = await forked();
      const pr = await openPr(s);
      const c = await person("C");
      await c.api.call("POST", `/pull-requests/${pr.id}/comments`, { body: "Nice harmony, but check bar 7." });
      await s.a.api.call("POST", `/pull-requests/${pr.id}/comments`, { body: "Thanks for looking" });
      await loginThroughUi(page, c.user);
      await openDetail(page, pr.id);
      await page.locator("li").filter({ hasText: "Nice harmony, but check bar 7." }).getByRole("button", { name: "Xoá bình luận" }).click();
      const confirm = page.getByRole("alertdialog", { name: "Xoá bình luận?" });
      await expect(confirm).toBeVisible();
      await confirm.getByRole("button", { name: "Xoá" }).click();
      await expect(page.getByText("Nice harmony, but check bar 7.")).toHaveCount(0);
      await expect(page.getByText("Thanks for looking")).toBeVisible();
    });

    test("PR-025 an empty comment is not submitted", async ({ page }) => {
      const s = await forked();
      const pr = await openPr(s);
      const c = await person("C");
      await loginThroughUi(page, c.user);
      await openDetail(page, pr.id);
      await expect(page.getByRole("button", { name: "Bình luận", exact: true })).toBeDisabled();
      await page.locator("#pr-comment").fill("   ");
      await expect(page.getByRole("button", { name: "Bình luận", exact: true })).toBeDisabled();
      expect((await prDetail(s.b, pr.id)).comments).toHaveLength(0);
      expect(await notificationTypes(s.b)).not.toContain("pr.comment");
    });

    test("PR-026 a comment over the length limit is not accepted", async ({ page }) => {
      const s = await forked();
      const pr = await openPr(s);
      const c = await person("C");
      await loginThroughUi(page, c.user);
      await openDetail(page, pr.id);
      await page.locator("#pr-comment").fill("x".repeat(10_000));
      expect((await page.locator("#pr-comment").inputValue()).length).toBe(2000);
      await expect(page.getByText("2000/2000")).toBeVisible();
      expect(await status(c.api.call("POST", `/pull-requests/${pr.id}/comments`, { body: "y".repeat(2001) }))).toBe(400);
    });

    test("PR-027 a failed save keeps the comment text in the field", async ({ page }) => {
      const s = await forked();
      const pr = await openPr(s);
      const c = await person("C");
      await loginThroughUi(page, c.user);
      await openDetail(page, pr.id);
      await failApi(page, "POST", /\/comments$/);
      await comment(page, "Please check bar 7.");
      await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)').first()).toContainText(/Không gửi được bình luận/);
      await expect(page.locator("#pr-comment")).toHaveValue("Please check bar 7.");
      expect((await prDetail(s.b, pr.id)).comments).toHaveLength(0);
    });

    test("PR-028 a user whose access was revoked cannot comment", async ({ page }) => {
      const s = await forked();
      const pr = await openPr(s, "Private proposal");
      const c = await person("C");
      await s.b.api.call("POST", `/projects/${s.publicId}/collaborators`, { identifier: c.username, permissionLevel: "view" });
      const [inv] = (await c.api.call("GET", "/users/me/collaboration-invitations")) as Array<{ id: string }>;
      await c.api.call("POST", `/users/me/collaboration-invitations/${inv.id}/accept`);
      await s.b.api.setVisibility(s.publicId, "private");
      await loginThroughUi(page, c.user);
      await openDetail(page, pr.id);
      const rows = (await s.b.api.call("GET", `/projects/${s.publicId}/collaborators`)) as Array<{ id: string }>;
      await s.b.api.call("DELETE", `/projects/${s.publicId}/collaborators/${rows[0].id}`);
      await comment(page, "Looks good");
      await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)').first()).toBeVisible();
      expect((await prDetail(s.b, pr.id)).comments).toHaveLength(0);
    });

    test("PR-029 the target owner can delete another user's comment", async ({ page }) => {
      const s = await forked();
      const pr = await openPr(s);
      const c = await person("C");
      await c.api.call("POST", `/pull-requests/${pr.id}/comments`, { body: "Comment by C" });
      await s.a.api.call("POST", `/pull-requests/${pr.id}/comments`, { body: "Comment by A" });
      await loginThroughUi(page, s.b.user);
      await openDetail(page, pr.id);
      await page.locator("li").filter({ hasText: "Comment by C" }).getByRole("button", { name: "Xoá bình luận" }).click();
      await page.getByRole("alertdialog", { name: "Xoá bình luận?" }).getByRole("button", { name: "Xoá" }).click();
      await expect(page.getByText("Comment by C")).toHaveCount(0);
      await expect(page.getByText("Comment by A")).toBeVisible();
    });
  });

  test.describe("UC-91 Approve and merge", () => {
    async function mergeThroughUi(page: Page) {
      await page.getByRole("button", { name: "Duyệt và hợp nhất" }).click();
      const confirm = page.getByRole("alertdialog", { name: "Hợp nhất pull request?" });
      await expect(confirm).toContainText(/1 commit mới/);
      await confirm.getByRole("button", { name: "Hợp nhất", exact: true }).click();
      return confirm;
    }

    test("PR-030 the target owner approves and merges a pull request", async ({ page }) => {
      const s = await forked();
      const pr = await openPr(s);
      const forkHead = await s.a.api.head(s.forkMain);
      await loginThroughUi(page, s.b.user);
      await openDetail(page, pr.id);
      await mergeThroughUi(page);
      await expect(page.getByText("Đã hợp nhất pull request.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Duyệt và hợp nhất" })).toHaveCount(0);
      expect((await prDetail(s.b, pr.id)).pullRequest.status).toBe("merged");
      const harmony = (await lineage(s.b, s.publicMain)).find((c) => c.message === "Add harmony on track 2")!;
      expect((harmony as unknown as { created_by?: string }).created_by ?? harmony.author_id).toBe(s.a.user.id);
      const head = await s.b.api.head(s.publicMain);
      expect((await s.b.api.commitSnapshot(head.id)).notes.map((n) => n.id)).toContain("h1");
      expect((await s.a.api.head(s.forkMain)).id).toBe(forkHead.id);
      expect(await notificationTypes(s.a)).toContain("pr.merged");
    });

    test("PR-031 conflicts are resolved before the pull request merge completes", async ({ page }) => {
      const s = await conflicting();
      const pr = await openPr(s, "Change bar 3");
      await loginThroughUi(page, s.b.user);
      await openDetail(page, pr.id);
      await page.getByRole("button", { name: "Duyệt và hợp nhất" }).click();
      await page.getByRole("alertdialog", { name: "Hợp nhất pull request?" }).getByRole("button", { name: "Hợp nhất", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: /có xung đột/i });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("radio", { name: /Lấy bên kia/ }).first().click();
      await dialog.getByRole("button", { name: /xác nhận và hợp nhất/i }).click();
      await expect(page.getByText("Đã giải quyết xung đột và hợp nhất pull request.")).toBeVisible();
      const head = await s.b.api.head(s.publicMain);
      const snapshot = await s.b.api.commitSnapshot(head.id);
      expect(snapshot.notes.find((n) => n.id === "c1")?.pitch).toBe(62);
      expect((await prDetail(s.b, pr.id)).pullRequest.status).toBe("merged");
    });

    test("Blocked by DFID128, PR-033 a pull request closed by someone else is not merged", async ({ page }) => {
      test.fail(true, "DFID128: the message says the pull request was handled by someone else but not that it is closed");
      const s = await forked();
      const pr = await openPr(s);
      const before = await s.b.api.head(s.publicMain);
      await loginThroughUi(page, s.b.user);
      await openDetail(page, pr.id);
      await s.a.api.call("POST", `/pull-requests/${pr.id}/close`, {});
      const confirm = await mergeThroughUi(page);
      await expect(confirm.getByRole("alert")).toBeVisible();
      expect((await s.b.api.head(s.publicMain)).id).toBe(before.id);
      await expect(confirm.getByRole("alert")).toContainText(/đã đóng|is closed/i);
    });

    test("PR-034 a pull request whose source fork was deleted can only be closed", async ({ page }) => {
      const s = await forked();
      const pr = await openPr(s);
      const before = await s.b.api.head(s.publicMain);
      await s.a.api.call("DELETE", `/projects/${s.forkId}`);
      expect(await status(s.b.api.call("POST", `/pull-requests/${pr.id}/merge`, {}))).toBe(409);
      await loginThroughUi(page, s.b.user);
      await openDetail(page, pr.id);
      await expect(page.getByText(/không thể hợp nhất nữa/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Duyệt và hợp nhất" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Đóng không hợp nhất" })).toBeVisible();
      expect((await s.b.api.head(s.publicMain)).id).toBe(before.id);
    });

    test("PR-035 a server error during the merge leaves the target unchanged", async ({ page }) => {
      const s = await forked();
      const pr = await openPr(s);
      const before = await s.b.api.head(s.publicMain);
      await loginThroughUi(page, s.b.user);
      await openDetail(page, pr.id);
      await failApi(page, "POST", /\/merge$/);
      const confirm = await mergeThroughUi(page);
      await expect(confirm.getByRole("alert")).toContainText(/Không hợp nhất được/);
      expect((await s.b.api.head(s.publicMain)).id).toBe(before.id);
      expect((await prDetail(s.b, pr.id)).pullRequest.status).toBe("open");
    });

    test("PR-036 the author is not offered the merge action and the API refuses it", async ({ page }) => {
      const s = await forked();
      const pr = await openPr(s);
      const before = await s.b.api.head(s.publicMain);
      await loginThroughUi(page, s.a.user);
      await openDetail(page, pr.id);
      await expect(page.getByRole("button", { name: "Duyệt và hợp nhất" })).toHaveCount(0);
      expect(await status(s.a.api.call("POST", `/pull-requests/${pr.id}/merge`, {}))).toBe(403);
      expect((await prDetail(s.a, pr.id)).pullRequest.status).toBe("open");
      expect((await s.b.api.head(s.publicMain)).id).toBe(before.id);
    });

    test("PR-037 a collaborator with edit permission on the target can merge", async ({ page }) => {
      const s = await forked();
      const pr = await openPr(s);
      const c = await person("C");
      await s.b.api.call("POST", `/projects/${s.publicId}/collaborators`, { identifier: c.username, permissionLevel: "edit" });
      const [inv] = (await c.api.call("GET", "/users/me/collaboration-invitations")) as Array<{ id: string }>;
      await c.api.call("POST", `/users/me/collaboration-invitations/${inv.id}/accept`);
      await loginThroughUi(page, c.user);
      await openDetail(page, pr.id);
      await mergeThroughUi(page);
      await expect(page.getByText("Đã hợp nhất pull request.")).toBeVisible();
      expect((await prDetail(s.b, pr.id)).pullRequest.status).toBe("merged");
      expect((await lineage(s.b, s.publicMain)).map((c2) => c2.message)).toContain("Add harmony on track 2");
    });
  });

  test.describe("UC-92 Close without merging", () => {
    async function closeThroughUi(page: Page, label: RegExp, note?: string) {
      await page.getByRole("button", { name: label }).click();
      const confirm = page.getByRole("alertdialog", { name: "Đóng pull request?" });
      if (note) await confirm.locator("#pr-close-comment").fill(note);
      return confirm;
    }

    test("PR-038 the target owner closes a pull request without merging", async ({ page }) => {
      const s = await forked();
      const pr = await openPr(s);
      const publicHead = await s.b.api.head(s.publicMain);
      const forkHead = await s.a.api.head(s.forkMain);
      await loginThroughUi(page, s.b.user);
      await openDetail(page, pr.id);
      const confirm = await closeThroughUi(page, /Đóng không hợp nhất/, "Does not fit the arrangement.");
      await expect(confirm).toContainText("Hai dự án sẽ không thay đổi");
      await expect(confirm).toContainText("không thể mở lại");
      await confirm.getByRole("button", { name: "Đóng pull request" }).click();
      await expect(page.getByText("Đã đóng pull request.")).toBeVisible();
      await expect(page.getByRole("button", { name: /mở lại|reopen/i })).toHaveCount(0);
      expect((await prDetail(s.b, pr.id)).pullRequest.status).toBe("closed");
      const closedList = (await s.b.api.call("GET", "/pull-requests?view=incoming&status=closed")) as Array<{ id: string }>;
      expect(closedList.map((x) => x.id)).toContain(pr.id);

      await page.goto("/pull-requests");
      await page.getByRole("tab", { name: "Đã đóng" }).click();
      await page.getByText("Add harmony to chorus").click();
      await expect(page.getByText("Adds a harmony line on track 2.")).toBeVisible();
      await expect(page.getByText("Does not fit the arrangement.")).toBeVisible();
      expect((await s.b.api.head(s.publicMain)).id).toBe(publicHead.id);
      expect((await s.a.api.head(s.forkMain)).id).toBe(forkHead.id);
      expect(await notificationTypes(s.a)).toContain("pr.closed");
    });

    test("PR-039 the author withdraws their own pull request", async ({ page }) => {
      const s = await forked();
      const pr = await openPr(s);
      const publicHead = await s.b.api.head(s.publicMain);
      await loginThroughUi(page, s.a.user);
      await openDetail(page, pr.id);
      const confirm = await closeThroughUi(page, /Rút lại|Đóng không hợp nhất/);
      await confirm.getByRole("button", { name: "Đóng pull request" }).click();
      await expect(page.getByText("Đã đóng pull request.")).toBeVisible();
      expect((await prDetail(s.a, pr.id)).pullRequest.status).toBe("closed");
      expect(await notificationTypes(s.b)).toContain("pr.closed");
      expect(await notificationTypes(s.a)).not.toContain("pr.closed");
      expect((await s.b.api.head(s.publicMain)).id).toBe(publicHead.id);
    });

    test("PR-040 cancelling the confirmation keeps the pull request open", async ({ page }) => {
      const s = await forked();
      const pr = await openPr(s);
      await loginThroughUi(page, s.b.user);
      await openDetail(page, pr.id);
      const confirm = await closeThroughUi(page, /Đóng không hợp nhất/);
      await confirm.getByRole("button", { name: "Huỷ" }).click();
      await expect(confirm).toHaveCount(0);
      expect((await prDetail(s.b, pr.id)).pullRequest.status).toBe("open");
      expect(await notificationTypes(s.a)).not.toContain("pr.closed");
    });

    test("Blocked by DFID128, PR-041 a pull request already merged by someone else is not closed", async ({ page }) => {
      test.fail(true, "DFID128: the message says the pull request was handled by someone else but not that it is merged");
      const s = await forked();
      const pr = await openPr(s);
      const c = await person("C");
      await s.b.api.call("POST", `/projects/${s.publicId}/collaborators`, { identifier: c.username, permissionLevel: "edit" });
      const [inv] = (await c.api.call("GET", "/users/me/collaboration-invitations")) as Array<{ id: string }>;
      await c.api.call("POST", `/users/me/collaboration-invitations/${inv.id}/accept`);
      await loginThroughUi(page, s.b.user);
      await openDetail(page, pr.id);
      const confirm = await closeThroughUi(page, /Đóng không hợp nhất/);
      await c.api.call("POST", `/pull-requests/${pr.id}/merge`, {});
      await confirm.getByRole("button", { name: "Đóng pull request" }).click();
      await expect(confirm.getByRole("alert")).toBeVisible();
      expect((await prDetail(s.b, pr.id)).pullRequest.status).toBe("merged");
      await expect(confirm.getByRole("alert")).toContainText(/đã (được )?hợp nhất|is merged/i);
    });

    test("PR-042 a server error leaves the pull request open", async ({ page }) => {
      const s = await forked();
      const pr = await openPr(s);
      await loginThroughUi(page, s.b.user);
      await openDetail(page, pr.id);
      await failApi(page, "POST", /\/close$/);
      const confirm = await closeThroughUi(page, /Đóng không hợp nhất/);
      await confirm.getByRole("button", { name: "Đóng pull request" }).click();
      await expect(confirm.getByRole("alert")).toContainText("Không đóng được pull request.");
      expect((await prDetail(s.b, pr.id)).pullRequest.status).toBe("open");
      expect(await notificationTypes(s.a)).not.toContain("pr.closed");
    });

    test("PR-043 an unrelated user is not offered the close action and the API refuses it", async ({ page }) => {
      const s = await forked();
      const pr = await openPr(s);
      const c = await person("C");
      await loginThroughUi(page, c.user);
      await openDetail(page, pr.id);
      await expect(page.getByRole("button", { name: /Đóng không hợp nhất|Rút lại/ })).toHaveCount(0);
      expect(await status(c.api.call("POST", `/pull-requests/${pr.id}/close`, {}))).toBe(403);
      expect((await prDetail(s.b, pr.id)).pullRequest.status).toBe("open");
    });
  });
});
