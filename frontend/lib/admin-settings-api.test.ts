import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "./api-client";
import { getPlatformSettings, readReductionRequired, readValidationErrors, updatePlatformSettings } from "./admin-settings-api";

vi.mock("./api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api-client")>();
  return { ...actual, apiFetch: vi.fn() };
});

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("admin-settings-api", () => {
  it("getPlatformSettings gọi GET /admin/settings", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ groups: [] });
    const controller = new AbortController();

    await expect(getPlatformSettings(controller.signal)).resolves.toEqual({ groups: [] });

    expect(apiFetch).toHaveBeenCalledWith("/admin/settings", { signal: controller.signal });
  });

  it("updatePlatformSettings gửi PUT với body JSON đúng", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ updated: ["registration_enabled"] });

    await updatePlatformSettings({
      changes: [{ key: "registration_enabled", value: false }],
      confirmReduction: true,
    });

    const [path, init] = vi.mocked(apiFetch).mock.calls[0];
    expect(path).toBe("/admin/settings");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(init?.body as string)).toEqual({
      changes: [{ key: "registration_enabled", value: false }],
      confirmReduction: true,
    });
  });
});

describe("readReductionRequired", () => {
  it("nhận 409 có requiresConfirmation", () => {
    const err = new ApiError(409, "x", { requiresConfirmation: true, maxUsageBytes: 123 });
    expect(readReductionRequired(err)).toEqual({ requiresConfirmation: true, maxUsageBytes: 123 });
  });

  it("bỏ qua 409 khác, status khác, lỗi không phải ApiError, body thiếu số", () => {
    expect(readReductionRequired(new ApiError(409, "x", { message: "Draft was changed elsewhere" }))).toBeNull();
    expect(readReductionRequired(new ApiError(500, "x", { requiresConfirmation: true, maxUsageBytes: 1 }))).toBeNull();
    expect(readReductionRequired(new Error("x"))).toBeNull();
    expect(readReductionRequired(new ApiError(409, "x", { requiresConfirmation: true, maxUsageBytes: "abc" }))).toBeNull();
    expect(readReductionRequired(new ApiError(409, "x"))).toBeNull();
  });
});

describe("readValidationErrors", () => {
  it("nhận 400 có danh sách lỗi theo khoá", () => {
    const errors = [{ key: "moderation_retention_days", code: "out_of_range", params: { min: 7, max: 365, unit: "days" } }];
    expect(readValidationErrors(new ApiError(400, "x", { errors }))).toEqual(errors);
  });

  it("bỏ qua mục sai hình dạng và trả null khi không còn gì", () => {
    expect(readValidationErrors(new ApiError(400, "x", { errors: [null, 5, { key: 1 }] }))).toBeNull();
    expect(readValidationErrors(new ApiError(400, "x", { message: ["changes must be an array"] }))).toBeNull();
    expect(readValidationErrors(new ApiError(500, "x", { errors: [{ key: "a", code: "b" }] }))).toBeNull();
    expect(readValidationErrors("boom")).toBeNull();
  });
});
