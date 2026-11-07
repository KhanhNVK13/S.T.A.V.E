import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("./api-client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import { getUserActivity } from "./admin-activity-api";

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockResolvedValue({ items: [], nextCursor: null });
});

describe("getUserActivity", () => {
  it("gọi đúng đường dẫn không query khi không có bộ lọc", async () => {
    await getUserActivity("u-1");
    expect(apiFetch).toHaveBeenCalledWith("/admin/users/u-1/activity", { signal: undefined });
  });

  it("đưa bộ lọc và con trỏ vào query string đã mã hoá", async () => {
    await getUserActivity("u-1", {
      from: "2026-10-01",
      to: "2026-10-31",
      type: "signin",
      limit: 25,
      cursor: "abc_-123",
    });
    const [path] = apiFetch.mock.calls[0] as [string];
    const url = new URL(path, "http://x");
    expect(url.pathname).toBe("/admin/users/u-1/activity");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
      type: "signin",
      limit: "25",
      cursor: "abc_-123",
    });
  });

  it("bỏ qua giá trị rỗng và con trỏ null", async () => {
    await getUserActivity("u-1", { from: "", cursor: null });
    expect(apiFetch).toHaveBeenCalledWith("/admin/users/u-1/activity", { signal: undefined });
  });

  it("mã hoá id người dùng trong đường dẫn", async () => {
    await getUserActivity("a/b");
    expect((apiFetch.mock.calls[0] as [string])[0]).toBe("/admin/users/a%2Fb/activity");
  });

  it("chuyển signal để huỷ yêu cầu", async () => {
    const controller = new AbortController();
    await getUserActivity("u-1", {}, controller.signal);
    expect(apiFetch).toHaveBeenCalledWith("/admin/users/u-1/activity", { signal: controller.signal });
  });
});
