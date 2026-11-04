import { expect as baseExpect, test, type Browser, type Page } from "@playwright/test";
import { UserApi, snapshotOf, type NoteSeed } from "./support/api";
import { BAR, PPQ, pickTool, point, scrollGrid } from "./support/piano-roll";
import { testSql } from "./support/test-sql";
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

interface CollabRow {
  id: string;
  userId: string;
  status: "pending" | "accepted";
  permissionLevel: "view" | "edit";
}

async function person(label: string): Promise<Person> {
  const user = await createE2eUser();
  const username = `${label.toLowerCase()}_${user.id.slice(0, 6)}`;
  const name = `User ${label}`;
  await createE2eProfile(user, { username, display_name: name });
  const api = await UserApi.for(user);
  return { user, username, name, api };
}

async function invitee(label: string) {
  const user = await createE2eUser();
  const username = `${label.toLowerCase()}_${user.id.slice(0, 6)}`;
  const name = `User ${label}`;
  await createE2eProfile(user, { username, display_name: name });
  return { user, username, name } as Person;
}

async function song(owner: Person, notes: NoteSeed[] = [{ id: "n1", start: 3 * BAR }]) {
  const project = await owner.api.createProject("Test Song");
  await owner.api.putDraft(project.id, notes);
  await owner.api.commit(project.branchId, "Verse idea");
  return project;
}

async function invite(owner: Person, projectId: string, who: Person, level: "view" | "edit") {
  return (await owner.api.call("POST", `/projects/${projectId}/collaborators`, {
    identifier: who.username,
    permissionLevel: level,
  })) as CollabRow;
}

async function invitations(who: Person) {
  return (await who.api.call("GET", "/users/me/collaboration-invitations")) as Array<{
    id: string;
    projectId: string;
  }>;
}

async function accept(who: Person, projectId: string) {
  const inv = (await invitations(who)).find((i) => i.projectId === projectId)!;
  await who.api.call("POST", `/users/me/collaboration-invitations/${inv.id}/accept`);
}

async function join(owner: Person, projectId: string, who: Person, level: "view" | "edit") {
  const row = await invite(owner, projectId, who, level);
  await accept(who, projectId);
  return row;
}

async function collaborators(owner: Person, projectId: string) {
  return (await owner.api.call("GET", `/projects/${projectId}/collaborators`)) as CollabRow[];
}

async function notificationTypes(who: Person) {
  const body = (await who.api.call("GET", "/notifications")) as { items: Array<{ type: string }> };
  return body.items.map((n) => n.type);
}

async function status(call: Promise<unknown>) {
  try {
    await call;
    return 200;
  } catch (error) {
    return Number(/-> (\d+)/.exec(String(error))?.[1] ?? 0);
  }
}

function canWriteDraft(who: Person, projectId: string, notes: NoteSeed[]) {
  return status(who.api.call("PUT", `/projects/${projectId}/draft`, snapshotOf(notes)));
}

async function draftNotes(who: Person, projectId: string) {
  return ((await who.api.call("GET", `/projects/${projectId}/draft`)) as { notes: unknown[] }).notes;
}

interface StoredComment {
  id: string;
  body: string;
  bar: number | null;
  trackId: string | null;
  noteId: string | null;
  parentId: string | null;
  noteMissing: boolean;
  author: { id: string };
}

async function comments(who: Person, projectId: string) {
  return (await who.api.call("GET", `/projects/${projectId}/comments`)) as StoredComment[];
}

async function comment(who: Person, projectId: string, body: Record<string, unknown>) {
  return (await who.api.call("POST", `/projects/${projectId}/comments`, body)) as { id: string };
}

async function second(browser: Browser, who: Person) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginThroughUi(page, who.user);
  return { context, page };
}

