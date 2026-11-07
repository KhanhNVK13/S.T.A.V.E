import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AdminUsersPage from "./page";
import { apiFetch } from "@/lib/api-client";
import { setLang } from "@/lib/i18n";

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: vi.fn() };
});

const USER_A = "22222222-2222-4222-8222-222222222222";
const ADMIN_B = "33333333-3333-4333-8333-333333333333";

function user(id: string, role: "user" | "admin", name: string) {
  return {
    id,
    displayName: name,
    username: name.toLowerCase(),
    maskedEmail: "a***@example.com",
    status: "active",
    role,
    createdAt: "2026-10-01T00:00:00.000Z",
    projectCount: 2,
    suspension: null,
  };
}

beforeEach(() => {
  setLang("vi");
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({
    total: 2,
    page: 1,
    limit: 20,
    users: [user(USER_A, "user", "Alice"), user(ADMIN_B, "admin", "Boss")],
  });
});

afterEach(() => {
  cleanup();
});

describe("AdminUsersPage — liên kết Xem hoạt động", () => {
  it("mỗi dòng người dùng có liên kết trỏ đúng /admin/users/<id>/activity", async () => {
    render(<AdminUsersPage />);

    const links = await screen.findAllByRole("link", { name: "Xem hoạt động" });

    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      `/admin/users/${USER_A}/activity`,
      `/admin/users/${ADMIN_B}/activity`,
    ]);
  });

  it("liên kết có cả ở dòng tài khoản admin", async () => {
    render(<AdminUsersPage />);

    const links = await screen.findAllByRole("link", { name: "Xem hoạt động" });

    expect(links).toHaveLength(2);
    expect(links[1].getAttribute("href")).toContain(ADMIN_B);
  });

  it("nhãn đổi theo ngôn ngữ", async () => {
    setLang("en");
    render(<AdminUsersPage />);

    expect(await screen.findAllByRole("link", { name: "View activity" })).toHaveLength(2);
  });
});
