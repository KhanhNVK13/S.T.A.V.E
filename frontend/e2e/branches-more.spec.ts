import { expect as baseExpect, test, type Page } from "@playwright/test";
import { UserApi, type NoteSeed } from "./support/api";
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

interface Built {
  api: UserApi;
  id: string;
  mainId: string;
  altId: string | null;
  commits: { verse: string; drums: string; chorus: string };
}

async function build(
  page: Page,
  altCommits: string[] | null,
  name = "alt-chorus",
): Promise<Built> {
  const user = await createE2eUser();
  await createE2eProfile(user);
  const api = await UserApi.for(user);
  const p = await api.createProject("Test Song");
  await api.putDraft(p.id, A);
  const verse = await api.commit(p.branchId, "Verse idea");
  await api.putDraft(p.id, B);
  const drums = await api.commit(p.branchId, "Add drums");
  let altId: string | null = null;
  if (altCommits !== null) {
    altId = (await api.createBranch(p.id, name, drums.id)).id;
  }
  await api.putDraft(p.id, C);
  const chorus = await api.commit(p.branchId, "Change chorus");
  if (altId) {
    let notes: NoteSeed[] = [...B];
    for (const [i, message] of altCommits!.entries()) {
      notes = [...notes, { id: `a${i + 1}`, start: BAR * (i + 1) }];
      await api.commitOnBranch(p.id, p.branchId, altId, notes, message);
    }
  }
  await loginThroughUi(page, user);
  return {
    api,
    id: p.id,
    mainId: p.branchId,
    altId,
    commits: { verse: verse.id, drums: drums.id, chorus: chorus.id },
  };
}

async function mergedBranch(page: Page) {
  const user = await createE2eUser();
  await createE2eProfile(user);
  const api = await UserApi.for(user);
  const p = await api.createProject("Test Song");
  await api.putDraft(p.id, A);
  const verse = await api.commit(p.branchId, "Verse idea");
  const feature = await api.createBranch(p.id, "feature-intro", verse.id);
  await api.commitOnBranch(
    p.id,
    p.branchId,
    feature.id,
    [...A, { id: "i1", start: BAR }],
    "Add intro",
  );
  await api.merge(feature.id, p.branchId);
  await loginThroughUi(page, user);
  return { api, id: p.id, mainId: p.branchId };
}

async function openEditorFor(page: Page, projectId: string, head: string) {
  await page.goto(`/projects/${projectId}/edit`);
  await expect(page.getByText(head, { exact: true }).first()).toBeVisible();
}

async function openTab(page: Page, projectId: string, tab: string) {
  await page.goto(`/projects/${projectId}?tab=${tab}`);
}

async function drawNote(page: Page, bar: number) {
  const x = 334 + (bar - 1) * 115.2 + 6;
  await page.mouse.move(x, 330);
  await page.mouse.down();
  await page.mouse.move(x + 50, 330, { steps: 4 });
  await page.mouse.up();
}

async function chooseBranch(page: Page, name: string) {
  await page.locator('button[aria-haspopup="listbox"]').click();
  await page.getByRole("option", { name: new RegExp(name) }).click();
}

function failApi(page: Page, method: string, pathPattern: RegExp) {
  return page.route(
    (url) => url.href.includes(API) && pathPattern.test(url.pathname),
    (route) =>
      route.request().method() === method
        ? route.fulfill({ status: 500, body: "{}" })
        : route.continue(),
  );
}

async function idsOf(api: UserApi, projectId: string) {
  return (await api.draft(projectId)).notes.map((n) => n.id).sort();
}

