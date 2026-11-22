import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TERMS_VERSION } from "@stave/shared-types";
import { setLang } from "../lib/i18n";
import { I18nProvider } from "../context/i18n-context";
import * as api from "../lib/api-client";
import { TermsGate } from "./terms-gate";

let authUser: { id: string } | null = null;
let authProfile: { terms_accepted_version?: string | null } | null = null;
let pathname = "/projects";
const refreshProfile = vi.fn();
const signOut = vi.fn();
const replace = vi.fn();

vi.mock("../context/auth-context", () => ({
  useAuth: () => ({ user: authUser, profile: authProfile, refreshProfile, signOut }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace }),
}));
vi.mock("../lib/api-client", () => ({ acceptTerms: vi.fn() }));

const accept = vi.mocked(api.acceptTerms);

function mount() {
  return render(
    <I18nProvider>
      <TermsGate />
    </I18nProvider>,
  );
}

beforeEach(() => {
  authUser = { id: "u1" };
  authProfile = { terms_accepted_version: null };
  pathname = "/projects";
  refreshProfile.mockReset().mockResolvedValue(undefined);
  signOut.mockReset().mockResolvedValue(undefined);
  replace.mockReset();
  accept.mockReset().mockResolvedValue(undefined);
  setLang("en");
});

afterEach(cleanup);

describe("TermsGate", () => {
  it("không hiện khi chưa đăng nhập hoặc hồ sơ chưa tải xong", () => {
    authUser = null;
    mount();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    cleanup();
    authUser = { id: "u1" };
    authProfile = null;
    mount();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("không hiện khi đã đồng ý phiên bản hiện hành hoặc là tài khoản cũ", () => {
    authProfile = { terms_accepted_version: TERMS_VERSION };
    mount();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    cleanup();
    authProfile = { terms_accepted_version: "pre-terms" };
    mount();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("hiện lại khi người dùng mới đồng ý một phiên bản cũ hơn", () => {
    authProfile = { terms_accepted_version: "2020-01-01" };
    mount();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("không che trang /terms để người dùng đọc được điều khoản", () => {
    pathname = "/terms";
    mount();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("hiện cho tài khoản mới và không đóng được bằng Esc", () => {
    mount();
    expect(screen.getByRole("alertdialog", { name: "Terms of Use" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("nút Đồng ý chỉ bật sau khi tick, rồi lưu phiên bản hiện hành và tải lại hồ sơ", async () => {
    mount();
    const button = screen.getByRole("button", { name: "Accept and continue" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(refreshProfile).toHaveBeenCalledTimes(1));
    expect(accept).toHaveBeenCalledWith(TERMS_VERSION);
  });

  it("lưu lỗi thì báo trong hộp và cho thử lại", async () => {
    accept.mockRejectedValue(new Error("boom"));
    mount();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Accept and continue" }));
    await screen.findByText("Could not save your answer. Try again.");
    expect(refreshProfile).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Accept and continue" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("Không đồng ý thì đăng xuất và về trang chủ", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Decline and sign out" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith("/");
    expect(accept).not.toHaveBeenCalled();
  });

  it("đổi sang tiếng Việt thì nhãn đổi theo", () => {
    setLang("vi");
    mount();
    expect(screen.getByRole("alertdialog", { name: "Điều khoản sử dụng" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Đồng ý và tiếp tục" })).toBeTruthy();
  });
});
