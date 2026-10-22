import { expect as baseExpect, test, type Page } from "@playwright/test";
import { UserApi } from "./support/api";
import { admin } from "./support/auth-links";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  loginThroughUi,
  type E2eUser,
} from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });
const BACKEND = "http://localhost:3101";

interface Owner {
  user: E2eUser;
  api: UserApi;
}

async function owner(
  displayName = "User B",
  bio: string | null = null,
): Promise<Owner> {
  const user = await createE2eUser();
  await createE2eProfile(user, { display_name: displayName, bio });
  return { user, api: await UserApi.for(user) };
}

async function publish(api: UserApi, name: string, genre?: string) {
  const project = await api.createProject(name);
  await api.putDraft(project.id, [{ id: "n1" }]);
  await api.commit(project.branchId, "Verse idea");
  await api.setVisibility(project.id, "public");
  if (genre) await api.call("PATCH", `/projects/${project.id}`, { genre });
  return project;
}

async function exploreApi(query = "") {
  const res = await fetch(`${BACKEND}/explore/projects${query}`);
  return {
    status: res.status,
    text: await res.text(),
  };
}

async function listedPlays(name: string): Promise<number> {
  const res = await fetch(
    `${BACKEND}/explore/projects?search=${encodeURIComponent(name)}`,
  );
  const body = (await res.json()) as {
    items: Array<{ name: string; play_count: number }>;
  };
  return body.items.find((p) => p.name === name)!.play_count;
}

function titleLinks(page: Page) {
  return page.locator('main a[href^="/projects/"]');
}

async function titles(page: Page) {
  return (await titleLinks(page).allInnerTexts()).map((t) => t.trim());
}

async function waitForList(page: Page) {
  await expect(titleLinks(page).first()).toBeVisible();
}

