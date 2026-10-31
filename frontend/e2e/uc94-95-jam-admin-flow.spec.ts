import { expect, test } from "@playwright/test";
import { mockUserSession } from "./support/mock-auth";

const JAM_EVENT_ID = "00000000-0000-4000-d000-000000000001";

test.describe("UC-94..95 Jam Admin Configuration & End Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate as Admin user
    await mockUserSession(page, {
      id: "admin-user-id",
      email: "admin@stave.test",
      username: "admin_duc",
      displayName: "Đức Quản Trị Viên",
      role: "admin",
    });

    // Mock starter projects for picker
    await page.route(new RegExp(`/admin/jam.*available-projects`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: "proj-starter-1", name: "Basic Synth Starter" },
          { id: "proj-starter-2", name: "Drum Beat Base" },
        ]),
      });
    });
  });

  test("Test 1 (UC-94): Truy cập /admin/jam với quyền Admin -> bấm 'Cấu hình' trên sự kiện đang active -> kiểm tra Tên sự kiện và Dự án khởi đầu bị disabled và mờ kèm banner cảnh báo -> cho phép kéo dài thời gian kết thúc và chỉnh cooldown", async ({
    page,
  }) => {
    const futureEnd = new Date(Date.now() + 3600 * 1000).toISOString();

    const activeEvent = {
      id: JAM_EVENT_ID,
      name: "Live Electronic Beat Jam",
      description: "Sự kiện Jam nhạc điện tử trực tiếp",
      status: "active" as const,
      currentParticipantCount: 8,
      max_participants: 50,
      scheduled_start_at: new Date(Date.now() - 1800 * 1000).toISOString(),
      scheduled_end_at: futureEnd,
      started_at: new Date(Date.now() - 1800 * 1000).toISOString(),
      ended_at: null,
      jam_project_id: "jam-proj-1",
      starting_project_id: "proj-starter-1",
      edit_cooldown_sec: 5,
      no_result: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await page.route(new RegExp(`/admin/jam/events(\\?.*)?$`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([activeEvent]),
      });
    });

    await page.route(new RegExp(`/admin/jam.*events/${JAM_EVENT_ID}$`), async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(activeEvent),
        });
      } else if (route.request().method() === "PATCH") {
        const body = JSON.parse(route.request().postData() || "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ...activeEvent,
            scheduled_end_at: body.scheduledEndAt ?? activeEvent.scheduled_end_at,
            edit_cooldown_sec: body.editCooldownSec ?? activeEvent.edit_cooldown_sec,
          }),
        });
      }
    });

    await page.goto("/admin/jam");
    await page.waitForLoadState("domcontentloaded");

    // Verify row for the active event
    await expect(page.getByText("Live Electronic Beat Jam")).toBeVisible();
    await expect(page.locator("span").filter({ hasText: "Đang diễn ra" }).first()).toBeVisible();

    // Click "Cấu hình"
    const configBtn = page.getByRole("button", { name: "Cấu hình" });
    await expect(configBtn).toBeVisible();
    await configBtn.click();

    // Verify AdminJamConfigDialog opened
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Cấu hình sự kiện Community Jam")).toBeVisible();

    // 1. Verify warning banner for active event
    const statusBanner = dialog.getByRole("status");
    await expect(statusBanner).toBeVisible();
    await expect(
      statusBanner.getByText(/Sự kiện đang diễn ra\. Tên sự kiện và dự án khởi đầu đã được khóa/i),
    ).toBeVisible();

    // 2. Verify Tên sự kiện is disabled and dimmed with locked badge
    const nameInput = dialog.locator('input[placeholder="Nhập tên sự kiện Jam..."]');
    await expect(nameInput).toBeDisabled();
    await expect(nameInput).toHaveClass(/opacity-60/);
    await expect(nameInput).toHaveClass(/cursor-not-allowed/);
    await expect(dialog.getByText("Đã khóa").first()).toBeVisible();

    // 3. Verify Dự án khởi đầu is disabled and dimmed
    const projectSelect = dialog.locator("select").filter({ hasText: "Basic Synth Starter" });
    await expect(projectSelect).toBeDisabled();
    await expect(projectSelect).toHaveClass(/opacity-60/);
    await expect(projectSelect).toHaveClass(/cursor-not-allowed/);

    // 4. Verify extending end time and adjusting cooldown are enabled and editable
    const startInput = dialog.locator("label", { hasText: "Thời gian bắt đầu" }).locator('input[type="datetime-local"]');
    await expect(startInput).toBeDisabled();

    const endInput = dialog.locator("label", { hasText: "Kéo dài thời gian kết thúc" }).locator('input[type="datetime-local"]');
    await expect(endInput).toBeEnabled();

    const cooldownInput = dialog.locator('input[type="number"]');
    await expect(cooldownInput).toBeEnabled();
    await cooldownInput.fill("15");

    // Submit configuration changes
    const saveBtn = dialog.getByRole("button", { name: "Lưu thay đổi" });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Verify success toast notification
    await expect(page.getByText(/Cập nhật cấu hình sự kiện Jam thành công/i)).toBeVisible();
  });

  test("Test 2 (UC-95): Bấm 'Kết thúc sự kiện' -> modal EndJamConfirmModal mở ra cảnh báo số người online -> bấm xác nhận -> badge chuyển sang 'Đã kết thúc', phòng hiển thị JamFrozenBanner kèm nút 'Xem kết quả Jam'", async ({
    page,
  }) => {
    let eventStatus: "active" | "ended" = "active";
    const futureEnd = new Date(Date.now() + 3600 * 1000).toISOString();

    const getEventData = () => ({
      id: JAM_EVENT_ID,
      name: "Live Electronic Beat Jam",
      description: "Sự kiện Jam nhạc điện tử trực tiếp",
      status: eventStatus,
      currentParticipantCount: eventStatus === "active" ? 8 : 0,
      max_participants: 50,
      scheduled_start_at: new Date(Date.now() - 1800 * 1000).toISOString(),
      scheduled_end_at: futureEnd,
      started_at: new Date(Date.now() - 1800 * 1000).toISOString(),
      ended_at: eventStatus === "ended" ? new Date().toISOString() : null,
      jam_project_id: "jam-proj-1",
      starting_project_id: "proj-starter-1",
      edit_cooldown_sec: 5,
      no_result: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await page.route(new RegExp(`/admin/jam/events(\\?.*)?$`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([getEventData()]),
      });
    });

    await page.route(new RegExp(`/admin/jam.*events/${JAM_EVENT_ID}$`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(getEventData()),
      });
    });

    await page.route(new RegExp(`/admin/jam.*events/${JAM_EVENT_ID}/end`), async (route) => {
      eventStatus = "ended";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          status: "ended",
          endedAt: new Date().toISOString(),
        }),
      });
    });

    // Mock public jam room routes for when entering /jam/[id]
    await page.route(new RegExp(`/jam/events/${JAM_EVENT_ID}$`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(getEventData()),
      });
    });

    await page.goto("/admin/jam");
    await page.waitForLoadState("domcontentloaded");

    // Click "Kết thúc sự kiện"
    const endEventBtn = page.getByRole("button", { name: "Kết thúc sự kiện" });
    await expect(endEventBtn).toBeVisible();
    await endEventBtn.click();

    // Verify EndJamConfirmModal opens with warning about online participant count
    const confirmModal = page.getByRole("alertdialog");
    await expect(confirmModal).toBeVisible();
    await expect(confirmModal.getByRole("heading", { name: "Xác nhận kết thúc sự kiện Jam" })).toBeVisible();
    await expect(confirmModal.getByText(/Đang có 8 người tham gia trong phòng/i)).toBeVisible();
    await expect(confirmModal.getByText(/Hành động này sẽ lập tức đóng băng phòng Jam/i)).toBeVisible();

    // Confirm end of jam event
    const confirmBtn = confirmModal.getByRole("button", { name: "Xác nhận kết thúc" });
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // Verify badge switches to "Đã kết thúc"
    await expect(page.getByText("Đã kết thúc").first()).toBeVisible();

    // Access the Jam room /jam/[id] to verify the frozen state
    await page.goto(`/jam/${JAM_EVENT_ID}`);
    await page.waitForLoadState("domcontentloaded");

    // Verify room badge is "Đã kết thúc"
    await expect(page.getByText("Đã kết thúc").first()).toBeVisible();

    // Verify room displays JamFrozenBanner
    const frozenBanner = page.getByRole("alert").filter({ hasText: /Sự kiện Jam đã kết thúc! Bản nhạc đã được đóng băng/i });
    await expect(frozenBanner).toBeVisible();

    // Verify "Xem kết quả Jam" button is present and navigates to result page
    const viewResultBtn = frozenBanner.getByRole("button", { name: "Xem kết quả Jam" });
    await expect(viewResultBtn).toBeVisible();
    await viewResultBtn.click();

    await page.waitForURL(new RegExp(`/jam/${JAM_EVENT_ID}/result$`));
    expect(page.url()).toContain(`/jam/${JAM_EVENT_ID}/result`);
  });
});
