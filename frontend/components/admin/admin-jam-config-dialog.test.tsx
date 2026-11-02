import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AvailableJamProjectDto, JamEvent } from "@stave/shared-types";
import { AdminJamConfigDialog } from "./admin-jam-config-dialog";
import * as apiJam from "../../lib/api-jam";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("../../lib/api-jam", () => ({
  adminConfigureJamEvent: vi.fn(),
  adminCancelJamEvent: vi.fn(),
}));

const mockProjects: AvailableJamProjectDto[] = [
  { id: "proj-1", name: "Public Synth Track" },
  { id: "proj-2", name: "Jazz Piano Starter" },
];

function makeEvent(overrides: Partial<JamEvent> = {}): JamEvent {
  const futureStart = new Date(Date.now() + 3600 * 1000).toISOString();
  const futureEnd = new Date(Date.now() + 7200 * 1000).toISOString();
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Summer Chill Jam",
    description: "Relaxed beats for the evening",
    status: "scheduled",
    scheduled_start_at: futureStart,
    scheduled_end_at: futureEnd,
    started_at: null,
    ended_at: null,
    jam_project_id: "jam-proj-1",
    starting_project_id: "proj-1",
    edit_cooldown_sec: 5,
    no_result: false,
    max_participants: 50,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("AdminJamConfigDialog (UC-94)", () => {
  it("scheduled event: renders form with all fields editable and shows cancel section", () => {
    const event = makeEvent({ status: "scheduled" });
    const onClose = vi.fn();
    const onSaved = vi.fn();

    render(
      <AdminJamConfigDialog
        event={event}
        projects={mockProjects}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    expect(screen.getByText("Cấu hình sự kiện Community Jam")).toBeDefined();
    const nameInput = screen.getByPlaceholderText(
      "Nhập tên sự kiện Jam...",
    ) as HTMLInputElement;
    expect(nameInput.disabled).toBe(false);
    expect(nameInput.value).toBe("Summer Chill Jam");

    // Cancel section exists
    expect(screen.getByText("Hủy sự kiện này")).toBeDefined();
    // Save button exists
    expect(screen.getByText("Lưu thay đổi")).toBeDefined();
  });

  it("active event (BR-75 & 2.E1): disables name, start time, and starting project with active warning banner", () => {
    const event = makeEvent({
      status: "active",
      started_at: new Date(Date.now() - 600 * 1000).toISOString(),
    });
    const onClose = vi.fn();
    const onSaved = vi.fn();

    render(
      <AdminJamConfigDialog
        event={event}
        projects={mockProjects}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    // Warning banner shown
    expect(screen.getByRole("status")).toBeDefined();
    expect(
      screen.getByText(
        /Sự kiện đang diễn ra\. Tên sự kiện và dự án khởi đầu đã được khóa/,
      ),
    ).toBeDefined();

    // Name input is disabled
    const nameInput = screen.getByPlaceholderText(
      "Nhập tên sự kiện Jam...",
    ) as HTMLInputElement;
    expect(nameInput.disabled).toBe(true);

    // Cancel button should NOT be available for active event (UC-95 "Kết thúc ngay" handles live room)
    expect(screen.queryByText("Hủy sự kiện này")).toBeNull();
  });

  it("ended event (2.E2): shows locked message and disallows editing", () => {
    const event = makeEvent({
      status: "ended",
      ended_at: new Date().toISOString(),
    });
    const onClose = vi.fn();
    const onSaved = vi.fn();

    render(
      <AdminJamConfigDialog
        event={event}
        projects={mockProjects}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    expect(
      screen.getByText("Sự kiện đã kết thúc, không thể thay đổi cấu hình."),
    ).toBeDefined();
    expect(screen.queryByText("Lưu thay đổi")).toBeNull();
  });

  it("validates cooldown limits (4.E2: must be between 1 and 3600)", async () => {
    const event = makeEvent({ status: "scheduled" });
    const onClose = vi.fn();
    const onSaved = vi.fn();

    render(
      <AdminJamConfigDialog
        event={event}
        projects={mockProjects}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    const cooldownInput = screen.getByPlaceholderText("5") as HTMLInputElement;
    fireEvent.change(cooldownInput, { target: { value: "5000" } });

    fireEvent.click(screen.getByText("Lưu thay đổi"));

    expect(
      await screen.findByText(
        "Thời gian chờ cooldown không hợp lệ. Giá trị phải từ 1 đến 3600 giây.",
      ),
    ).toBeDefined();
    expect(apiJam.adminConfigureJamEvent).not.toHaveBeenCalled();
  });

  it("submits valid configuration updates and triggers onSaved callback", async () => {
    const event = makeEvent({ status: "scheduled" });
    const onClose = vi.fn();
    const onSaved = vi.fn();

    vi.mocked(apiJam.adminConfigureJamEvent).mockResolvedValueOnce({
      ...event,
      name: "Renamed Jam",
    });

    render(
      <AdminJamConfigDialog
        event={event}
        projects={mockProjects}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    const nameInput = screen.getByPlaceholderText(
      "Nhập tên sự kiện Jam...",
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Renamed Jam" } });

    fireEvent.click(screen.getByText("Lưu thay đổi"));

    await vi.waitFor(() => {
      expect(apiJam.adminConfigureJamEvent).toHaveBeenCalledWith(
        event.id,
        expect.objectContaining({
          name: "Renamed Jam",
        }),
      );
      expect(onSaved).toHaveBeenCalledWith(
        "Cập nhật cấu hình sự kiện Jam thành công.",
      );
      expect(onClose).toHaveBeenCalled();
    });
  });
});
