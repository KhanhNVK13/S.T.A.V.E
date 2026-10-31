import { expect, test } from "@playwright/test";
import { mockUserSession } from "./support/mock-auth";

const JAM_ACTIVE_ID = "00000000-0000-4000-c000-000000000001";
const JAM_ENDED_ID = "00000000-0000-4000-c000-000000000002";

test.describe("UC-66..68 Community Jam User Journey", () => {
  test.beforeEach(async ({ page }) => {
    await mockUserSession(page, {
      id: "user-tester-1",
      email: "tester@stave.test",
      username: "ductester",
      displayName: "Đức Jammer",
      role: "user",
    });

    // Mock audio samples if requested by Tone.js / snapshot player
    await page.route("**/instruments/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "audio/wav", body: "" });
    });
  });

  test("Test 1 (UC-66): Truy cập /jam -> hiển thị 3 nhóm 'Đang diễn ra', 'Sắp diễn ra', 'Đã kết thúc' -> click vào sự kiện đang chạy -> chuyển hướng vào phòng /jam/[id]", async ({
    page,
  }) => {
    const futureEnd = new Date(Date.now() + 3600 * 1000).toISOString();
    const futureStart = new Date(Date.now() + 1800 * 1000).toISOString();

    await page.route(new RegExp(`/jam/events(\\?.*)?$`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: JAM_ACTIVE_ID,
            name: "Weekend Synth Jam",
            description: "Phòng nhạc sống cuối tuần cùng cộng đồng",
            status: "active",
            currentParticipantCount: 4,
            max_participants: 50,
            scheduled_start_at: new Date(Date.now() - 1800 * 1000).toISOString(),
            scheduled_end_at: futureEnd,
            jam_project_id: "jam-proj-1",
            starting_project_id: null,
            edit_cooldown_sec: 5,
            no_result: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: "jam-scheduled-1",
            name: "Chill Lo-Fi Session",
            description: "Thử nghiệm giai điệu nhẹ nhàng",
            status: "scheduled",
            currentParticipantCount: 0,
            max_participants: 50,
            scheduled_start_at: futureStart,
            scheduled_end_at: new Date(Date.now() + 7200 * 1000).toISOString(),
            jam_project_id: "jam-proj-2",
            starting_project_id: null,
            edit_cooldown_sec: 5,
            no_result: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: JAM_ENDED_ID,
            name: "Retro Chiptune Jam",
            description: "Nhạc 8-bit hoài niệm",
            status: "ended",
            currentParticipantCount: 0,
            max_participants: 50,
            scheduled_start_at: new Date(Date.now() - 7200 * 1000).toISOString(),
            scheduled_end_at: new Date(Date.now() - 3600 * 1000).toISOString(),
            jam_project_id: "jam-proj-3",
            starting_project_id: null,
            edit_cooldown_sec: 5,
            no_result: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]),
      });
    });

    await page.goto("/jam");
    await page.waitForLoadState("domcontentloaded");

    // Verify 3 group tabs exist
    const tabActive = page.getByRole("tab", { name: "Đang diễn ra" });
    const tabScheduled = page.getByRole("tab", { name: "Sắp diễn ra" });
    const tabEnded = page.getByRole("tab", { name: "Đã kết thúc" });

    await expect(tabActive).toBeVisible();
    await expect(tabScheduled).toBeVisible();
    await expect(tabEnded).toBeVisible();

    // Active tab is selected by default; verify active event card
    await expect(page.getByText("Weekend Synth Jam")).toBeVisible();
    const joinBtn = page.getByRole("button", { name: "Tham gia ngay" });
    await expect(joinBtn).toBeVisible();

    // Click "Tham gia ngay" -> redirects to room /jam/[id]
    await joinBtn.click();
    await page.waitForURL(new RegExp(`/jam/${JAM_ACTIVE_ID}$`));
    expect(page.url()).toContain(`/jam/${JAM_ACTIVE_ID}`);
  });

  test("Test 2 (UC-66): Trong phòng Jam, xác minh có hiển thị: danh sách avatar người online, đồng hồ đếm ngược thời gian còn lại, và lưới Piano Roll", async ({
    page,
  }) => {
    const futureEnd = new Date(Date.now() + 3600 * 1000).toISOString();

    const mockState = {
      snapshot: {
        schemaVersion: 1,
        meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
        tracks: [
          { id: "t1", name: "Synth Lead", order: 0, instrument: "synth" },
        ],
        notes: [
          { id: "n1", trackId: "t1", pitch: 60, start: 0, duration: 480, velocity: 100 },
          { id: "n2", trackId: "t1", pitch: 64, start: 480, duration: 480, velocity: 90 },
        ],
      },
      endsAt: futureEnd,
      cooldownSec: 5,
      participants: [
        {
          userId: "user-tester-1",
          socketId: "sock-1",
          displayName: "Đức Jammer",
          username: "ductester",
          avatarUrl: null,
        },
        {
          userId: "user-partner-2",
          socketId: "sock-2",
          displayName: "Hoàng Anh",
          username: "hoanganh",
          avatarUrl: null,
        },
      ],
      activity: [],
    };

    // Auto-dispatch connect and jam:state into __jamSocket
    await page.addInitScript((payload) => {
      let sock: any = null;
      Object.defineProperty(window, "__jamSocket", {
        configurable: true,
        enumerable: true,
        get() {
          return sock;
        },
        set(s) {
          sock = s;
          if (s) {
            setTimeout(() => {
              try {
                s.emitReserved("connect");
                s.emitReserved("jam:state", payload);
              } catch (e) {
                console.error("Socket mock trigger error:", e);
              }
            }, 60);
          }
        },
      });
    }, mockState);

    await page.route(new RegExp(`/jam/events/${JAM_ACTIVE_ID}$`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: JAM_ACTIVE_ID,
          name: "Weekend Synth Jam",
          description: "Phòng nhạc sống cuối tuần cùng cộng đồng",
          status: "active",
          scheduled_start_at: new Date(Date.now() - 1800 * 1000).toISOString(),
          scheduled_end_at: futureEnd,
          started_at: new Date(Date.now() - 1800 * 1000).toISOString(),
          ended_at: null,
          jam_project_id: "jam-proj-1",
          starting_project_id: null,
          edit_cooldown_sec: 5,
          no_result: false,
          max_participants: 50,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
    });

    await page.goto(`/jam/${JAM_ACTIVE_ID}`);
    await page.waitForLoadState("domcontentloaded");

    // Manually trigger in case setter ran before listeners were attached
    await page.evaluate((payload) => {
      const s = (window as any).__jamSocket;
      if (s) {
        s.emitReserved("connect");
        s.emitReserved("jam:state", payload);
      }
    }, mockState);

    // 1. Verify online avatars list group
    const participantsGroup = page.getByRole("group", { name: "Người đang trong phòng Jam" });
    await expect(participantsGroup).toBeVisible();
    await expect(participantsGroup.getByTitle(/Đức Jammer/i)).toBeVisible();
    await expect(participantsGroup.getByTitle(/Hoàng Anh/i)).toBeVisible();

    // 2. Verify countdown timer
    const countdownTimer = page.getByRole("timer");
    await expect(countdownTimer).toBeVisible();
    await expect(countdownTimer.getByText("Còn")).toBeVisible();

    // 3. Verify Piano Roll collaborative live editor grid
    const trackSelect = page.getByRole("combobox", { name: "Chọn track" });
    await expect(trackSelect).toBeVisible();
    await expect(trackSelect).toHaveValue("t1");
    await expect(page.locator("canvas").first()).toBeVisible();
  });

  test("Test 3 (UC-68): Truy cập trang kết quả /jam/[id]/result -> xác minh: Piano Roll chỉ đọc, Nút Nghe thử/Tạm dừng, Danh sách nghệ sĩ đóng góp, Nút Fork", async ({
    page,
  }) => {
    await page.route(new RegExp(`/jam/events/${JAM_ENDED_ID}/result`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: JAM_ENDED_ID,
          name: "Retro Chiptune Jam",
          status: "ended",
          startedAt: "2026-10-31T08:00:00.000Z",
          endedAt: "2026-10-31T10:00:00.000Z",
          resultingProjectId: "project-fork-source-1",
          hasContributions: true,
          snapshot: {
            schemaVersion: 1,
            meta: { tempo: 128, timeSignature: [4, 4], ppq: 480 },
            tracks: [
              { id: "t1", name: "Chiptune Lead", order: 0, instrument: "synth" },
            ],
            notes: [
              { id: "n1", trackId: "t1", pitch: 64, start: 0, duration: 480, velocity: 110 },
              { id: "n2", trackId: "t1", pitch: 67, start: 480, duration: 480, velocity: 90 },
            ],
          },
          contributors: [
            {
              userId: "art-1",
              username: "bach_composer",
              displayName: "Bách Nghệ Sĩ",
              avatarUrl: null,
              actionCount: 24,
            },
            {
              userId: "art-2",
              username: "khanh_producer",
              displayName: "Khánh Producer",
              avatarUrl: null,
              actionCount: 11,
            },
          ],
        }),
      });
    });

    await page.goto(`/jam/${JAM_ENDED_ID}/result`);
    await page.waitForLoadState("domcontentloaded");

    // 1. Verify Piano Roll in read-only mode (renders canvas without pencil/eraser editing tools)
    await expect(page.getByText("Retro Chiptune Jam")).toBeVisible();
    await expect(page.locator("canvas").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Pencil" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Eraser" })).toHaveCount(0);

    // 2. Verify "Nghe thử" / "Tạm dừng" toggle button
    const playBtn = page.getByRole("button", { name: "Nghe thử" });
    await expect(playBtn).toBeVisible();

    await playBtn.click();
    const pauseBtn = page.getByRole("button", { name: "Tạm dừng" });
    await expect(pauseBtn).toBeVisible();

    await pauseBtn.click();
    await expect(page.getByRole("button", { name: "Nghe thử" })).toBeVisible();

    // 3. Verify contributors list and exact edit counts
    await expect(page.getByRole("heading", { name: "Nghệ sĩ tham gia đóng góp" })).toBeVisible();
    await expect(page.getByText("Bách Nghệ Sĩ")).toBeVisible();
    await expect(page.getByText("24 thao tác")).toBeVisible();
    await expect(page.getByText("Khánh Producer")).toBeVisible();
    await expect(page.getByText("11 thao tác")).toBeVisible();

    // 4. Verify "Sao chép về dự án của tôi" (Fork) button is ready for interaction
    const forkBtn = page.getByRole("button", { name: "Sao chép về dự án của tôi" });
    await expect(forkBtn).toBeVisible();
    await expect(forkBtn).toBeEnabled();
  });
});
