import { expect as baseExpect, test, type Page } from "@playwright/test";
import { UserApi, type NoteSeed, type TrackSeed } from "./support/api";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  loginThroughUi,
} from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });
const API = ":3101";
const BAR = 1920;

const A: NoteSeed[] = [{ id: "n1" }];
const B: NoteSeed[] = [...A, { id: "n2", start: 480 }];
const C: NoteSeed[] = [...B, { id: "n3", start: 960 }];

async function threeCommits(page: Page) {
  const user = await createE2eUser();
  await createE2eProfile(user);
  const api = await UserApi.for(user);
  const p = await api.createProject("Test Song");
  await api.putDraft(p.id, A);
  const verse = await api.commit(p.branchId, "Verse idea");
  await api.putDraft(p.id, B);
  const drums = await api.commit(p.branchId, "Add drums");
  await api.putDraft(p.id, C);
  const chorus = await api.commit(p.branchId, "Change chorus");
  await loginThroughUi(page, user);
  return { user, api, ...p, verse, drums, chorus };
}

async function plainProject(page: Page, notes: NoteSeed[] = A) {
  const user = await createE2eUser();
  await createE2eProfile(user);
  const api = await UserApi.for(user);
  const p = await api.createProject("Test Song");
  await api.putDraft(p.id, notes);
  await loginThroughUi(page, user);
  return { user, api, ...p };
}

function row(page: Page, message: string) {
  return page
    .getByText(message, { exact: true })
    .first()
    .locator("xpath=ancestor::div[contains(@class,'grid')][1]");
}

async function openCommits(page: Page, projectId: string, message: string) {
  await page.goto(`/projects/${projectId}?tab=commits`);
  await expect(page.getByText(message, { exact: true }).first()).toBeVisible();
}

async function startTag(page: Page, message: string, tag: string) {
  await row(page, message).getByRole("button", { name: /gắn tag/i }).click();
  await page.locator('input[name="tagName"]').fill(tag);
}

async function openEditor(page: Page, projectId: string, head?: string) {
  await page.goto(`/projects/${projectId}/edit`);
  await expect(
    page.getByRole("button", { name: /commit changes/i }),
  ).toBeVisible();
  if (head) await expect(page.getByText(head).first()).toBeVisible();
  else
    await expect(page.getByText(/chưa có phiên bản nào/i)).toBeVisible();
}

async function drawNote(page: Page, bar: number, y = 330) {
  const x = 334 + (bar - 1) * 115.2 + 6;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 50, y, { steps: 4 });
  await page.mouse.up();
}

