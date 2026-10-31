import { expect, test } from "@playwright/test";
import { mockUserSession } from "./support/mock-auth";

const PROJECT_ID = "00000000-0000-4000-b000-000000000001";

test.describe("UC-60..62 Collaboration in Editor", () => {
  test.beforeEach(async ({ page }) => {
    await mockUserSession(page, {
      id: "owner-user-id",
      email: "owner@stave.test",
      username: "owner_duc",
      displayName: "Đức Chủ Dự Án",
      role: "user",
    });

    // Mock project info & draft
    await page.route(`**/projects/${PROJECT_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: PROJECT_ID,
          name: "Dự Án Giao Hưởng Mùa Thu",
          description: "Dự án hợp tác sáng tác MIDI",
          archived_at: null,
          visibility: "private",
          created_at: "2026-10-31T00:00:00.000Z",
          updated_at: "2026-10-31T00:00:00.000Z",
          play_count: 0,
        }),
      });
    });

    await page.route(`**/projects/${PROJECT_ID}/draft`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          schemaVersion: 1,
          meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
          tracks: [{ id: "t1", name: "Grand Piano", order: 0, instrument: "acoustic_grand_piano" }],
          notes: [],
        }),
      });
    });

    await page.route(`**/projects/${PROJECT_ID}/draft/recovery`, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ draft: null }) });
    });

    await page.route(`**/projects/${PROJECT_ID}/custom-sounds`, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });

    await page.route(`**/projects/${PROJECT_ID}/commits*`, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });

    await page.route(`**/projects/${PROJECT_ID}/branches*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ id: "main-branch", name: "main", is_default: true }]),
      });
    });

    await page.route(`**/projects/${PROJECT_ID}/comments*`, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });

    await page.route(`**/projects/${PROJECT_ID}/presence*`, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
  });

  test("Test 1: Mở Editor -> bấm icon Collaborators trên toolbar -> hiển thị CollaboratorsDialog với danh sách và nhãn 'Đang chờ'", async ({
    page,
  }) => {
    await page.route(new RegExp(`/projects/${PROJECT_ID}/collaborators`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "collab-item-1",
            projectId: PROJECT_ID,
            userId: "user-collab-1",
            permissionLevel: "view",
            status: "pending",
            createdAt: "2026-10-31T08:00:00.000Z",
            user: {
              id: "user-collab-1",
              username: "hoanganh",
              displayName: "Hoàng Anh",
              avatarUrl: null,
            },
          },
        ]),
      });
    });

    await page.goto(`/projects/${PROJECT_ID}/edit`);
    await page.waitForLoadState("domcontentloaded");

    // Click icon Collaborators on the toolbar
    const collabBtn = page.getByRole("button", { name: "Cộng tác viên" });
    await expect(collabBtn).toBeVisible({ timeout: 15_000 });
    await collabBtn.click();

    // Verify dialog opened
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Cộng tác viên" })).toBeVisible();

    // Verify collaborator item details & 'Đang chờ' status badge
    await expect(dialog.getByText("Hoàng Anh")).toBeVisible();
    await expect(dialog.getByText("Đang chờ")).toBeVisible();
  });

  test("Test 2: Mời cộng tác viên -> submit form -> hiển thị trạng thái đang mời và cập nhật danh sách", async ({
    page,
  }) => {
    let collaboratorList = [
      {
        id: "collab-item-1",
        projectId: PROJECT_ID,
        userId: "user-collab-1",
        permissionLevel: "view",
        status: "pending",
        createdAt: "2026-10-31T08:00:00.000Z",
        user: {
          id: "user-collab-1",
          username: "hoanganh",
          displayName: "Hoàng Anh",
          avatarUrl: null,
        },
      },
    ];

    await page.route(new RegExp(`/projects/${PROJECT_ID}/collaborators`), async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(collaboratorList),
        });
      } else if (route.request().method() === "POST") {
        const body = JSON.parse(route.request().postData() || "{}");
        const newCollab = {
          id: "collab-item-2",
          projectId: PROJECT_ID,
          userId: "user-collab-2",
          permissionLevel: body.permissionLevel || "edit",
          status: "pending" as const,
          createdAt: new Date().toISOString(),
          user: {
            id: "user-collab-2",
            username: body.identifier,
            displayName: "Minh Trí",
            avatarUrl: null,
          },
        };
        collaboratorList = [...collaboratorList, newCollab];
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(newCollab),
        });
      }
    });

    await page.goto(`/projects/${PROJECT_ID}/edit`);
    await page.getByRole("button", { name: "Cộng tác viên" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Fill invitation form
    const inputIdentifier = page.locator('input[name="collaborator-identifier"]');
    await inputIdentifier.fill("minhtri");

    const selectPermission = page.locator('select[name="collaborator-permission"]');
    await selectPermission.selectOption("edit");

    // Click submit "Mời"
    const submitBtn = dialog.getByRole("button", { name: /^Mời$/ });
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Verify success banner and updated list
    await expect(page.getByText(/Đã mời Minh Trí/i)).toBeVisible();
    await expect(dialog.getByText("Minh Trí", { exact: true })).toBeVisible();
  });

  test("Test 3: Đổi dropdown quyền giữa 'Chỉnh sửa' (edit) và 'Chỉ xem' (view)", async ({
    page,
  }) => {
    let currentPermission: "view" | "edit" = "view";

    await page.route(new RegExp(`/projects/${PROJECT_ID}/collaborators`), async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: "collab-item-1",
              projectId: PROJECT_ID,
              userId: "user-collab-1",
              permissionLevel: currentPermission,
              status: "pending",
              createdAt: "2026-10-31T08:00:00.000Z",
              user: {
                id: "user-collab-1",
                username: "hoanganh",
                displayName: "Hoàng Anh",
                avatarUrl: null,
              },
            },
          ]),
        });
      } else if (route.request().method() === "PATCH") {
        const body = JSON.parse(route.request().postData() || "{}");
        currentPermission = body.permissionLevel;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "collab-item-1",
            projectId: PROJECT_ID,
            userId: "user-collab-1",
            permissionLevel: currentPermission,
            status: "pending",
            createdAt: "2026-10-31T08:00:00.000Z",
            user: {
              id: "user-collab-1",
              username: "hoanganh",
              displayName: "Hoàng Anh",
              avatarUrl: null,
            },
          }),
        });
      }
    });

    await page.goto(`/projects/${PROJECT_ID}/edit`);
    await page.getByRole("button", { name: "Cộng tác viên" }).click();

    const permSelect = page.locator('select[name="collab-permission-collab-item-1"]');
    await expect(permSelect).toBeVisible();
    await expect(permSelect).toHaveValue("view");

    // Change dropdown from "view" to "edit"
    await permSelect.selectOption("edit");

    // Verify value switched to "edit"
    await expect(permSelect).toHaveValue("edit");
  });

  test("Test 4: Bấm nút gỡ quyền -> hiển thị hộp thoại xác nhận -> xác nhận gỡ thành công", async ({
    page,
  }) => {
    let collaboratorList = [
      {
        id: "collab-item-1",
        projectId: PROJECT_ID,
        userId: "user-collab-1",
        permissionLevel: "view" as const,
        status: "pending" as const,
        createdAt: "2026-10-31T08:00:00.000Z",
        user: {
          id: "user-collab-1",
          username: "hoanganh",
          displayName: "Hoàng Anh",
          avatarUrl: null,
        },
      },
    ];

    await page.route(new RegExp(`/projects/${PROJECT_ID}/collaborators`), async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(collaboratorList),
        });
      } else if (route.request().method() === "DELETE") {
        collaboratorList = [];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
      }
    });

    await page.goto(`/projects/${PROJECT_ID}/edit`);
    await page.getByRole("button", { name: "Cộng tác viên" }).click();

    // Click remove button
    const removeBtn = page.getByRole("button", { name: "Gỡ Hoàng Anh khỏi dự án" });
    await expect(removeBtn).toBeVisible();
    await removeBtn.click();

    // Verify confirmation modal opens
    const confirmModal = page.getByRole("alertdialog");
    await expect(confirmModal).toBeVisible();
    await expect(confirmModal.getByText(/Rút lời mời đang chờ của/i)).toBeVisible();

    // Confirm removal
    await confirmModal.getByRole("button", { name: "Xác nhận" }).click();

    // Verify collaborator item removed and empty state shown
    await expect(page.getByText("Chưa có cộng tác viên nào trong dự án.")).toBeVisible();
  });
});