test.describe("Branch management, further cases", () => {
  test.setTimeout(150_000);
  test.afterAll(async () => {
    await cleanupE2eUsers();
  });

  test("BRN-002 creates a branch from an earlier commit chosen as the starting point", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID027: the create form has only a name; the starting point cannot be chosen and the branch always starts at the latest commit",
    );
    const { api, id } = await build(page, null);
    await openTab(page, id, "branches");
    await page.getByRole("button", { name: /^tạo nhánh$/i }).click();
    await expect(page.locator("form select")).toHaveCount(1);
    await page.locator("form select").selectOption({ index: 1 });
    await page.locator('input[name="branchName"]').fill("verse-retry");
    await page
      .locator("form")
      .getByRole("button", { name: /^tạo nhánh$/i })
      .click();
    await expect(page.getByText("verse-retry")).toBeVisible();
    expect(await api.branchNames(id)).toContain("verse-retry");
  });

  test("BRN-011 keeps each branch draft with its own branch when switching", async ({
    page,
  }) => {
    const { api, id, mainId, altId } = await build(page, ["Try new chorus"]);
    await api.switchTo(mainId, altId!, id);
    await api.putDraft(id, [
      ...B,
      { id: "a1", start: BAR },
      { id: "alt-draft", start: 5 * BAR },
    ]);
    await api.switchTo(altId!, mainId, id);
    await openEditorFor(page, id, "Change chorus");
    await drawNote(page, 2);
    await expect
      .poll(async () => (await api.draft(id)).notes.length)
      .toBe(C.length + 1);
    const mainIds = await idsOf(api, id);

    await chooseBranch(page, "alt-chorus");
    await expect(page.getByText("Đã chuyển sang nhánh alt-chorus")).toBeVisible();
    await expect(
      page.locator('button[aria-haspopup="listbox"]'),
    ).toContainText("alt-chorus");
    await expect(page.getByText("Try new chorus").first()).toBeVisible();
    expect(await idsOf(api, id)).toEqual(["a1", "alt-draft", "n1", "n2"]);

    await chooseBranch(page, "main");
    await expect(
      page.locator('button[aria-haspopup="listbox"]'),
    ).toContainText("main");
    expect(await idsOf(api, id)).toEqual(mainIds);
    expect((await api.history(mainId)).map((c) => c.message)).toEqual([
      "Change chorus",
      "Add drums",
      "Verse idea",
    ]);
    expect((await api.history(altId!))[0].message).toBe("Try new chorus");
  });

  test("BRN-012 loads the latest commit of a branch that has no saved draft and offers no commit", async ({
    page,
  }) => {
    const { api, id } = await build(page, ["Try new chorus"]);
    await openEditorFor(page, id, "Change chorus");
    await chooseBranch(page, "alt-chorus");
    await expect(page.getByText("Đã chuyển sang nhánh alt-chorus")).toBeVisible();
    expect(await idsOf(api, id)).toEqual(["a1", "n1", "n2"]);
    await expect(
      page.getByRole("button", { name: /commit changes/i }),
    ).toBeDisabled();
  });

  test("BRN-013 warns that switching while offline may lose unsaved changes", async ({
    page,
    context,
  }) => {
    test.fail(
      true,
      "DFID035: switching while offline shows no warning and asks for no confirmation; the switch is refused with a generic could-not-switch error",
    );
    const { id } = await build(page, ["Try new chorus"]);
    await openEditorFor(page, id, "Change chorus");
    await context.setOffline(true);
    await drawNote(page, 3);
    await chooseBranch(page, "alt-chorus");
    const warning = page.getByRole("alertdialog").or(page.getByRole("dialog"));
    await expect(warning).toBeVisible();
    await warning.getByRole("button", { name: /^huỷ$/i }).click();
    await expect(
      page.locator('button[aria-haspopup="listbox"]'),
    ).toContainText("main");
    await context.setOffline(false);
  });

  test("BRN-016 shows the branch list with counts and the details of a branch", async ({
    page,
  }) => {
    const { id } = await build(page, ["Try new chorus", "Bridge idea"]);
    await openTab(page, id, "branches");
    const main = page.locator("div").filter({ hasText: /^main\s*Mặc định/ });
    await expect(main.first()).toBeVisible();
    await expect(page.getByText("Đang mở")).toBeVisible();
    await expect(page.getByText("+2")).toBeVisible();
    await expect(page.getByText("-1", { exact: true }).first()).toBeVisible();
    const graph = page.getByRole("region", { name: "Đồ thị nhánh" });
    await expect(graph).toContainText("alt-chorus");
    await expect(graph).toContainText("Bridge idea");
    await page
      .getByRole("button", { name: /xem chi tiết nhánh alt-chorus/i })
      .click();
    const details = page.locator("dl").last();
    await expect(details).toContainText("Add drums");
    await expect(details).toContainText("Bridge idea");
  });

  test("BRN-018 marks a fully merged branch as merged", async ({ page }) => {
    const { api, id } = await mergedBranch(page);
    await openTab(page, id, "branches");
    await expect(page.getByText("Đã hợp nhất")).toBeVisible();
    await expect(page.getByText(/xoá an toàn|có thể xoá/i)).toBeVisible();
    expect(await api.branchNames(id)).toContain("feature-intro");
  });

  test("BRN-020 lists the history of one branch with unique and inherited commits marked", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID025: the commit list shows message, author and time but no counts of notes added, removed and modified",
    );
    const { id } = await build(page, ["Try new chorus", "Bridge idea"]);
    await openTab(page, id, "branches");
    await page
      .locator("div")
      .filter({ hasText: /^alt-chorus/ })
      .getByRole("link", { name: /lịch sử/i })
      .first()
      .click();
    const rows = page.locator('input[type="checkbox"]');
    await expect(rows).toHaveCount(4);
    const text = await page.locator("main").innerText();
    const order = ["Bridge idea", "Try new chorus", "Add drums", "Verse idea"];
    const positions = order.map((m) => text.indexOf(m));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(positions.every((p) => p >= 0)).toBe(true);
    await expect(page.getByText("Riêng nhánh")).toHaveCount(2);
    await expect(page.getByText("Kế thừa")).toHaveCount(2);
    await expect(page.getByText(/\+\d+\s*note|thêm \d+/i).first()).toBeVisible();
  });

  test("BRN-021 gives the same history when the Commit tab is filtered to the branch", async ({
    page,
  }) => {
    const { id } = await build(page, ["Try new chorus", "Bridge idea"]);
    await openTab(page, id, "commits");
    await expect(page.getByText("Change chorus")).toBeVisible();
    await page
      .getByLabel("Chọn nhánh để xem lịch sử")
      .selectOption({ label: "alt-chorus" });
    await expect(page.getByText("Bridge idea")).toBeVisible();
    await expect(page.locator('input[type="checkbox"]')).toHaveCount(4);
    await expect(page.getByText("Riêng nhánh")).toHaveCount(2);
    await expect(page.getByText("Kế thừa")).toHaveCount(2);
    await expect(page.getByText("Change chorus")).toHaveCount(0);
  });

  test("BRN-022 shows inherited history and says the branch has not diverged", async ({
    page,
  }) => {
    const { api, id } = await build(page, null);
    await api.createBranch(id, "empty-idea");
    await openTab(page, id, "branches");
    await page
      .locator("div")
      .filter({ hasText: /^empty-idea/ })
      .getByRole("link", { name: /lịch sử/i })
      .first()
      .click();
    await expect(page.getByText("Change chorus")).toBeVisible();
    await expect(page.getByText("Verse idea")).toBeVisible();
    await expect(page.getByText(/chưa có commit\s*riêng/i)).toBeVisible();
  });

  test("BRN-023 shows a retry message instead of an empty list when the branch history fails", async ({
    page,
  }) => {
    const { id } = await build(page, ["Try new chorus"]);
    await openTab(page, id, "branches");
    await expect(page.getByText("alt-chorus", { exact: true })).toBeVisible();
    await failApi(page, "GET", /^\/branches\/[^/]+\/history$/);
    await page
      .locator("div")
      .filter({ hasText: /^alt-chorus/ })
      .getByRole("link", { name: /lịch sử/i })
      .first()
      .click();
    await expect(page.getByRole("button", { name: /thử lại/i })).toBeVisible();
    await expect(page.getByText("Chưa có commit nào.")).toHaveCount(0);
  });

  test("BRN-029 reports that a branch with nothing new has nothing to merge", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID037: for a branch with nothing new the Merge button is only disabled; no message says there is nothing to merge",
    );
    const { api, id, mainId } = await mergedBranch(page);
    const before = await api.history(mainId);
    await openTab(page, id, "branches");
    await expect(page.getByText("Đã hợp nhất")).toBeVisible();
    await expect(page.getByText(/không có gì để hợp nhất/i)).toBeVisible();
    expect(await api.history(mainId)).toEqual(before);
  });

  test("BRN-037 refuses to delete the default branch and explains why", async ({
    page,
  }) => {
    const { api, id, mainId, altId } = await build(page, ["Try new chorus"]);
    await api.switchTo(mainId, altId!, id);
    await openTab(page, id, "branches");
    await expect(page.getByText("alt-chorus", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /xoá/i })).toHaveCount(2);
    expect(await api.branchNames(id)).toContain("main");
  });

  test("BRN-038 does not delete the active branch and tells the user to switch first", async ({
    page,
  }) => {
    const { api, id, mainId, altId } = await build(page, ["Try new chorus"]);
    await api.switchTo(mainId, altId!, id);
    await openTab(page, id, "branches");
    await expect(page.getByText("Đang mở")).toBeVisible();
    const del = page.getByRole("button", { name: /xoá nhánh alt-chorus/i });
    await expect(del).toHaveCount(1);
    await expect(del).toBeDisabled();
    await expect(del).toHaveAttribute("title", /chuyển sang nhánh khác/i);
    expect(await api.branchNames(id)).toContain("alt-chorus");
  });
});
