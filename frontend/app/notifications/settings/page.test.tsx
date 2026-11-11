import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import NotificationSettingsPage from "./page";
import { getEmailChannelStatus, getNotificationPreferences } from "@/lib/api-client";
import { setLang } from "@/lib/i18n";

vi.mock("@/components/require-auth", () => ({
  RequireAuth: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    getNotificationPreferences: vi.fn(),
    getEmailChannelStatus: vi.fn(),
    setNotificationPreference: vi.fn(),
  };
});

const preferences = vi.mocked(getNotificationPreferences);
const status = vi.mocked(getEmailChannelStatus);

beforeEach(() => {
  setLang("vi");
  preferences.mockResolvedValue([
    {
      type: "fork.created",
      label: "Dự án của bạn được fork",
      category: "Fork",
      mandatory: false,
      channels: { in_app: true, email: true },
    },
  ]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NotificationSettingsPage — kênh email", () => {
  it("không còn nhãn PLACEHOLDER và báo email gửi tới tài khoản khi máy chủ sẵn sàng", async () => {
    status.mockResolvedValue({ ready: true });
    render(<NotificationSettingsPage />);
    expect(await screen.findByText(/Email được gửi tới địa chỉ của tài khoản/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/PLACEHOLDER/);
    expect(screen.queryByText(/chưa bật gửi email/)).toBeNull();
  });

  it("nói rõ email chưa bật khi máy chủ chưa cấu hình SMTP", async () => {
    status.mockResolvedValue({ ready: false });
    render(<NotificationSettingsPage />);
    expect(await screen.findByText(/chưa bật gửi email/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/PLACEHOLDER/);
  });

  it("coi như chưa bật khi không đọc được trạng thái kênh", async () => {
    status.mockRejectedValue(new Error("down"));
    render(<NotificationSettingsPage />);
    expect(await screen.findByText(/chưa bật gửi email/)).toBeTruthy();
  });
});
