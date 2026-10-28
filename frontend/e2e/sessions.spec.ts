import { expect, test } from "@playwright/test";
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

  test("AUTH-088 lists two sessions with device, location and last activity, and only the other one can be ended", async ({
    page,
    browser,
  }) => {
    test.fail(
      true,
      "DFID015: the session list shows an IP address but no approximate location",
    );
    const user = await newUser();
    const second = await browser.newContext();
    await loginThroughUi(await second.newPage(), user);
    await loginThroughUi(page, user);
    await page.goto("/profile/sessions");
    await expect(page.getByText("Thiết bị này")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Đăng xuất" })).toHaveCount(
      1,
    );
    await expect(page.getByText(/hoạt động gần nhất/i)).toHaveCount(2);
    await expect(page.getByText(/vị trí|location/i)).toHaveCount(2);
    await second.close();
  });

  test("AUTH-089 says plainly that only this session is active", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID016: with a single session the list shows one row and no statement that only this session is active",
    );
    const user = await newUser();
    await loginThroughUi(page, user);
    await page.goto("/profile/sessions");
    await expect(page.getByText("Thiết bị này")).toHaveCount(1);
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
    await expect(page.getByText("Thiết bị này")).toHaveCount(0);
  });

  test("AUTH-095 offers no log out action for the current session and points to the normal sign out", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID016: no action is offered for the current session, but the page does not direct the user to sign out normally",
    );
    const user = await newUser();
    await loginThroughUi(page, user);
    await page.goto("/profile/sessions");
    await expect(page.getByText("Thiết bị này")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Đăng xuất" })).toHaveCount(
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
    await page.getByRole("button", { name: "Đăng xuất" }).click();
    await expect(page.locator('p[role="alert"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Đăng xuất" })).toHaveCount(
      1,
    );
    await otherPage.goto("/profile");
    await expect(otherPage).toHaveURL(/\/profile$/);
    await expect(otherPage.locator('input[name="displayName"]')).toBeVisible();
    await second.close();
  });
});
