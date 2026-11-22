import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { JamEventListItem } from "@stave/shared-types";
import AdminJamPage from "./page";
import {
  adminCancelJamEvent,
  adminGetAvailableJamProjects,
  adminGetJamEvent,
  adminListJamEvents,
} from "../../../lib/api-jam";
import { setLang } from "../../../lib/i18n";

vi.mock("../../../lib/api-jam", () => ({
  adminListJamEvents: vi.fn(),
  adminGetJamEvent: vi.fn(),
  adminCancelJamEvent: vi.fn(),
  adminGetAvailableJamProjects: vi.fn(),
}));

vi.mock("../../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/api-client")>();
  return {
    ...actual,
    listPublicProjects: vi.fn().mockResolvedValue({ items: [] }),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("../../../context/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1" },
    profile: { id: "u1", role: "admin" },
    loading: false,
  }),
}));

const ENDED_ID = "33333333-3333-4333-8333-333333333333";
const ACTIVE_ID = "44444444-4444-4444-8444-444444444444";

function eventItem(overrides: Partial<JamEventListItem> = {}): JamEventListItem {
  return {
    id: ENDED_ID,
    name: "Nhạc hội",
    description: "Giao hưởng cùng các nghệ sĩ khách mời",
    status: "ended",
    scheduled_start_at: "2026-11-04T09:30:00Z",
    scheduled_end_at: "2026-11-04T11:30:00Z",
    started_at: "2026-11-04T09:30:00Z",
    ended_at: "2026-11-04T11:30:00Z",
    jam_project_id: null,
    starting_project_id: null,
    resulting_project_id: null,
    edit_cooldown_sec: null,
    no_result: false,
    max_participants: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-04T11:30:00Z",
    currentParticipantCount: 0,
    ...overrides,
  };
}

function twoEvents() {
  return [
    eventItem({ id: ENDED_ID, name: "Nhạc hội", status: "ended" }),
    eventItem({
      id: ACTIVE_ID,
      name: "Sessie đêm khuya",
      status: "active",
      started_at: "2026-11-04T20:00:00Z",
      ended_at: null,
      currentParticipantCount: 2,
    }),
  ];
}

beforeEach(() => {
  setLang("vi");
  vi.mocked(adminListJamEvents).mockReset().mockResolvedValue(twoEvents());
  vi.mocked(adminGetAvailableJamProjects).mockReset().mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FE-AJM-01 — liên kết Xem theo trạng thái sự kiện (UC-68)", () => {
  it("sự kiện đã kết thúc: nhãn 'Xem kết quả', trỏ tới /jam/<id>/result", async () => {
    render(<AdminJamPage />);

    const link = await screen.findByRole("link", { name: "Xem kết quả" });

    expect(link.getAttribute("href")).toBe(`/jam/${ENDED_ID}/result`);
  });

  it("sự kiện đang diễn ra: nhãn 'Xem', trỏ tới /jam/<id> (phòng Jam)", async () => {
    render(<AdminJamPage />);

    const link = await screen.findByRole("link", { name: "Xem" });

    expect(link.getAttribute("href")).toBe(`/jam/${ACTIVE_ID}`);
  });

  it("nhãn đổi theo ngôn ngữ (en: 'View result' / 'View')", async () => {
    setLang("en");
    render(<AdminJamPage />);

    const resultLink = await screen.findByRole("link", { name: "View result" });
    expect(resultLink.getAttribute("href")).toBe(`/jam/${ENDED_ID}/result`);
    expect(screen.getByRole("link", { name: "View" }).getAttribute("href")).toBe(
      `/jam/${ACTIVE_ID}`,
    );
  });
});