test.describe("Community and discovery", () => {
  test.setTimeout(150_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test("DISC-001 lists public projects newest first, filters them and leaves the statistics unchanged", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID061: opening the detail page of a public project adds a play every time, for anyone including the owner, so browsing changes the statistics",
    );
    const { api } = await owner();
    await publish(api, "Other Rock", "Rock");
    await publish(api, "Other Pop", "Pop");
    const song = await publish(api, "Public Song", "Jazz");
    await publish(api, "Another Jazz Tune", "Jazz");
    const playsBefore = await listedPlays("Public Song");

    await page.goto("/explore");
    await waitForList(page);
    expect(await titles(page)).toEqual([
      "Another Jazz Tune",
      "Public Song",
      "Other Pop",
      "Other Rock",
    ]);
    await page.getByLabel("Lọc theo thể loại").selectOption("Jazz");
    await expect(titleLinks(page)).toHaveCount(2);
    await page.locator('input[name="q"]').fill("Public");
    await expect(titleLinks(page)).toHaveCount(1);
    expect(await titles(page)).toEqual(["Public Song"]);
    await titleLinks(page).first().click();
    await expect(page).toHaveURL(new RegExp(`/projects/${song.id}$`));
    await expect(page.getByText("Public Song").first()).toBeVisible();
    expect(await listedPlays("Public Song")).toBe(playsBefore);
  });

  test("DISC-002 orders projects by the engagement metrics of the rankings, counting each account once", async ({
    page,
    browser,
  }) => {
    test.fail(
      true,
      "DFID066: most played sorts by the raw play counter; the rankings metrics (plays, forks and comments from distinct accounts) do not exist, so a project viewed three times by one account outranks one viewed once by two accounts",
    );
    const { api } = await owner();
    const low = await publish(api, "Low Plays");
    const high = await publish(api, "High Plays");
    const mid = await publish(api, "Mid Plays");
    for (const [project, views] of [
      [high, 3],
      [mid, 2],
      [low, 1],
    ] as const) {
      for (let i = 0; i < views; i += 1) {
        await fetch(`${BACKEND}/explore/projects/${project.id}`);
      }
    }
    await page.goto("/explore");
    await waitForList(page);
    await page.getByLabel("Sắp xếp").selectOption("most_played");
    await expect
      .poll(async () => titles(page))
      .toEqual(["High Plays", "Mid Plays", "Low Plays"]);
    await page.goto("/rankings");
    await waitForList(page);
    expect(await titles(page)).toEqual(["High Plays", "Mid Plays", "Low Plays"]);

    const loud = await publish(api, "One Account Many Views");
    const wide = await publish(api, "Two Accounts One View Each");
    const first = await createE2eUser();
    await createE2eProfile(first, { display_name: "Viewer One" });
    const second = await createE2eUser();
    await createE2eProfile(second, { display_name: "Viewer Two" });
    const firstContext = await browser.newContext();
    const firstPage = await firstContext.newPage();
    await loginThroughUi(firstPage, first);
    const secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();
    await loginThroughUi(secondPage, second);
    for (let i = 0; i < 6; i += 1) {
      await firstPage.goto(`/projects/${loud.id}`);
      await expect(firstPage.getByText("One Account Many Views").first()).toBeVisible();
    }
    await firstPage.goto(`/projects/${wide.id}`);
    await expect(firstPage.getByText("Two Accounts One View Each").first()).toBeVisible();
    await secondPage.goto(`/projects/${wide.id}`);
    await expect(secondPage.getByText("Two Accounts One View Each").first()).toBeVisible();
    await firstContext.close();
    await secondContext.close();

    await page.goto("/explore");
    await waitForList(page);
    await page.getByLabel("Sắp xếp").selectOption("most_played");
    await expect(page).toHaveURL(/sort=most_played/);
    await expect
      .poll(async () => (await titles(page)).length)
      .toBe(5);
    await page.waitForLoadState("networkidle");
    const order = await titles(page);
    expect(order.indexOf("Two Accounts One View Each")).toBeLessThan(
      order.indexOf("One Account Many Views"),
    );
  });

  test("DISC-003 opens the creator profile from a project row and lists only public projects", async ({
    page,
  }) => {
    const { api, user } = await owner("User B");
    await publish(api, "Public Song");
    await api.createProject("B Private Song");
    await page.goto("/explore");
    await waitForList(page);
    await page.getByRole("link", { name: "User B" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/creator/${user.id}$`));
    await expect(page.getByRole("heading", { name: "User B" })).toBeVisible();
    expect(await titles(page)).toEqual(["Public Song"]);
    await expect(page.getByText("B Private Song")).toHaveCount(0);
  });

  test("DISC-004 explains that nothing has been published and offers a way to start", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID062: with no public project the page says no project was found but offers no call to action to create one",
    );
    const { api } = await owner();
    await api.createProject("Hidden Private Song");
    await page.goto("/explore");
    await expect(page.getByText("Không tìm thấy dự án nào.")).toBeVisible();
    await expect(titleLinks(page)).toHaveCount(0);
    await expect(page.getByText("Hidden Private Song")).toHaveCount(0);
    await expect(
      page
        .locator("main")
        .getByRole("link", { name: /tạo|bắt đầu|đăng ký/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("DISC-005 shows an empty state that suggests clearing the filters and keeps the filter values", async ({
    page,
  }) => {
    const { api } = await owner();
    await publish(api, "Public Song", "Jazz");
    await page.goto("/explore");
    await waitForList(page);
    await page.locator('input[name="q"]').fill("zzqx_no_match_123");
    await expect(page).toHaveURL(/search=zzqx_no_match_123/);
    await page.getByLabel("Lọc theo thể loại").selectOption("Jazz");
    await expect(page.getByText("Không tìm thấy dự án nào.")).toBeVisible();
    await expect(page.getByRole("button", { name: /xoá bộ lọc/i })).toBeVisible();
    await expect(page.locator('input[name="q"]')).toHaveValue(
      "zzqx_no_match_123",
    );
    await expect(page.getByLabel("Lọc theo thể loại")).toHaveValue("Jazz");
    await expect(page.getByText(/không thể tải|có lỗi/i)).toHaveCount(0);
  });

  test("DISC-006 shows a retry message instead of an empty state when the list cannot be loaded", async ({
    page,
  }) => {
    const { api } = await owner();
    await publish(api, "Public Song");
    let broken = true;
    await page.route(
      (url) => url.pathname === "/explore/projects" && url.port === "3101",
      (route) =>
        broken
          ? route.fulfill({ status: 500, body: "{}" })
          : route.continue(),
    );
    await page.goto("/explore");
    await expect(page.getByRole("button", { name: /thử lại/i })).toBeVisible();
    await expect(page.getByText("Không tìm thấy dự án nào.")).toHaveCount(0);
    broken = false;
    await page.getByRole("button", { name: /thử lại/i }).click();
    await waitForList(page);
    expect(await titles(page)).toEqual(["Public Song"]);
  });

  test("DISC-007 never lists private or archived projects, on the page or in the API", async ({
    page,
  }) => {
    const { api } = await owner("User A");
    await api.createProject("Test Song");
    const old = await publish(api, "Old Song");
    await api.archive(old.id);
    await publish(api, "Visible Song");
    await page.goto("/explore");
    await waitForList(page);
    expect(await titles(page)).toEqual(["Visible Song"]);
    for (const term of ["Test Song", "Old Song"]) {
      await page.locator('input[name="q"]').fill(term);
      await expect(page.getByText("Không tìm thấy dự án nào.")).toBeVisible();
      const { text } = await exploreApi(`?search=${encodeURIComponent(term)}`);
      expect(text).not.toContain(term);
    }
    const all = await exploreApi();
    expect(all.text).not.toContain("Test Song");
    expect(all.text).not.toContain("Old Song");
  });

  test("DISC-008 paginates at 20 projects per page", async ({ page }) => {
    test.setTimeout(240_000);
    const { api } = await owner();
    for (let i = 1; i <= 21; i += 1) {
      await publish(api, `Song ${String(i).padStart(2, "0")}`);
    }
    await page.goto("/explore");
    await waitForList(page);
    const first = await titles(page);
    expect(first).toHaveLength(20);
    expect(first[0]).toBe("Song 21");
    await page.getByRole("button", { name: /sau/i }).click();
    await expect(page.getByText("2 / 2")).toBeVisible();
    await expect.poll(async () => (await titles(page)).length).toBe(1);
    const second = await titles(page);
    expect(second).toEqual(["Song 01"]);
    expect(first.filter((name) => second.includes(name))).toEqual([]);
  });

  test("DISC-011 shows a project-not-available page without details after a project is made private", async ({
    page,
  }) => {
    const { api } = await owner("User B");
    const project = await publish(api, "Public Song");
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByText("Public Song").first()).toBeVisible();
    await api.setVisibility(project.id, "private");
    await page.reload();
    await expect(page.getByText("Không mở được dự án")).toBeVisible();
    await expect(page.getByText("Public Song")).toHaveCount(0);
    await expect(page.getByText("User B")).toHaveCount(0);
    const res = await fetch(`${BACKEND}/explore/projects/${project.id}`);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("Public Song");
  });

  test("DISC-014 does not resolve the link of an archived project for a guest", async ({
    page,
  }) => {
    const { api } = await owner("User A");
    const project = await publish(api, "Old Song");
    await api.archive(project.id);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByText("Không mở được dự án")).toBeVisible();
    await expect(page.getByText("Old Song")).toHaveCount(0);
    const res = await fetch(`${BACKEND}/explore/projects/${project.id}`);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("Old Song");
  });

  test("Blocked by DFID061, DISC-015 counts one play per account and ignores the owner's own plays", async ({
    page,
    browser,
  }) => {
    test.fail(
      true,
      "DFID061: every view of the detail page adds a play; the owner's views and repeated views by the same account are counted",
    );
    const { api, user: creator } = await owner("User B");
    const project = await publish(api, "Public Song");
    const viewer = await createE2eUser();
    await createE2eProfile(viewer, { display_name: "User A" });
    const before = await listedPlays("Public Song");

    await loginThroughUi(page, creator);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByText("Public Song").first()).toBeVisible();
    await expect.soft(listedPlays("Public Song")).resolves.toBe(before);

    const second = await browser.newContext();
    const other = await second.newPage();
    await loginThroughUi(other, viewer);
    for (let i = 0; i < 2; i += 1) {
      await other.goto(`/projects/${project.id}`);
      await expect(other.getByText("Public Song").first()).toBeVisible();
    }
    await second.close();
    expect(await listedPlays("Public Song")).toBe(before + 1);
  });

  test("DISC-016 shows a creator profile with the header, statistics and only public projects", async ({
    page,
  }) => {
    const { api, user } = await owner("User B", "Writes jazz in the evening");
    await publish(api, "Public Song");
    await api.createProject("B Private Song");
    const old = await publish(api, "B Old Song");
    await api.archive(old.id);
    await page.goto("/explore");
    await waitForList(page);
    await page.getByRole("link", { name: "User B" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/creator/${user.id}$`));
    await expect(page.getByRole("heading", { name: "User B" })).toBeVisible();
    await expect(page.getByText(`@u_${user.id.slice(0, 8)}`)).toBeVisible();
    await expect(page.getByText("Writes jazz in the evening")).toBeVisible();
    await expect(page.getByText("Dự án công khai", { exact: true })).toBeVisible();
    await expect(page.getByText("Lượt fork", { exact: true })).toBeVisible();
    expect(await titles(page)).toEqual(["Public Song"]);
    await expect(page.getByText("B Private Song")).toHaveCount(0);
    await expect(page.getByText("B Old Song")).toHaveCount(0);
    await titleLinks(page).first().click();
    await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  });

  test("DISC-017 shows profile not found for an account that does not exist", async ({
    page,
  }) => {
    await page.goto("/creator/no_such_user_9876");
    await expect(page.getByRole("heading", { name: "Không tìm thấy" })).toBeVisible();
    await expect(page.getByText("Không tìm thấy người dùng này.")).toBeVisible();
    await expect(titleLinks(page)).toHaveCount(0);
  });

  test("DISC-018 shows profile not found, without a reason, for a suspended account", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID063: the profile of a suspended account is still shown with its public projects",
    );
    const { api, user } = await owner("User B");
    await publish(api, "Public Song");
    const adminUser = await createE2eUser();
    await createE2eProfile(adminUser, { display_name: "Admin" });
    await admin().from("users").update({ role: "admin" }).eq("id", adminUser.id);
    const adminApi = await UserApi.for(adminUser);
    await adminApi.call("POST", `/admin/users/${user.id}/suspend`, {
      reason: "Test suspension",
    });
    void api;
    await page.goto(`/creator/${user.id}`);
    await expect(page.getByText("Không tìm thấy")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/đình chỉ|suspended/i)).toHaveCount(0);
    await expect(page.getByText("Public Song")).toHaveCount(0);
  });

  test("DISC-019 shows the header and an empty state for a creator without public projects", async ({
    page,
  }) => {
    const { api, user } = await owner("User A");
    await api.createProject("A Private Song");
    const old = await publish(api, "A Old Song");
    await api.archive(old.id);
    await page.goto(`/creator/${user.id}`);
    await expect(page.getByRole("heading", { name: "User A" })).toBeVisible();
    await expect(
      page.getByText("Người dùng này chưa có dự án công khai nào."),
    ).toBeVisible();
    await expect(page.getByText("A Private Song")).toHaveCount(0);
    await expect(page.getByText("A Old Song")).toHaveCount(0);
  });

  test("DISC-020 returns only public projects and their statistics from the profile API", async () => {
    const { api, user } = await owner("User B");
    await publish(api, "Public Song");
    await api.createProject("B Private Song");
    const old = await publish(api, "B Old Song");
    await api.archive(old.id);
    const projects = await fetch(`${BACKEND}/explore/users/${user.id}/projects`);
    const projectsText = await projects.text();
    expect(projects.status).toBe(200);
    expect(projectsText).toContain("Public Song");
    expect(projectsText).not.toContain("B Private Song");
    expect(projectsText).not.toContain("B Old Song");
    const profile = (await (
      await fetch(`${BACKEND}/explore/users/${user.id}`)
    ).json()) as { total_public_projects: number };
    expect(profile.total_public_projects).toBe(1);
  });

  test("DISC-023 drops a project made private from the rankings on the next refresh", async ({
    page,
  }) => {
    const { api } = await owner("User B");
    const project = await publish(api, "Public Song");
    await fetch(`${BACKEND}/explore/projects/${project.id}`);
    await page.goto("/rankings");
    await waitForList(page);
    expect(await titles(page)).toEqual(["Public Song"]);
    await api.setVisibility(project.id, "private");
    await page.getByRole("button", { name: "Fork nhiều nhất" }).click();
    await page.getByRole("button", { name: "Xu hướng" }).click();
    await expect(titleLinks(page)).toHaveCount(0);
    await expect(page.getByText("Public Song")).toHaveCount(0);
    await expect(page.getByText(/không thể tải|có lỗi/i)).toHaveCount(0);
  });

  test("Blocked by DFID061, DISC-024 ignores the creator's own plays and counts each account once in the rankings", async ({
    page,
    browser,
  }) => {
    test.fail(
      true,
      "DFID061: every view of the detail page adds a play, so the creator's own views and repeated views by one account change the rankings",
    );
    const b = await owner("User B");
    const c = await owner("User C");
    const rankA = await publish(b.api, "Rank A");
    const rankC = await publish(c.api, "Rank C");
    const viewer = await createE2eUser();
    await createE2eProfile(viewer, { display_name: "User A" });

    await loginThroughUi(page, b.user);
    for (let i = 0; i < 3; i += 1) {
      await page.goto(`/projects/${rankA.id}`);
      await expect(page.getByText("Rank A").first()).toBeVisible();
    }
    const second = await browser.newContext();
    const other = await second.newPage();
    await loginThroughUi(other, viewer);
    for (let i = 0; i < 3; i += 1) {
      await other.goto(`/projects/${rankC.id}`);
      await expect(other.getByText("Rank C").first()).toBeVisible();
    }
    await second.close();
    expect(await listedPlays("Rank A")).toBe(0);
    expect(await listedPlays("Rank C")).toBe(1);
  });

  test("DISC-025 shows the landing page with its three entry points to a guest", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /sáng tác nhạc theo phong cách của bạn/i }),
    ).toBeVisible();
    await expect(page.getByText(/quản lý phiên bản/i).first()).toBeVisible();
    await expect(page.getByText("Phân nhánh & hợp nhất")).toBeVisible();
    await page.getByRole("link", { name: /đăng ký miễn phí/i }).first().click();
    await expect(page).toHaveURL(/\/register$/);
    await page.goBack();
    await page.getByRole("link", { name: /^đăng nhập$/i }).first().click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goBack();
    await page.getByRole("link", { name: /^khám phá$/i }).first().click();
    await expect(page).toHaveURL(/\/explore$/);
  });

  test("DISC-026 sends a logged-in user from the root address to the project dashboard", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID064: a logged-in user opening the root address sees the public home page; there is no redirect to the project dashboard",
    );
    const { user } = await owner("User A");
    await loginThroughUi(page, user);
    await page.goto("/");
    await expect(page).toHaveURL((url) => url.pathname === "/projects", {
      timeout: 10_000,
    });
  });
});
