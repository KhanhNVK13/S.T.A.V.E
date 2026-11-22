import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import ResetPasswordPage from "./page";
import { useAuth } from "../../context/auth-context";
import { setLang } from "../../lib/i18n";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("../../context/auth-context", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../lib/supabase-browser", () => ({
  supabase: {
    auth: {
      updateUser: vi.fn(),
    },
  },
}));

const mockedUseAuth = vi.mocked(useAuth);

function authValue(session: Session | null, loading: boolean) {
  return {
    session,
    user: session?.user ?? null,
    profile: null,
    loading,
    refreshProfile: vi.fn(),
    signOut: vi.fn(),
  };
}

beforeEach(() => {
  setLang("vi");
  window.history.replaceState({}, "", "/reset-password");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ResetPasswordPage", () => {
  it("shows invalid-link state and /forgot-password link immediately when opened without a token", async () => {
    mockedUseAuth.mockReturnValue(authValue(null, false));
    render(<ResetPasswordPage />);

    expect(await screen.findByText("Link không hợp lệ hoặc đã hết hạn")).toBeTruthy();
    expect(screen.queryByText("Đang xử lý link…")).toBeNull();
    const link = screen.getByRole("link", { name: "Gửi liên kết mới" });
    expect(link.getAttribute("href")).toBe("/forgot-password");
  });

  it("shows invalid-link state immediately on error hash even while loading or signed in", async () => {
    window.history.replaceState(
      {},
      "",
      "/reset-password#error=access_denied&error_code=otp_expired",
    );
    mockedUseAuth.mockReturnValue(authValue({ access_token: "tok" } as Session, true));
    render(<ResetPasswordPage />);

    expect(await screen.findByText("Link không hợp lệ hoặc đã hết hạn")).toBeTruthy();
    expect(screen.queryByText("Đang xử lý link…")).toBeNull();
    expect(screen.queryByLabelText("Mật khẩu mới")).toBeNull();
  });

  it("shows processing spinner while recovery token awaits session, then renders the password form", async () => {
    window.history.replaceState({}, "", "/reset-password#access_token=abc&type=recovery");
    mockedUseAuth.mockReturnValue(authValue(null, true));
    const { rerender } = render(<ResetPasswordPage />);

    expect(await screen.findByText("Đang xử lý link…")).toBeTruthy();

    mockedUseAuth.mockReturnValue(authValue({ access_token: "abc" } as Session, false));
    rerender(<ResetPasswordPage />);

    expect(await screen.findByRole("button", { name: "Đặt mật khẩu mới" })).toBeTruthy();
  });
});
