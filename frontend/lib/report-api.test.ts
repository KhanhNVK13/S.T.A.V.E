import { afterEach, describe, expect, it, vi } from "vitest";
import { reportProject } from "./report-api";
import { apiFetch } from "./api-client";

vi.mock("./api-client", () => ({ apiFetch: vi.fn() }));

afterEach(() => vi.clearAllMocks());

describe("reportProject", () => {
  it("POST tới /projects/:id/reports với đúng body", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: "r1" });
    await expect(reportProject("p1", { reason: "spam", details: "x" })).resolves.toEqual({ id: "r1" });
    expect(apiFetch).toHaveBeenCalledWith("/projects/p1/reports", {
      method: "POST",
      body: JSON.stringify({ reason: "spam", details: "x" }),
    });
  });

  it("không gửi details khi không có", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: "r1" });
    await reportProject("p1", { reason: "other" });
    expect(vi.mocked(apiFetch).mock.calls[0][1]?.body).toBe(JSON.stringify({ reason: "other" }));
  });

  it("mã hoá id trong đường dẫn", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: "r1" });
    await reportProject("a/b", { reason: "other" });
    expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe("/projects/a%2Fb/reports");
  });

  it("để lỗi của apiFetch đi tiếp cho hộp thoại xử lý", async () => {
    const failure = new Error("boom");
    vi.mocked(apiFetch).mockRejectedValue(failure);
    await expect(reportProject("p1", { reason: "spam" })).rejects.toBe(failure);
  });
});
