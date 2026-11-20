import { expect, test } from "@playwright/test";
import { admin } from "./support/auth-links";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  loginThroughUi,
} from "./support/test-user";

async function newUser() {
  const user = await createE2eUser();
  await createE2eProfile(user, { display_name: "User A" });
  return user;
}

test.describe("Sessions", () => {
  test.afterAll(async () => {
    await cleanupE2eUsers();
  });

  test("AUTH-088 lists two sessions with device, address and last activity, and only the other one can be ended", async ({
    page,
    browser,
  }) => {
    const user = await newUser();
    const second = await browser.newContext();
    await loginThroughUi(await second.newPage(), user);
    await loginThroughUi(page, user);
    await page.goto("/profile/sessions");
    await expect(page.getByText("Thiết bị này", { exact: true })).toHaveCount(1);
    await expect(page.locator("main").getByRole("button", { name: "Đăng xuất", exact: true })).toHaveCount(
      1,
    );
    await expect(page.getByText(/hoạt động gần nhất/i)).toHaveCount(1);
    await expect(page.getByText(/địa chỉ ip/i)).toHaveCount(1);
    await second.close();
  });

  test("AUTH-089 says plainly that only this session is active", async ({
    page,
  }) => {
    const user = await newUser();
    await loginThroughUi(page, user);
    await page.goto("/profile/sessions");
    await expect(page.getByText("Thiết bị này", { exact: true })).toHaveCount(1);
    await expect(
      page.getByText(/chỉ có phiên này|chỉ phiên này|only this session/i),
    ).toBeVisible();
  });

  test("AUTH-090 reports a failure to load the sessions instead of an empty list", async ({
    page,
  }) => {
    const user = await newUser();
    await loginThroughUi(page, user);
    await page.route("**/auth/sessions", (route) =>
      route.request().method() === "GET"
        ? route.fulfill({ status: 500, body: "{}" })
        : route.continue(),
    );
    await page.goto("/profile/sessions");
    await expect(
      page.locator('div[role="alert"]:not(#__next-route-announcer__)'),
    ).toContainText(/không tải được/i);
    await expect(page.getByText("Thiết bị này", { exact: true })).toHaveCount(0);
  });

  test("AUTH-091 a session without a known location shows device and time only", async ({ page, browser }) => {
    const user = await newUser();
    const second = await browser.newContext();
    await loginThroughUi(await second.newPage(), user);
    await loginThroughUi(page, user);
    const { data: rows } = await admin().from("sessions").select("id, ip_address").eq("user_id", user.id);
    expect(rows).toHaveLength(2);
    await page.goto("/profile/sessions");
    await expect(page.getByText("Thiết bị này", { exact: true }).first()).toBeVisible();
    const other = page.locator("main").getByRole("button", { name: "Đăng xuất", exact: true }).locator("xpath=ancestor::div[contains(@class,'min-h-')][1]");
    const before = (await other.innerText()).replace(/\s+/g, " ");
    await admin().from("sessions").update({ ip_address: null }).eq("user_id", user.id);
    await page.reload();
    const entry = page.locator("main").getByRole("button", { name: "Đăng xuất", exact: true }).locator("xpath=ancestor::div[contains(@class,'min-h-')][1]");
    const text = (await entry.innerText()).replace(/\s+/g, " ");
    expect(before.length).toBeGreaterThan(0);
    expect(text).not.toContain("?");
    expect(text).not.toMatch(/(?:\d{1,3}\.){3}\d{1,3}|::1|vị trí|location/i);
    expect(text).toMatch(/\d{1,2}[:.]\d{2}/);
    await second.close();
  });

  test("AUTH-095 offers no log out action for the current session and points to the normal sign out", async ({
    page,
  }) => {
    const user = await newUser();
    await loginThroughUi(page, user);
    await page.goto("/profile/sessions");
    await expect(page.getByText("Thiết bị này", { exact: true })).toHaveCount(1);
    await expect(page.locator("main").getByRole("button", { name: "Đăng xuất", exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByText(/đăng xuất bình thường|menu/i)).toBeVisible();
  });

  test("AUTH-096 reports a server error when ending another session and keeps it listed", async ({
    page,
    browser,
  }) => {
    const user = await newUser();
    const second = await browser.newContext();
    const otherPage = await second.newPage();
    await loginThroughUi(otherPage, user);
    await loginThroughUi(page, user);
    await page.route("**/auth/sessions/*", (route) =>
      route.request().method() === "DELETE"
        ? route.fulfill({ status: 500, body: "{}" })
        : route.continue(),
    );
    await page.goto("/profile/sessions");
    await page.locator("main").getByRole("button", { name: "Đăng xuất", exact: true }).click();
    await expect(page.locator('p[role="alert"]')).toBeVisible();
    await expect(page.locator("main").getByRole("button", { name: "Đăng xuất", exact: true })).toHaveCount(
      1,
    );
    await otherPage.goto("/profile");
    await expect(otherPage).toHaveURL(/\/profile$/);
    await expect(otherPage.locator('input[name="displayName"]')).toBeVisible();
    await second.close();
  });
});