async function openEditor(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}/edit`);
  await page.getByRole("button", { name: /^File$/ }).waitFor({ timeout: 30_000 });
  await page.waitForLoadState("networkidle");
}

async function openCollaborators(page: Page) {
  await page.getByRole("button", { name: "Cộng tác viên", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Cộng tác viên" });
  await expect(dialog.getByText("Đang tải danh sách…")).toHaveCount(0);
  return dialog;
}

async function inviteThroughDialog(page: Page, identifier: string, level: "view" | "edit") {
  const dialog = page.getByRole("dialog", { name: "Cộng tác viên" });
  await dialog.locator('input[name="collaborator-identifier"]').fill(identifier);
  await dialog.locator('select[name="collaborator-permission"]').selectOption(level);
  await dialog.getByRole("button", { name: "Mời", exact: true }).click();
}

function rowOf(page: Page, name: string) {
  return page.getByRole("dialog", { name: "Cộng tác viên" }).locator("li").filter({ hasText: name });
}

function confirmBox(page: Page, title: string) {
  return page.getByRole("alertdialog", { name: title });
}

async function openComments(page: Page) {
  await page.getByRole("button", { name: "Bình luận", exact: true }).click();
  return page.getByRole("region", { name: "Bình luận" });
}

async function postComment(page: Page, body: string) {
  const panel = page.getByRole("region", { name: "Bình luận" });
  await panel.locator('textarea[name="comment-body"]').fill(body);
  await panel.getByRole("button", { name: "Bình luận", exact: true }).click();
  await expect(panel.getByText(body)).toBeVisible();
}

async function drawNote(page: Page, tick: number, pitch = 60) {
  await pickTool(page, "Draw");
  const g = await scrollGrid(page, { pitch });
  const p = point(g, tick + PPQ / 4, pitch);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(3_500);
}

function failApi(page: Page, method: string, pathPattern: RegExp) {
  return page.route(
    (url) => url.href.includes(API) && pathPattern.test(url.pathname),
    (route) =>
      route.request().method() === method ? route.fulfill({ status: 500, body: "{}" }) : route.continue(),
  );
}

const PRESENCE = "Người đang xem dự án này";
const DFID123 = "DFID123: an accepted collaborator cannot open the project (GET /projects/:id is owner-only)";

test.describe("Collaboration", () => {
  test.setTimeout(180_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test.describe("UC-60 Invite collaborator", () => {
    test("Blocked by DFID118, COL-001 invites a user by username with Can edit and the invitee gets no access before accepting", async ({
      page,
    }) => {
      test.fail(true, "DFID118: collaboration notifications are only logged on the server, the invitee receives none");
      const a = await person("A");
      const b = await person("B");
      const { id } = await song(a);
      await loginThroughUi(page, a.user);
      await openEditor(page, id);
      await openCollaborators(page);
      await inviteThroughDialog(page, b.username, "edit");
      await expect(rowOf(page, b.name)).toContainText("Đang chờ");
      await expect(rowOf(page, b.name).locator("select")).toHaveValue("edit");

      expect(await status(b.api.call("GET", `/projects/${id}/draft`))).toBe(403);
      expect(JSON.stringify(await b.api.call("GET", "/projects"))).not.toContain(id);
      expect(await notificationTypes(b)).toContain("collab.invite");
    });

    test("Blocked by DFID124, DFID123, COL-002 accepting the invitation grants Can edit access", async ({ page }) => {
      test.fail(true, `DFID124: accepting reports a failure although it succeeds; ${DFID123}`);
      const a = await person("A");
      const b = await person("B");
      const { id } = await song(a);
      await invite(a, id, b, "edit");

      await loginThroughUi(page, b.user);
      await page.goto("/invitations");
      await page.getByRole("button", { name: "Chấp nhận" }).click();
      await expect
        .poll(async () => (await collaborators(a, id)).find((r) => r.userId === b.user.id)?.status)
        .toBe("accepted");
      expect((await collaborators(a, id))[0].permissionLevel).toBe("edit");
      expect(await canWriteDraft(b, id, [{ id: "n1", start: 3 * BAR }, { id: "b1", start: BAR }])).toBe(200);
      await expect(page.getByText(/đã là cộng tác viên/i)).toBeVisible({ timeout: 5_000 });

      await openEditor(page, id);
      await drawNote(page, 2 * BAR);
      expect(await draftNotes(b, id)).toHaveLength(3);
    });

    test("Blocked by DFID124, DFID118, COL-003 declining removes the invitation and notifies the owner", async ({
      page,
    }) => {
      test.fail(true, "DFID124: declining reports a failure although it succeeds; DFID118: the owner gets no notification");
      const a = await person("A");
      const b = await person("B");
      const { id } = await song(a);
      await invite(a, id, b, "edit");

      await loginThroughUi(page, b.user);
      await page.goto("/invitations");
      await page.getByRole("button", { name: "Từ chối" }).first().click();
      await confirmBox(page, "Từ chối lời mời").getByRole("button", { name: "Từ chối" }).click();
      await expect.poll(async () => (await collaborators(a, id)).length).toBe(0);
      expect(await status(b.api.call("GET", `/projects/${id}/draft`))).toBe(403);
      await expect(page.getByText("Đã từ chối lời mời.")).toBeVisible({ timeout: 5_000 });
      expect(await notificationTypes(a)).toContain("collab.invite_declined");
    });

    test("COL-004 reports an unknown email and username with the same neutral message", async ({ page }) => {
      const a = await person("A");
      const { id } = await song(a);
      await loginThroughUi(page, a.user);
      await openEditor(page, id);
      const dialog = await openCollaborators(page);
      await inviteThroughDialog(page, "nobody_x@example.com", "edit");
      await expect(dialog.getByRole("alert")).toBeVisible();
      const first = await dialog.getByRole("alert").innerText();
      await inviteThroughDialog(page, "no_such_user_42", "edit");
      await expect(dialog.getByRole("alert")).toHaveText(first);
      expect(first).toMatch(/không tìm thấy tài khoản/i);
      expect(first).not.toMatch(/đăng ký|registered/i);
      expect(await collaborators(a, id)).toHaveLength(0);
    });

    test("COL-005 inviting an existing collaborator or a pending invitee sends no second invitation", async ({
      page,
    }) => {
      const a = await person("A");
      const b = await person("B");
      const c = await person("C");
      const { id } = await song(a);
      await join(a, id, b, "edit");
      await invite(a, id, c, "edit");

      await loginThroughUi(page, a.user);
      await openEditor(page, id);
      const dialog = await openCollaborators(page);
      await inviteThroughDialog(page, b.username, "edit");
      await expect(dialog.getByRole("alert")).toContainText("đã là cộng tác viên");
      await inviteThroughDialog(page, c.username, "edit");
      await expect(dialog.getByRole("alert")).toContainText("đang chờ");
      expect(await collaborators(a, id)).toHaveLength(2);
      expect(await invitations(c)).toHaveLength(1);
    });

    test("COL-006 the owner cannot invite their own account", async ({ page }) => {
      const a = await person("A");
      const { id } = await song(a);
      await loginThroughUi(page, a.user);
      await openEditor(page, id);
      const dialog = await openCollaborators(page);
      await inviteThroughDialog(page, a.username, "edit");
      await expect(dialog.getByRole("alert")).toContainText("Bạn là chủ dự án");
      expect(await collaborators(a, id)).toHaveLength(0);
    });

    test("COL-007 blocks an eleventh collaborator and states the limit of 10", async ({ page }) => {
      const a = await person("A");
      const { id } = await song(a);
      for (let i = 1; i <= 10; i += 1) {
        await invite(a, id, await invitee(`collab${String(i).padStart(2, "0")}`), "view");
      }
      const extra = await invitee("collab11");
      await loginThroughUi(page, a.user);
      await openEditor(page, id);
      const dialog = await openCollaborators(page);
      await inviteThroughDialog(page, extra.username, "view");
      await expect(dialog.getByRole("alert")).toContainText("10 cộng tác viên");
      expect(await collaborators(a, id)).toHaveLength(10);
      await expect(dialog.locator("li")).toHaveCount(10);
    });

    test("Blocked by DFID123, DFID119, COL-008 a collaborator sees no invite controls and the invite API refuses them", async ({
      page,
    }) => {
      test.fail(true, `${DFID123}; DFID119: the editor always opens the Collaborators dialog in owner mode`);
      const a = await person("A");
      const b = await person("B");
      const c = await person("C");
      const { id } = await song(a);
      await join(a, id, b, "edit");
      expect(
        await status(
          b.api.call("POST", `/projects/${id}/collaborators`, { identifier: c.username, permissionLevel: "view" }),
        ),
      ).toBe(403);
      expect(await collaborators(a, id)).toHaveLength(1);

      await loginThroughUi(page, b.user);
      await openEditor(page, id);
      const dialog = await openCollaborators(page);
      await expect(dialog.locator("li").filter({ hasText: b.name })).toBeVisible();
      await expect(dialog.locator('input[name="collaborator-identifier"]')).toHaveCount(0);
      await expect(dialog.getByRole("button", { name: "Mời", exact: true })).toHaveCount(0);
    });

    test("COL-009 the tenth collaborator can be invited by email with View only", async ({ page }) => {
      const a = await person("A");
      const { id } = await song(a);
      for (let i = 1; i <= 9; i += 1) {
        await invite(a, id, await invitee(`collab${String(i).padStart(2, "0")}`), "view");
      }
      const tenth = await invitee("collab10");
      await loginThroughUi(page, a.user);
      await openEditor(page, id);
      const dialog = await openCollaborators(page);
      await inviteThroughDialog(page, tenth.user.email, "view");
      await expect(rowOf(page, tenth.name)).toContainText("Đang chờ");
      await expect(rowOf(page, tenth.name).locator("select")).toHaveValue("view");
      await expect(dialog.locator("li")).toHaveCount(10);
      expect(await collaborators(a, id)).toHaveLength(10);
    });
  });

  test.describe("UC-61 Permission level", () => {
    test("Blocked by DFID123, DFID118, COL-010 promoting a view-only collaborator applies immediately and notifies them", async ({
      page,
      browser,
    }) => {
      test.fail(true, `${DFID123}; DFID118: no notification of the change`);
      const a = await person("A");
      const b = await person("B");
      const { id, branchId } = await song(a);
      await join(a, id, b, "view");
      await comment(b, id, { body: "Earlier note" });
      const historyBefore = await a.api.history(branchId);
      expect(await canWriteDraft(b, id, [{ id: "n1", start: 3 * BAR }])).toBe(403);

      await loginThroughUi(page, a.user);
      await openEditor(page, id);
      await openCollaborators(page);
      await rowOf(page, b.name).locator("select").selectOption("edit");
      await expect(rowOf(page, b.name).locator("select")).toHaveValue("edit");
      expect(await canWriteDraft(b, id, [{ id: "n1", start: 3 * BAR }])).toBe(200);
      expect(await a.api.history(branchId)).toEqual(historyBefore);
      expect((await comments(a, id)).map((c) => c.body)).toContain("Earlier note");

      const other = await second(browser, b);
      await openEditor(other.page, id);
      await drawNote(other.page, BAR);
      expect(await draftNotes(b, id)).toHaveLength(2);
      await other.context.close();
      expect(await notificationTypes(b)).toContain("collab.permission_changed");
    });

    test("COL-011 changing a pending invitation's level changes what it grants", async ({ page }) => {
      const a = await person("A");
      const b = await person("B");
      const { id } = await song(a);
      await invite(a, id, b, "view");
      await loginThroughUi(page, a.user);
      await openEditor(page, id);
      await openCollaborators(page);
      await rowOf(page, b.name).locator("select").selectOption("edit");
      await expect(rowOf(page, b.name)).toContainText("Đang chờ");
      await expect(rowOf(page, b.name).locator("select")).toHaveValue("edit");
      await accept(b, id);
      expect((await collaborators(a, id))[0]).toMatchObject({ status: "accepted", permissionLevel: "edit" });
      expect(await canWriteDraft(b, id, [{ id: "n1", start: 3 * BAR }, { id: "b1", start: BAR }])).toBe(200);
    });

    test("Blocked by DFID123, COL-012 a collaborator moved to view-only keeps the draft but cannot commit it", async ({
      page,
      browser,
    }) => {
      test.fail(true, DFID123);
      const a = await person("A");
      const b = await person("B");
      const { id, branchId } = await song(a);
      const row = await join(a, id, b, "edit");
      expect(await canWriteDraft(b, id, [{ id: "n1", start: 3 * BAR }, { id: "b1", start: BAR }, { id: "b2", start: 2 * BAR }])).toBe(200);
      await a.api.call("PATCH", `/projects/${id}/collaborators/${row.id}`, { permissionLevel: "view" });
      const historyBefore = await a.api.history(branchId);
      expect(await status(b.api.commit(branchId, "Should fail"))).toBe(403);
      expect(await draftNotes(b, id)).toHaveLength(3);
      expect(await a.api.history(branchId)).toEqual(historyBefore);

      const other = await second(browser, b);
      await openEditor(other.page, id);
      await other.page.getByRole("button", { name: /commit changes/i }).click();
      const dialog = other.page.getByRole("dialog");
      if (await dialog.locator("#commit-message").isVisible()) {
        await dialog.locator("#commit-message").fill("Should fail");
        await dialog.getByRole("button", { name: /tạo commit/i }).click();
      }
      await expect(other.page.getByText(/quyền xem|không có quyền chỉnh sửa/i).first()).toBeVisible();
      expect(await draftNotes(b, id)).toHaveLength(3);
      await other.context.close();
    });

    test("COL-013 a server error on the permission change keeps the previous level", async ({ page }) => {
      const a = await person("A");
      const b = await person("B");
      const { id } = await song(a);
      await join(a, id, b, "edit");
      await loginThroughUi(page, a.user);
      await openEditor(page, id);
      await failApi(page, "PATCH", /\/collaborators\//);
      const dialog = await openCollaborators(page);
      await rowOf(page, b.name).locator("select").selectOption("view");
      await expect(dialog.getByRole("alert")).toContainText("Không đổi được quyền");
      await expect(rowOf(page, b.name).locator("select")).toHaveValue("edit");
      expect((await collaborators(a, id))[0].permissionLevel).toBe("edit");
      expect(await canWriteDraft(b, id, [{ id: "n1", start: 3 * BAR }])).toBe(200);
    });

    test("Blocked by DFID123, DFID119, COL-014 permission dropdowns are read-only for a non-owner", async ({ page }) => {
      test.fail(true, `${DFID123}; DFID119: the editor always opens the Collaborators dialog in owner mode`);
      const a = await person("A");
      const b = await person("B");
      const c = await person("C");
      const { id } = await song(a);
      await join(a, id, b, "edit");
      const rowC = await join(a, id, c, "view");
      expect(
        await status(b.api.call("PATCH", `/projects/${id}/collaborators/${rowC.id}`, { permissionLevel: "edit" })),
      ).toBe(403);
      expect((await collaborators(a, id)).find((r) => r.userId === c.user.id)?.permissionLevel).toBe("view");

      await loginThroughUi(page, b.user);
      await openEditor(page, id);
      const dialog = await openCollaborators(page);
      await expect(dialog.locator("li").filter({ hasText: c.name })).toBeVisible();
      await expect(dialog.locator("select")).toHaveCount(0);
    });
  });

  test.describe("UC-62 Remove collaborator", () => {
    test("Blocked by DFID118, COL-015 removing a collaborator keeps their commits and comments and notifies them", async ({
      page,
    }) => {
      test.fail(true, "DFID118: the removed collaborator receives no notification");
      const a = await person("A");
      const b = await person("B");
      const { id, branchId } = await song(a);
      await join(a, id, b, "edit");
      await b.api.putDraft(id, [{ id: "n1", start: 3 * BAR }, { id: "d1", start: 0, pitch: 36 }]);
      await b.api.commit(branchId, "Add drums");
      await comment(b, id, { body: "Check the kick" });

      await loginThroughUi(page, a.user);
      await openEditor(page, id);
      await openCollaborators(page);
      await page.getByRole("button", { name: `Gỡ ${b.name} khỏi dự án` }).click();
      const confirm = confirmBox(page, "Gỡ cộng tác viên");
      await expect(confirm).toContainText("vẫn được giữ");
      await confirm.getByRole("button", { name: "Xác nhận" }).click();
      await expect(rowOf(page, b.name)).toHaveCount(0);

      const history = (await a.api.call("GET", `/commits?branch_id=${branchId}`)) as {
        items: Array<{ message: string; author_id?: string; author?: { id: string } }>;
      };
      const drums = history.items.find((c) => c.message === "Add drums")!;
      expect(drums.author_id ?? drums.author?.id).toBe(b.user.id);
      expect((await comments(a, id)).map((c) => c.body)).toContain("Check the kick");
      expect(await status(b.api.call("GET", `/projects/${id}/draft`))).toBe(403);
      expect(await notificationTypes(b)).toContain("collab.access_removed");
    });

    test("COL-016 removing a pending invitee withdraws the invitation without a removal notification", async ({
      page,
    }) => {
      const a = await person("A");
      const b = await person("B");
      const { id } = await song(a);
      await invite(a, id, b, "edit");
      const [inv] = await invitations(b);

      await loginThroughUi(page, a.user);
      await openEditor(page, id);
      await openCollaborators(page);
      await page.getByRole("button", { name: `Gỡ ${b.name} khỏi dự án` }).click();
      await confirmBox(page, "Rút lời mời").getByRole("button", { name: "Xác nhận" }).click();
      await expect(rowOf(page, b.name)).toHaveCount(0);

      expect(await invitations(b)).toHaveLength(0);
      expect(await status(b.api.call("POST", `/users/me/collaboration-invitations/${inv.id}/accept`))).toBe(404);
      expect(await notificationTypes(b)).not.toContain("collab.access_removed");
    });

    test("COL-017 cancelling the removal makes no change", async ({ page }) => {
      const a = await person("A");
      const b = await person("B");
      const { id } = await song(a);
      await join(a, id, b, "edit");
      await loginThroughUi(page, a.user);
      await openEditor(page, id);
      await openCollaborators(page);
      await page.getByRole("button", { name: `Gỡ ${b.name} khỏi dự án` }).click();
      await confirmBox(page, "Gỡ cộng tác viên").getByRole("button", { name: "Huỷ" }).click();
      await expect(confirmBox(page, "Gỡ cộng tác viên")).toHaveCount(0);
      await expect(rowOf(page, b.name).locator("select")).toHaveValue("edit");
      expect(await status(b.api.call("GET", `/projects/${id}/draft`))).toBe(200);
    });

    test("Blocked by DFID120, DFID123, COL-018 removing a collaborator who is editing ends their access and discards their draft", async ({
      page,
      browser,
    }) => {
      test.fail(true, `DFID120: the removed collaborator's uncommitted draft is not discarded; ${DFID123}`);
      const a = await person("A");
      const b = await person("B");
      const { id, branchId } = await song(a);
      const row = await join(a, id, b, "edit");
      await b.api.putDraft(id, [{ id: "n1", start: 3 * BAR }, { id: "old", start: 0, pitch: 40 }]);
      await b.api.commit(branchId, "Earlier work");
      await b.api.putDraft(id, [{ id: "n1", start: 3 * BAR }, { id: "old", start: 0, pitch: 40 }, { id: "b1", start: BAR }, { id: "b2", start: 2 * BAR }]);

      await a.api.call("DELETE", `/projects/${id}/collaborators/${row.id}`);
      expect(await canWriteDraft(b, id, [{ id: "n1", start: 3 * BAR }])).toBe(403);
      expect((await a.api.history(branchId)).map((c) => c.message)).toContain("Earlier work");
      expect(testSql(`select count(*) from drafts where user_id = '${b.user.id}' and branch_id = '${branchId}'`)).toBe("0");

      const c = await person("C");
      const rowC = await join(a, id, c, "edit");
      const other = await second(browser, c);
      await openEditor(other.page, id);
      await drawNote(other.page, BAR, 62);
      await a.api.call("DELETE", `/projects/${id}/collaborators/${rowC.id}`);
      await expect(other.page.getByText("Quyền truy cập dự án của bạn đã kết thúc.")).toBeVisible();
      await other.context.close();
    });

    test("COL-019 a server error on removal leaves the collaborator in place", async ({ page }) => {
      const a = await person("A");
      const b = await person("B");
      const { id } = await song(a);
      await join(a, id, b, "edit");
      await loginThroughUi(page, a.user);
      await openEditor(page, id);
      await failApi(page, "DELETE", /\/collaborators\//);
      await openCollaborators(page);
      await page.getByRole("button", { name: `Gỡ ${b.name} khỏi dự án` }).click();
      const confirm = confirmBox(page, "Gỡ cộng tác viên");
      await confirm.getByRole("button", { name: "Xác nhận" }).click();
      await expect(confirm.getByRole("alert")).toContainText("Không gỡ được");
      expect(await collaborators(a, id)).toHaveLength(1);
      expect(await status(b.api.call("GET", `/projects/${id}/draft`))).toBe(200);
    });

    test("COL-020 the owner row has no remove action and the owner cannot be removed", async ({ page }) => {
      const a = await person("A");
      const b = await person("B");
      const { id } = await song(a);
      await join(a, id, b, "edit");
      await loginThroughUi(page, a.user);
      await openEditor(page, id);
      const dialog = await openCollaborators(page);
      await expect(dialog.locator("li")).toHaveCount(1);
      await expect(dialog.getByRole("button", { name: `Gỡ ${a.name} khỏi dự án` })).toHaveCount(0);
      const project = (await a.api.call("GET", `/projects/${id}`)) as { owner_id: string };
      expect(project.owner_id).toBe(a.user.id);
    });

    test("Blocked by DFID123, DFID119, COL-021 a collaborator cannot remove another collaborator", async ({ page }) => {
      test.fail(true, `${DFID123}; DFID119: the editor always offers the remove action`);
      const a = await person("A");
      const b = await person("B");
      const c = await person("C");
      const { id } = await song(a);
      await join(a, id, b, "edit");
      const rowC = await join(a, id, c, "edit");
      expect(await status(b.api.call("DELETE", `/projects/${id}/collaborators/${rowC.id}`))).toBe(403);
      expect(await status(c.api.call("GET", `/projects/${id}/draft`))).toBe(200);

      await loginThroughUi(page, b.user);
      await openEditor(page, id);
      await openCollaborators(page);
      await expect(page.getByRole("button", { name: `Gỡ ${c.name} khỏi dự án` })).toHaveCount(0);
    });
  });

  test.describe("UC-63 Pinned comments", () => {
    test("Blocked by DFID121, DFID118, COL-022 a comment pinned to a note is shown with a marker and notifies collaborators", async ({
      page,
    }) => {
      test.fail(true, "DFID121: no pin marker is drawn on the grid; DFID118: collaborators receive no notification");
      const a = await person("A");
      const b = await person("B");
      const { id, branchId } = await song(a);
      await join(a, id, b, "edit");
      const historyBefore = await a.api.history(branchId);

      await loginThroughUi(page, a.user);
      await openEditor(page, id);
      await pickTool(page, "Select");
      const g = await scrollGrid(page, { pitch: 60 });
      const p = point(g, 3 * BAR + PPQ / 2, 60);
      await page.mouse.click(p.x, p.y);
      const panel = await openComments(page);
      await panel.getByRole("button", { name: /gắn vào nốt đang chọn/i }).click();
      await postComment(page, "Bass is too loud here");
      await expect(panel.locator("article").filter({ hasText: "Bass is too loud here" })).toContainText("Nhịp 4");

      const stored = await comments(a, id);
      expect(stored[0]).toMatchObject({ bar: 4, noteId: "n1", trackId: "track-1" });
      expect((await comments(b, id)).map((c) => c.body)).toContain("Bass is too loud here");
      expect(await a.api.history(branchId)).toEqual(historyBefore);
      expect(await a.api.draft(id)).toMatchObject({ notes: [{ id: "n1" }] });

      await expect(page.locator("[data-comment-pin]")).not.toHaveCount(0, { timeout: 5_000 });
      expect(await notificationTypes(b)).toContain("comment.new");
    });

    test("COL-023 a comment without a position is stored as a project-level comment", async ({ page }) => {
      const a = await person("A");
      const { id } = await song(a);
      await loginThroughUi(page, a.user);
      await openEditor(page, id);
      const panel = await openComments(page);
      await postComment(page, "Overall mix feels thin");
      await expect(panel).toContainText("Toàn dự án");
      expect((await comments(a, id))[0]).toMatchObject({ bar: null, trackId: null, noteId: null });
      await expect(page.locator("[data-comment-pin]")).toHaveCount(0);
    });

    test("Blocked by DFID123, COL-024 a reply inherits the anchor of the comment it answers", async ({ page }) => {
      test.fail(true, DFID123);
      const a = await person("A");
      const b = await person("B");
      const { id } = await song(a);
      await join(a, id, b, "edit");
      const parent = await comment(a, id, { body: "Bass is too loud here", bar: 4, trackId: "track-1" });
      await comment(b, id, { body: "API reply", parentId: parent.id });
      expect((await comments(a, id)).find((c) => c.body === "API reply")).toMatchObject({
        bar: 4,
        trackId: "track-1",
        parentId: parent.id,
      });

      await loginThroughUi(page, b.user);
      await openEditor(page, id);
      const panel = await openComments(page);
      const original = panel.locator("article").filter({ hasText: "Bass is too loud here" }).first();
      await original.getByRole("button", { name: "Trả lời" }).click();
      await panel.getByPlaceholder("Trả lời…").fill("Agreed, lowering it");
      await panel.getByRole("button", { name: "Trả lời", exact: true }).last().click();
      await expect(panel.getByText("Agreed, lowering it")).toBeVisible();
      const reply = (await comments(a, id)).find((c) => c.body === "Agreed, lowering it")!;
      expect(reply).toMatchObject({ bar: 4, trackId: "track-1", parentId: parent.id });
    });

    test("Blocked by DFID123, COL-025 an author deletes their own comment after confirmation", async ({ page }) => {
      test.fail(true, DFID123);
      const a = await person("A");
      const b = await person("B");
      const { id } = await song(a);
      await join(a, id, b, "edit");
      const own = await comment(b, id, { body: "Own API note" });
      expect(await status(b.api.call("DELETE", `/projects/${id}/comments/${own.id}`))).toBe(200);
      await comment(b, id, { body: "Check timing", bar: 2, trackId: "track-1" });

      await loginThroughUi(page, b.user);
      await openEditor(page, id);
      const panel = await openComments(page);
      await panel.locator("article").filter({ hasText: "Check timing" }).getByRole("button", { name: "Xoá" }).click();
      const confirm = confirmBox(page, "Xoá bình luận");
      await expect(confirm).toBeVisible();
      await confirm.getByRole("button", { name: "Xoá" }).click();
      await expect(panel.getByText("Check timing")).toHaveCount(0);
      expect(await comments(a, id)).toHaveLength(0);
    });

    test("COL-026 an empty or whitespace comment cannot be submitted and shows no error", async ({ page }) => {
      const a = await person("A");
      const { id } = await song(a);
      await loginThroughUi(page, a.user);
      await openEditor(page, id);
      const panel = await openComments(page);
      await panel.locator('input[name="comment-bar"]').fill("4");
      const send = panel.getByRole("button", { name: "Bình luận", exact: true });
      await expect(send).toBeDisabled();
      await panel.locator('textarea[name="comment-body"]').fill("    ");
      await expect(send).toBeDisabled();
      await expect(panel.getByRole("alert")).toHaveCount(0);
      expect(await comments(a, id)).toHaveLength(0);
    });

    test("COL-027 text beyond the 1000-character limit is not accepted", async ({ page }) => {
      const a = await person("A");
      const { id } = await song(a);
      await loginThroughUi(page, a.user);
      await openEditor(page, id);
      const panel = await openComments(page);
      const box = panel.locator('textarea[name="comment-body"]');
      await box.fill("x".repeat(1200));
      expect((await box.inputValue()).length).toBe(1000);
      await expect(panel).toContainText("1000/1000");
      await panel.getByRole("button", { name: "Bình luận", exact: true }).click();
      await expect.poll(async () => (await comments(a, id)).length).toBe(1);
      expect((await comments(a, id))[0].body.length).toBe(1000);
      expect(await status(comment(a, id, { body: "y".repeat(1001) }))).toBe(400);
    });

    test("COL-028 a comment whose note was removed is kept on its bar and marked", async ({ page }) => {
      const a = await person("A");
      const b = await person("B");
      const { id, branchId } = await song(a);
      await join(a, id, b, "edit");
      await b.api.putDraft(id, []);
      await b.api.commit(branchId, "Remove phrase");
      await a.api.putDraft(id, []);

      await comment(a, id, { body: "Nice phrase", bar: 4, trackId: "track-1", noteId: "n1" });
      expect((await comments(a, id))[0]).toMatchObject({ bar: 4, trackId: "track-1", noteMissing: true });

      await loginThroughUi(page, a.user);
      await openEditor(page, id);
      const panel = await openComments(page);
      const item = panel.locator("article").filter({ hasText: "Nice phrase" });
      await expect(item).toContainText("Nốt này không còn tồn tại");
      await expect(item).toContainText("Nhịp 4");
    });

    test("COL-029 a user without access cannot open the project or comment", async ({ page }) => {
      const a = await person("A");
      const c = await person("C");
      const { id } = await song(a);
      expect(await status(comment(c, id, { body: "Let me in" }))).toBe(403);
      expect(await comments(a, id)).toHaveLength(0);
      await loginThroughUi(page, c.user);
      await page.goto(`/projects/${id}/edit`);
      await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)').first()).toContainText(/không tìm thấy dự án|không có quyền/i);
      await expect(page.getByRole("button", { name: "Bình luận", exact: true })).toHaveCount(0);
    });

    test("Blocked by DFID123, DFID121, COL-030 a view-only collaborator may comment and a pin marker appears", async ({
      page,
    }) => {
      test.fail(true, `${DFID123}; DFID121: no pin marker is drawn on the grid`);
      const a = await person("A");
      const b = await person("B");
      const { id, branchId } = await song(a);
      await join(a, id, b, "view");
      const historyBefore = await a.api.history(branchId);
      await comment(b, id, { body: "View-only API comment", bar: 2, trackId: "track-1" });
      expect((await comments(a, id))[0].author.id).toBe(b.user.id);

      await loginThroughUi(page, b.user);
      await openEditor(page, id);
      const panel = await openComments(page);
      await panel.locator('select[name="comment-track"]').selectOption("track-1");
      await panel.locator('input[name="comment-bar"]').fill("2");
      await postComment(page, "Try a softer attack");
      const stored = (await comments(a, id)).find((c) => c.body === "Try a softer attack")!;
      expect(stored).toMatchObject({ bar: 2, trackId: "track-1" });
      expect(stored.author.id).toBe(b.user.id);
      expect(await a.api.history(branchId)).toEqual(historyBefore);
      await expect(page.locator("[data-comment-pin]")).not.toHaveCount(0, { timeout: 5_000 });
    });

    test("Blocked by DFID123, COL-031 only the author or the owner may delete a comment", async ({ page, browser }) => {
      test.fail(true, DFID123);
      const a = await person("A");
      const b = await person("B");
      const c = await person("C");
      const { id } = await song(a);
      await join(a, id, b, "edit");
      await join(a, id, c, "edit");
      const target = await comment(b, id, { body: "Check timing", bar: 2, trackId: "track-1" });
      expect(await status(c.api.call("DELETE", `/projects/${id}/comments/${target.id}`))).toBe(403);

      await loginThroughUi(page, a.user);
      await openEditor(page, id);
      const panel = await openComments(page);
      const item = panel.locator("article").filter({ hasText: "Check timing" });
      await item.getByRole("button", { name: "Xoá" }).click();
      await confirmBox(page, "Xoá bình luận").getByRole("button", { name: "Xoá" }).click();
      await expect(panel.getByText("Check timing")).toHaveCount(0);
      expect(await comments(a, id)).toHaveLength(0);

      await comment(b, id, { body: "Second note", bar: 2, trackId: "track-1" });
      const other = await second(browser, c);
      await openEditor(other.page, id);
      const cPanel = await openComments(other.page);
      await expect(cPanel.getByText("Second note")).toBeVisible();
      await expect(
        cPanel.locator("article").filter({ hasText: "Second note" }).getByRole("button", { name: "Xoá" }),
      ).toHaveCount(0);
      await other.context.close();
    });
  });

  test.describe("UC-64 Presence", () => {
    test("Blocked by DFID123, COL-032 presence shows who else has the project open and updates when they leave", async ({
      page,
      browser,
    }) => {
      test.fail(true, DFID123);
      const a = await person("A");
      const b = await person("B");
      const { id, branchId } = await song(a);
      await join(a, id, b, "edit");

      await loginThroughUi(page, a.user);
      await openEditor(page, id);
      const other = await second(browser, b);
      await openEditor(other.page, id);

      const mine = page.getByRole("group", { name: PRESENCE });
      const theirs = other.page.getByRole("group", { name: PRESENCE });
      await expect(mine.locator(`[title*="${b.name}"], [aria-label*="${b.name}"]`).first()).toBeAttached();
      await expect(theirs.locator(`[title*="${a.name}"], [aria-label*="${a.name}"]`).first()).toBeAttached();

      await other.page.goto("/projects");
      await expect(mine).toHaveCount(0);
      await other.context.close();

      await a.api.putDraft(id, [{ id: "n1", start: 3 * BAR }, { id: "n2", start: BAR }]);
      const commit = await a.api.commit(branchId, "After presence");
      const snapshot = JSON.stringify(await a.api.commitSnapshot(commit.id));
      expect(snapshot).not.toMatch(/presence|viewer/i);
      expect(snapshot).not.toContain(b.user.id);
    });

    test("COL-033 no presence indicator is shown when nobody else is present", async ({ page }) => {
      const a = await person("A");
      const b = await person("B");
      const { id } = await song(a);
      await join(a, id, b, "edit");
      await loginThroughUi(page, a.user);
      await openEditor(page, id);
      await page.waitForTimeout(3_000);
      await expect(page.getByRole("group", { name: PRESENCE })).toHaveCount(0);
    });

    test("Blocked by DFID123, DFID122, COL-034 a user is warned when another collaborator commits to the same branch", async ({
      page,
      browser,
    }) => {
      test.fail(true, `${DFID123}; DFID122: the branch-moved event is never emitted after a commit`);
      const a = await person("A");
      const b = await person("B");
      const { id, branchId } = await song(a);
      await join(a, id, b, "edit");
      await b.api.putDraft(id, [{ id: "n1", start: 3 * BAR }]);

      await loginThroughUi(page, a.user);
      await openEditor(page, id);
      const other = await second(browser, b);
      await openEditor(other.page, id);

      await b.api.putDraft(id, [{ id: "n1", start: 3 * BAR }, { id: "hh", start: 0, pitch: 42 }]);
      await b.api.commit(branchId, "Add hi-hat");
      await other.context.close();

      expect((await a.api.history(branchId)).map((c) => c.message)).toContain("Add hi-hat");
      expect((await a.api.draft(id)).notes.map((n) => n.id)).toEqual(["n1"]);
      await expect(page.getByText(/main.*(đã thay đổi|commit mới)|đã có commit mới/i)).toBeVisible({ timeout: 10_000 });
    });

    test("Blocked by DFID123, COL-036 a dropped connection removes the user's avatar after a short delay", async ({
      page,
      browser,
    }) => {
      test.fail(true, DFID123);
      const a = await person("A");
      const b = await person("B");
      const { id } = await song(a);
      await join(a, id, b, "edit");

      await loginThroughUi(page, a.user);
      await openEditor(page, id);
      const other = await second(browser, b);
      await openEditor(other.page, id);
      const mine = page.getByRole("group", { name: PRESENCE });
      await expect(mine).toBeVisible();

      await other.context.setOffline(true);
      await expect(mine).toHaveCount(0, { timeout: 90_000 });
      await other.context.close();
    });
  });

  test.describe("UC-65 Contributions", () => {
    const TRACKS = [
      { id: "track-1", name: "Piano" },
      { id: "track-2", name: "Drums" },
    ];

    async function withContributions() {
      const a = await person("A");
      const b = await person("B");
      const project = await a.api.createProject("Test Song");
      await a.api.putDraft(project.id, [{ id: "a1" }], TRACKS);
      await a.api.commit(project.branchId, "Verse idea");
      await a.api.putDraft(project.id, [{ id: "a1" }, { id: "a2", start: BAR }], TRACKS);
      await a.api.commit(project.branchId, "Change chorus");
      const row = await join(a, project.id, b, "edit");
      await b.api.putDraft(
        project.id,
        [
          { id: "a1" },
          { id: "a2", start: BAR },
          ...[0, 1, 2, 3, 4].map((i) => ({ id: `d${i}`, start: i * PPQ, pitch: 36, trackId: "track-2" })),
        ],
        TRACKS,
      );
      const drums = await b.api.commit(project.branchId, "Add drums");
      return { a, b, row, drums, ...project };
    }

    async function contributions(who: Person, projectId: string, query = "") {
      return (await who.api.call("GET", `/projects/${projectId}/contributions${query}`)) as {
        contributors: Array<{
          userId: string;
          totalCommits: number;
          notesAdded: number;
          isRemoved: boolean;
          isDeletedAccount: boolean;
          trackDistribution: Array<{ trackName: string; changeCount: number }>;
        }>;
        recentCommits: Array<{ id: string; message: string; authorId: string }>;
      };
    }

    test("COL-037 shows per-contributor summaries, track distribution and a branch filter", async ({ page }) => {
      const { a, b, id, branchId, drums } = await withContributions();
      const side = await a.api.createBranch(id, "side");
      await a.api.commitOnBranch(id, branchId, side.id, [{ id: "a1" }, { id: "s1", start: 2 * BAR }], "Side idea");

      const all = await contributions(a, id);
      const byB = all.contributors.find((c) => c.userId === b.user.id)!;
      expect(byB).toMatchObject({ totalCommits: 1, notesAdded: 5 });
      expect(byB.trackDistribution.find((t) => t.trackName === "Drums")?.changeCount).toBe(5);
      expect(all.contributors.find((c) => c.userId === a.user.id)!.totalCommits).toBe(3);
      const mainOnly = await contributions(a, id, `?branchId=${branchId}`);
      expect(mainOnly.contributors.find((c) => c.userId === a.user.id)!.totalCommits).toBe(2);

      await loginThroughUi(page, a.user);
      await page.goto(`/projects/${id}?tab=contributions`);
      await expect(page.getByText("2 người đóng góp")).toBeVisible();
      await expect(page.getByText("Phân bố thay đổi theo track").first()).toBeVisible();
      await page.getByRole("combobox", { name: "Lọc theo nhánh" }).selectOption(branchId);
      await expect(page.getByText("Side idea")).toHaveCount(0);
      await expect(page.getByRole("textbox")).toHaveCount(0);
      await page.getByRole("button", { name: /Add drums/ }).first().click();
      await expect(page).toHaveURL(new RegExp(`tab=commits|${drums.id}`));
    });

    test("COL-038 selecting one contributor filters the recent commits to that person", async ({ page }) => {
      const { a, b, id } = await withContributions();
      const filtered = await contributions(a, id, `?userId=${b.user.id}`);
      expect(filtered.recentCommits.map((c) => c.message)).toEqual(["Add drums"]);
      await loginThroughUi(page, a.user);
      await page.goto(`/projects/${id}?tab=contributions`);
      await page.getByRole("button", { name: new RegExp(b.name) }).first().click();
      await expect(page.getByText("Commit của người được chọn")).toBeVisible();
      await expect(page.getByRole("button", { name: /Add drums/ })).toBeVisible();
      await expect(page.getByRole("button", { name: /Verse idea/ })).toHaveCount(0);
    });

    test("COL-039 a removed collaborator's contributions are still counted", async ({ page }) => {
      const { a, b, id, row } = await withContributions();
      await a.api.call("DELETE", `/projects/${id}/collaborators/${row.id}`);
      const byB = (await contributions(a, id)).contributors.find((c) => c.userId === b.user.id)!;
      expect(byB).toMatchObject({ totalCommits: 1, notesAdded: 5, isRemoved: true });
      await loginThroughUi(page, a.user);
      await page.goto(`/projects/${id}?tab=contributions`);
      await expect(page.getByRole("button", { name: new RegExp(b.name) }).first()).toContainText("Đã rời dự án");
    });

    test("COL-040 commits of a deleted account are attributed to a deleted user", async ({ page }) => {
      const { a, b, id } = await withContributions();
      await b.api.call("DELETE", "/auth/account", { password: b.user.password });
      const deleted = (await contributions(a, id)).contributors.filter((c) => c.isDeletedAccount);
      expect(deleted).toHaveLength(1);
      expect(deleted[0].totalCommits).toBe(1);
      await loginThroughUi(page, a.user);
      await page.goto(`/projects/${id}?tab=contributions`);
      await expect(page.getByText("Người dùng đã xoá").first()).toBeVisible();
      await expect(page.getByText(b.name)).toHaveCount(0);
    });

    test("COL-041 a history error shows a retry message instead of zero contributions", async ({ page }) => {
      const { a, id } = await withContributions();
      await loginThroughUi(page, a.user);
      let broken = true;
      await page.route(
        (url) => url.href.includes(API) && url.pathname.endsWith("/contributions"),
        (route) => (broken ? route.fulfill({ status: 500, body: "{}" }) : route.continue()),
      );
      await page.goto(`/projects/${id}?tab=contributions`);
      await expect(page.getByText("Không thể tải dữ liệu đóng góp của dự án.").first()).toBeVisible();
      await expect(page.getByText("Chưa có dữ liệu đóng góp nào cho dự án này.")).toHaveCount(0);
      broken = false;
      await page.getByRole("button", { name: "Thử lại" }).click();
      await expect(page.getByText("2 người đóng góp")).toBeVisible();
    });

    test("COL-042 a visitor of a public project cannot open its contribution review", async ({ page }) => {
      const { a, id } = await withContributions();
      await a.api.setVisibility(id, "public");
      const visitor = await person("V");
      expect(await status(visitor.api.call("GET", `/projects/${id}/contributions`))).toBe(403);
      await loginThroughUi(page, visitor.user);
      await page.goto(`/projects/${id}`);
      await expect(page.getByText("Test Song").first()).toBeVisible();
      await expect(page.getByRole("tab", { name: "Đóng góp" })).toHaveCount(0);
      await page.goto(`/projects/${id}?tab=contributions`);
      await expect(page.getByText("2 người đóng góp")).toHaveCount(0);
    });
  });
});