async function compare(page: Page, first: number, second: number) {
  await page.getByLabel(/Chọn commit/).nth(first).check();
  await page.getByLabel(/Chọn commit/).nth(second).check();
  await page.getByRole("button", { name: /so sánh/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Đang so sánh…")).toHaveCount(0);
}

function countDraftWrites(page: Page) {
  const times: number[] = [];
  page.on("request", (r) => {
    if (
      r.method() === "PUT" &&
      r.url().includes(API) &&
      /\/projects\/[^/]+\/draft$/.test(new URL(r.url()).pathname)
    )
      times.push(Date.now());
  });
  return times;
}

test.describe("Version control, further cases", () => {
  test.setTimeout(240_000);
  test.afterAll(async () => {
    await cleanupE2eUsers();
  });

  test.describe("UC-43 / UC-44 history and tags", () => {
    test("VC-016 explains that comparison needs a second version when only the initial commit exists", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID040: with a single commit the history shows the entry but no message explains that comparison becomes available with a second version",
      );
      const { api, id, branchId } = await plainProject(page);
      await api.commit(branchId, "Initial commit");
      await openCommits(page, id, "Initial commit");
      await expect(page.getByLabel(/Chọn commit/)).toHaveCount(0);
      await expect(page.getByRole("button", { name: /so sánh/i })).toHaveCount(
        0,
      );
      await expect(page.getByText(/commit thứ hai|so sánh.*khi có/i)).toBeVisible();
    });

    test("VC-020 adds a tag to a commit and offers it when picking versions", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID041: the tag is saved and shown beside the commit, but compare and restore have no version pickers that list tags",
      );
      const { api, id, drums } = await threeCommits(page);
      await openCommits(page, id, "Add drums");
      await startTag(page, "Add drums", "demo-v1");
      await page.getByRole("button", { name: /^lưu$/i }).click();
      await expect(row(page, "Add drums")).toContainText("demo-v1");
      const stored = (await api.call("GET", `/commits/${drums.id}`)) as {
        message: string;
        snapshot: { notes: unknown[] };
      };
      expect(stored.message).toBe("Add drums");
      expect(stored.snapshot.notes).toHaveLength(B.length);
      await expect(
        page.getByRole("option", { name: /demo-v1/ }),
      ).not.toHaveCount(0);
    });

    test("VC-022 refuses a renamed tag already used in the project and accepts a free name", async ({
      page,
    }) => {
      const { api, id, drums, chorus } = await threeCommits(page);
      await api.tag(drums.id, "demo-v1");
      await api.tag(chorus.id, "final");
      await openCommits(page, id, "Add drums");
      await startTag(page, "Add drums", "final");
      await page.getByRole("button", { name: /^lưu$/i }).click();
      await expect(page.getByText(/đã được dùng|chọn tên khác/i)).toBeVisible();
      await expect(row(page, "Add drums")).toContainText("demo-v1");
      await page.locator('input[name="tagName"]').fill("demo-v2");
      await page.getByRole("button", { name: /^lưu$/i }).click();
      await expect(row(page, "Add drums")).toContainText("demo-v2");
      await expect(row(page, "Add drums")).not.toContainText("demo-v1");
      const stored = (await api.call("GET", `/commits/${drums.id}`)) as {
        message: string;
      };
      expect(stored.message).toBe("Add drums");
    });

    test("VC-023 says the tag name is required when it is left empty", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID042: an empty tag name only leaves the Save button disabled; no inline error says the name is required",
      );
      const { api, id, drums } = await threeCommits(page);
      await openCommits(page, id, "Add drums");
      await row(page, "Add drums")
        .getByRole("button", { name: /gắn tag/i })
        .click();
      await page.getByRole("button", { name: /^lưu$/i }).click({ force: true });
      await expect(page.getByText(/bắt buộc|không được để trống|nhập tên/i)).toBeVisible();
      expect(await api.call("GET", `/commits/${drums.id}/tags`)).toHaveLength(0);
    });

    test("VC-024 rejects a tag name longer than 30 characters and shows the limit", async ({
      page,
    }) => {
      const { api, id, drums } = await threeCommits(page);
      await openCommits(page, id, "Add drums");
      await startTag(page, "Add drums", "a".repeat(31));
      await page.getByRole("button", { name: /^lưu$/i }).click();
      await expect(page.getByText(/tối đa 30 ký tự/i)).toBeVisible();
      expect(await api.call("GET", `/commits/${drums.id}/tags`)).toHaveLength(0);
    });

    test("VC-026 offers to replace an existing tag instead of adding a second one", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID043: tagging a commit that already has a tag replaces it at once; the user is not offered the replacement",
      );
      const { api, id, drums } = await threeCommits(page);
      await api.tag(drums.id, "demo-v1");
      await openCommits(page, id, "Add drums");
      await startTag(page, "Add drums", "demo-final");
      await page.getByRole("button", { name: /^lưu$/i }).click();
      await expect(page.getByText(/thay thế|ghi đè/i)).toBeVisible();
      await expect(row(page, "Add drums")).toContainText("demo-final");
      const tags = (await api.call("GET", `/commits/${drums.id}/tags`)) as Array<{
        name: string;
      }>;
      expect(tags.map((t) => t.name)).toEqual(["demo-final"]);
    });
  });

  test.describe("UC-45 compare", () => {
    const T2: TrackSeed[] = [{ id: "track-1" }, { id: "track-2" }];
    const BASE: NoteSeed[] = [
      { id: "r1", pitch: 60, start: 0 },
      { id: "m1", pitch: 62, start: 480 },
      { id: "k1", pitch: 64, start: 960 },
    ];
    const EDIT: NoteSeed[] = [
      { id: "m1", pitch: 62, start: 1440 },
      { id: "k1", pitch: 64, start: 960 },
      { id: "x1", pitch: 67, start: BAR, trackId: "track-2" },
      { id: "x2", pitch: 69, start: 2 * BAR + 480, trackId: "track-2" },
    ];

    async function baseAndEdit(page: Page) {
      const ctx = await plainProject(page, []);
      await ctx.api.putDraft(ctx.id, BASE, T2);
      await ctx.api.commit(ctx.branchId, "Base");
      await ctx.api.putDraft(ctx.id, EDIT, [
        { id: "track-1", color: "#ef4444" },
        { id: "track-2" },
      ]);
      await ctx.api.commit(ctx.branchId, "Edit");
      await openCommits(page, ctx.id, "Edit");
      return ctx;
    }

    test("Partial coverage of VC-028: summary, track filter and unchanged history, without playback", async ({
      page,
    }) => {
      const { api, branchId } = await baseAndEdit(page);
      await compare(page, 0, 1);
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("+2 nốt thêm")).toBeVisible();
      await expect(dialog.getByText("−1 nốt xoá")).toBeVisible();
      await expect(dialog.getByText("~1 nốt sửa")).toBeVisible();
      await expect(dialog.getByText(/Màu: #6366f1 → #ef4444/)).toBeVisible();
      await dialog.getByLabel("Lọc theo track").selectOption({ label: "Track 2" });
      await expect(dialog.getByText("Ô nhịp 2")).toBeVisible();
      await expect(dialog.getByText("Ô nhịp 1")).toHaveCount(0);
      await page.keyboard.press("Escape");
      expect((await api.history(branchId)).map((c) => c.message)).toEqual([
        "Edit",
        "Base",
      ]);
    });

    test("VC-029 compares commits taken from two different branches", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID044: the commit list shows one branch at a time and has no all-branches filter, so commits of two branches cannot be selected together",
      );
      const { api, id, branchId } = await threeCommits(page);
      const alt = await api.createBranch(id, "alt-chorus");
      await api.commitOnBranch(
        id,
        branchId,
        alt.id,
        [...C, { id: "a1", start: BAR }],
        "Try new chorus",
      );
      await openCommits(page, id, "Change chorus");
      await expect(
        page.getByRole("option", { name: /tất cả nhánh|all branches/i }),
      ).toHaveCount(1);
    });

    test("VC-030 swaps added and removed counts when the direction is switched", async ({
      page,
    }) => {
      await baseAndEdit(page);
      await compare(page, 0, 1);
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: /đảo chiều/i }).click();
      await expect(dialog.getByText("+1 nốt thêm")).toBeVisible();
      await expect(dialog.getByText("−2 nốt xoá")).toBeVisible();
      await expect(dialog.getByText("~1 nốt sửa")).toBeVisible();
    });

    test("VC-031 reports that nothing changed for two identical versions", async ({
      page,
    }) => {
      const { api, id, branchId, verse } = await threeCommits(page);
      await api.restore(verse.id, branchId);
      await openCommits(page, id, "Change chorus");
      await compare(page, 0, 3);
      await expect(
        page.getByRole("dialog").getByText(/giống hệt nhau/i),
      ).toBeVisible();
      await expect(page.getByRole("dialog").getByText(/nốt thêm/)).toHaveCount(0);
    });

    test("VC-032 reports a track present in one version as a whole track", async ({
      page,
    }) => {
      const ctx = await plainProject(page);
      await ctx.api.commit(ctx.branchId, "Before strings");
      const strings: NoteSeed[] = [
        { id: "n1" },
        ...Array.from({ length: 8 }, (_, i) => ({
          id: `s${i}`,
          pitch: 70 + i,
          start: i * 480,
          trackId: "track-3",
        })),
      ];
      await ctx.api.putDraft(ctx.id, strings, [
        { id: "track-1" },
        { id: "track-3", name: "Strings" },
      ]);
      await ctx.api.commit(ctx.branchId, "Add strings");
      await openCommits(page, ctx.id, "Add strings");
      await compare(page, 0, 1);
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("Thêm track")).toBeVisible();
      await expect(dialog.getByText("Strings").first()).toBeVisible();
      await expect(dialog.getByText(/8 nốt/)).toBeVisible();
      await expect(dialog.getByText("+0 nốt thêm")).toBeVisible();
    });

    test("VC-033 names the version that could not be read and shows no partial comparison", async ({
      page,
    }) => {
      const { api, id, branchId } = await threeCommits(page);
      const history = await api.history(branchId);
      const base = history[1];
      await openCommits(page, id, "Change chorus");
      await page.route(
        (url) =>
          url.href.includes(API) &&
          url.pathname === `/commits/${base.id}`,
        (route) => route.fulfill({ status: 500, body: "{}" }),
      );
      await compare(page, 0, 1);
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText(/không đọc được phiên bản gốc/i)).toBeVisible();
      await expect(dialog.getByText(base.id.slice(0, 7)).first()).toBeVisible();
      await expect(dialog.getByText(/nốt thêm/)).toHaveCount(0);
      expect((await api.history(branchId)).map((c) => c.id)).toEqual(
        history.map((c) => c.id),
      );
    });

    test("VC-034 reports an edited note as modified, not as removed and added", async ({
      page,
    }) => {
      const { api, id, branchId } = await plainProject(page, [
        { id: "a", pitch: 60, start: 0, velocity: 90 },
        { id: "b", pitch: 64, start: BAR, velocity: 90 },
        { id: "c", pitch: 67, start: 2 * BAR, velocity: 90 },
      ]);
      await api.commit(branchId, "Base");
      await openEditor(page, id, "Base");
      await page.getByRole("button", { name: /^select$/i }).click();
      await page.mouse.move(345, 489);
      await page.mouse.down();
      await page.mouse.move(345, 533, { steps: 6 });
      await page.mouse.up();
      await page.mouse.move(456, 625);
      await page.mouse.down();
      await page.mouse.move(456, 650, { steps: 6 });
      await page.mouse.up();
      await expect
        .poll(async () => {
          const notes = (await api.draft(id)).notes as Array<{
            id: string;
            pitch: number;
            velocity?: number;
          }>;
          const a = notes.find((n) => n.id === "a");
          const b = notes.find((n) => n.id === "b");
          return [a?.pitch !== 60, (b?.velocity ?? 90) !== 90];
        })
        .toEqual([true, true]);
      await page.getByRole("button", { name: /commit changes/i }).click();
      const commitDialog = page.getByRole("dialog");
      await commitDialog.locator("#commit-message").fill("Edit two notes");
      await commitDialog.getByRole("button", { name: /tạo commit/i }).click();
      await expect(commitDialog).toHaveCount(0);
      await openCommits(page, id, "Edit two notes");
      await compare(page, 0, 1);
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("~2 nốt sửa")).toBeVisible();
      await expect(dialog.getByText("+0 nốt thêm")).toBeVisible();
      await expect(dialog.getByText("−0 nốt xoá")).toBeVisible();
      await expect(dialog.getByText("Ô nhịp 1")).toBeVisible();
      await expect(dialog.getByText("Ô nhịp 2")).toBeVisible();
    });
  });

  test.describe("UC-46 restore", () => {
    test("VC-038 warns about uncommitted changes before a restore and keeps them when committed first", async ({
      page,
    }) => {
      const { api, id, branchId } = await threeCommits(page);
      await openEditor(page, id, "Change chorus");
      await drawNote(page, 2);
      await expect
        .poll(async () => (await api.draft(id)).notes.length)
        .toBe(C.length + 1);
      await page.getByText("Verse idea", { exact: true }).first().click();
      await page.getByRole("button", { name: /^khôi phục$/i }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("alert")).toContainText(/chưa commit/i);
      await expect(dialog.getByRole("alert")).toContainText(/commit trước/i);
      await dialog.getByRole("button", { name: /^huỷ$/i }).click();
      await page.getByRole("button", { name: /commit changes/i }).click();
      const commitDialog = page.getByRole("dialog");
      await commitDialog.locator("#commit-message").fill("Save before restore");
      await commitDialog.getByRole("button", { name: /tạo commit/i }).click();
      await expect(commitDialog).toHaveCount(0);
      const restoreButton = page.getByRole("button", { name: /^khôi phục$/i });
      if ((await restoreButton.count()) === 0) {
        await page.getByText("Verse idea", { exact: true }).first().click();
      }
      await restoreButton.click();
      await expect(page.getByRole("dialog").getByRole("alert")).toHaveCount(0);
      await page
        .getByRole("dialog")
        .getByRole("button", { name: /^khôi phục$/i })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const messages = (await api.history(branchId)).map((c) => c.message);
      expect(messages).toHaveLength(5);
      expect(messages[1]).toBe("Save before restore");
      const saved = (await api.history(branchId))[1];
      expect(
        (
          (await api.call("GET", `/commits/${saved.id}`)) as {
            snapshot: { notes: unknown[] };
          }
        ).snapshot.notes,
      ).toHaveLength(C.length + 1);
    });
  });

  test.describe("UC-116 autosave", () => {
    test("VC-041 saves the draft automatically without a commit and shows when", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID045: the draft is saved a few seconds after an edit but the screen never shows the time of the last automatic save",
      );
      const { api, id, branchId } = await plainProject(page);
      await api.commit(branchId, "Verse idea");
      await openEditor(page, id, "Verse idea");
      await drawNote(page, 4);
      await expect(page.getByText("Đã lưu nháp").first()).toBeVisible();
      await expect
        .poll(async () => (await api.draft(id)).notes.length)
        .toBe(A.length + 1);
      expect(await api.history(branchId)).toHaveLength(1);
      await expect(page.getByText(/\d{1,2}:\d{2}/).first()).toBeVisible();
      await page.reload();
      await expect(page.getByText("Verse idea").first()).toBeVisible();
      await expect(page.getByText(`${A.length + 1} note`).first()).toBeVisible();
    });

    test("VC-042 saves the draft at once when the user leaves the editor", async ({
      page,
    }) => {
      const { api, id, branchId } = await plainProject(page);
      await api.commit(branchId, "Verse idea");
      await openEditor(page, id, "Verse idea");
      await drawNote(page, 5);
      await page.locator('a[href="/projects/' + id + '"]').first().click();
      await expect
        .poll(async () => (await api.draft(id)).notes.length)
        .toBe(A.length + 1);
      expect(await api.history(branchId)).toHaveLength(1);
    });

    test("VC-043 makes no automatic save after a commit until editing resumes", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID045: the screen never shows the time of the last automatic save, so the unchanged and updated time cannot be observed",
      );
      const { id } = await plainProject(page);
      await openEditor(page, id);
      const writes = countDraftWrites(page);
      await drawNote(page, 2);
      await expect(page.getByText("Đã lưu nháp").first()).toBeVisible();
      await page.getByRole("button", { name: /commit changes/i }).click();
      const dialog = page.getByRole("dialog");
      await dialog.locator("#commit-message").fill("Autosave check");
      await dialog.getByRole("button", { name: /tạo commit/i }).click();
      await expect(dialog).toHaveCount(0);
      const settled = writes.length;
      await page.waitForTimeout(12_000);
      expect(writes.length).toBe(settled);
      await drawNote(page, 3);
      await expect.poll(() => writes.length).toBeGreaterThan(settled);
      await expect(page.getByText(/\d{1,2}:\d{2}/).first()).toBeVisible();
    });

    test("VC-044 tells the user that changes are not being saved while offline", async ({
      page,
      context,
    }) => {
      const { api, id, branchId } = await plainProject(page);
      await api.commit(branchId, "Verse idea");
      await openEditor(page, id, "Verse idea");
      await context.setOffline(true);
      await drawNote(page, 6);
      await expect(page.getByText(/không lưu được/i).first()).toBeVisible();
      await expect(page.getByText("Đã lưu nháp", { exact: true })).toHaveCount(0);
      expect(await api.history(branchId)).toHaveLength(1);
      await context.setOffline(false);
    });

    test("VC-045 saves and confirms the draft when the connection returns", async ({
      page,
      context,
    }) => {
      const { api, id, branchId } = await plainProject(page);
      await api.commit(branchId, "Verse idea");
      await openEditor(page, id, "Verse idea");
      await context.setOffline(true);
      await drawNote(page, 6);
      await expect(page.getByText(/không lưu được/i).first()).toBeVisible();
      await context.setOffline(false);
      await expect(
        page.getByText("Đã lưu nháp", { exact: true }).first(),
      ).toBeVisible({ timeout: 60_000 });
      await expect
        .poll(async () => (await api.draft(id)).notes.length)
        .toBe(A.length + 1);
      await page.reload();
      await expect(page.getByText(`${A.length + 1} note`).first()).toBeVisible();
      expect(await api.history(branchId)).toHaveLength(1);
    });

    test("VC-046 does not save a draft for an archived project", async ({
      page,
    }) => {
      const { api, id, branchId } = await plainProject(page);
      await api.commit(branchId, "Verse idea");
      await api.archive(id);
      const writes = countDraftWrites(page);
      await page.goto(`/projects/${id}/edit`);
      await expect(page.getByText(/đã được lưu trữ/i)).toBeVisible();
      await expect(
        page.getByRole("button", { name: /commit changes/i }),
      ).toHaveCount(0);
      await page.waitForTimeout(6_000);
      expect(writes).toHaveLength(0);
      expect((await api.draft(id)).notes).toHaveLength(A.length);
    });

    test("VC-048 replaces a draft from a previous session with the current one", async ({
      page,
    }) => {
      const { api, id, branchId } = await plainProject(page);
      await api.commit(branchId, "Verse idea");
      await api.putDraft(id, [
        ...A,
        { id: "old-note", pitch: 60, start: 3 * BAR },
      ]);
      await openEditor(page, id, "Verse idea");
      await expect(page.getByText(`${A.length + 1} note`).first()).toBeVisible();
      await page.getByRole("button", { name: /^select$/i }).click();
      await page.mouse.click(334 + 3 * 115.2 + 14, 489);
      await page.keyboard.press("Delete");
      await expect
        .poll(async () => (await api.draft(id)).notes.map((n) => n.id))
        .toEqual(["n1"]);
      await page.reload();
      await expect(page.getByText("Verse idea").first()).toBeVisible();
      await expect(page.getByText(`${A.length} note`).first()).toBeVisible();
      expect(await api.history(branchId)).toHaveLength(1);
    });

    test("VC-049 saves automatically at an interval between 30 seconds and 1 minute", async ({
      page,
    }) => {
      test.fail(
        true,
        "DFID046: the draft is saved a few seconds after each edit (debounce), not at an interval of 30 to 60 seconds",
      );
      test.setTimeout(180_000);
      const { id } = await plainProject(page);
      await openEditor(page, id);
      const writes = countDraftWrites(page);
      const start = Date.now();
      for (let i = 0; i < 6; i += 1) {
        await drawNote(page, 2 + (i % 4), 300 + i * 22);
        await page.waitForTimeout(10_000);
      }
      const gaps = writes.slice(1).map((t, i) => (t - writes[i]) / 1000);
      expect(writes[0] - start).toBeLessThanOrEqual(60_000);
      expect(gaps.length).toBeGreaterThan(0);
      for (const gap of gaps) {
        expect(gap).toBeGreaterThanOrEqual(30);
        expect(gap).toBeLessThanOrEqual(60);
      }
    });

    test("VC-050 recovers the draft after an unexpected end and tells the user", async ({
      page,
      context,
    }) => {
      test.fail(
        true,
        "DFID047: the draft is recovered but no banner says that unsaved changes were recovered or when they were saved",
      );
      const { api, id, branchId } = await plainProject(page);
      await api.commit(branchId, "Verse idea");
      await openEditor(page, id, "Verse idea");
      await drawNote(page, 5);
      await expect(page.getByText("Đã lưu nháp").first()).toBeVisible();
      await expect
        .poll(async () => (await api.draft(id)).notes.length)
        .toBe(A.length + 1);
      await page.close();
      const again = await context.newPage();
      await again.goto(`/projects/${id}/edit`);
      await expect(again.getByText("Verse idea").first()).toBeVisible();
      await expect(again.getByText(`${A.length + 1} note`).first()).toBeVisible();
      expect(await api.history(branchId)).toHaveLength(1);
      await expect(
        again.getByText(/đã được khôi phục|thay đổi chưa lưu.*khôi phục/i),
      ).toBeVisible();
    });
  });
});
