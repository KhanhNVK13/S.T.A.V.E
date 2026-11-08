import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PLATFORM_SETTING_CATALOG } from "@stave/shared-types";
import type { PlatformSettingsResponse, SettingGroup, SettingValue } from "@stave/shared-types";
import AdminSettingsPage from "./page";
import { ApiError } from "@/lib/api-client";
import { getPlatformSettings, updatePlatformSettings } from "@/lib/admin-settings-api";
import { setLang } from "@/lib/i18n";

vi.mock("@/lib/admin-settings-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin-settings-api")>();
  return { ...actual, getPlatformSettings: vi.fn(), updatePlatformSettings: vi.fn() };
});

const getSettings = vi.mocked(getPlatformSettings);
const putSettings = vi.mocked(updatePlatformSettings);
const MB = 1024 * 1024;

function payload(overrides: Record<string, SettingValue> = {}): PlatformSettingsResponse {
  const groups: PlatformSettingsResponse["groups"] = [];
  for (const def of PLATFORM_SETTING_CATALOG) {
    const value = overrides[def.key] ?? def.default;
    let group = groups.find((g) => g.group === def.group);
    if (!group) {
      group = { group: def.group as SettingGroup, items: [] };
      groups.push(group);
    }
    group.items.push({ ...def, value });
  }
  return { groups };
}

function input(name: string): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!el) throw new Error(`no input ${name}`);
  return el;
}

async function renderReady(overrides: Record<string, SettingValue> = {}) {
  getSettings.mockResolvedValue(payload(overrides));
  render(<AdminSettingsPage />);
  await screen.findByRole("heading", { name: "Giới hạn" });
}

function saveButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: /^(Lưu|Đang lưu…)$/ });
}

function cancelButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "Huỷ" });
}

function type(name: string, value: string) {
  fireEvent.change(input(name), { target: { value } });
}

beforeEach(() => {
  setLang("vi");
  getSettings.mockReset();
  putSettings.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("AdminSettingsPage — dựng form", () => {
  it("dựng từ danh mục: bốn nhóm, năm điều khiển, hạn mức hiện theo MB", async () => {
    await renderReady();

    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Giới hạn",
      "Sự kiện cộng đồng",
      "Đăng ký",
      "Lưu trữ",
    ]);
    expect(input("custom_sound_quota_bytes").value).toBe("50");
    expect(input("price_change_notice_days").value).toBe("7");
    expect(input("jam_edit_cooldown_sec").value).toBe("5");
    expect(input("moderation_retention_days").value).toBe("30");
    const toggle = screen.getByRole("switch", { name: "Cho phép đăng ký tài khoản mới" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("hạn mức đã lưu khác mặc định hiện đúng MB", async () => {
    await renderReady({ custom_sound_quota_bytes: 20 * MB });
    expect(input("custom_sound_quota_bytes").value).toBe("20");
  });

  it("chữ theo từ điển: đổi sang tiếng Anh", async () => {
    setLang("en");
    getSettings.mockResolvedValue(payload());
    render(<AdminSettingsPage />);
    await screen.findByRole("heading", { name: "Limits" });
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("không dùng thuộc tính kiểm tra của HTML (min/max/minLength) để tránh câu tiếng Anh của trình trình duyệt", async () => {
    await renderReady();
    for (const el of document.querySelectorAll("input")) {
      expect(el.hasAttribute("min")).toBe(false);
      expect(el.hasAttribute("max")).toBe(false);
      expect(el.hasAttribute("minlength")).toBe(false);
    }
    expect(document.querySelector("form")?.hasAttribute("novalidate")).toBe(true);
  });
});

describe("AdminSettingsPage — Lưu và Huỷ", () => {
  it("Lưu và Huỷ bị vô hiệu khi chưa đổi, bật khi có thay đổi", async () => {
    await renderReady();
    expect(saveButton().disabled).toBe(true);
    expect(cancelButton().disabled).toBe(true);

    type("price_change_notice_days", "14");

    expect(saveButton().disabled).toBe(false);
    expect(cancelButton().disabled).toBe(false);
  });

  it("gõ lại đúng giá trị đang lưu thì coi như chưa đổi", async () => {
    await renderReady();
    type("price_change_notice_days", "14");
    type("price_change_notice_days", "7");
    expect(saveButton().disabled).toBe(true);
  });

  it("Huỷ khôi phục giá trị đang lưu, gồm cả công tắc", async () => {
    await renderReady();
    type("moderation_retention_days", "90");
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");

    fireEvent.click(cancelButton());

    expect(input("moderation_retention_days").value).toBe("30");
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
    expect(putSettings).not.toHaveBeenCalled();
  });

  it("lưu: chỉ gửi khoá đã đổi, hạn mức đổi MB → byte, rồi tải lại giá trị thật", async () => {
    await renderReady();
    putSettings.mockResolvedValue({ updated: ["price_change_notice_days", "registration_enabled"] });
    getSettings.mockResolvedValue(payload({ price_change_notice_days: 14, registration_enabled: false }));

    type("price_change_notice_days", "14");
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(saveButton());

    await screen.findByText("Đã lưu cài đặt.");
    expect(putSettings).toHaveBeenCalledTimes(1);
    expect(putSettings.mock.calls[0][0]).toEqual({
      changes: [
        { key: "price_change_notice_days", value: 14 },
        { key: "registration_enabled", value: false },
      ],
    });
    expect(getSettings).toHaveBeenCalledTimes(2);
    expect(input("price_change_notice_days").value).toBe("14");
    expect(saveButton().disabled).toBe(true);
  });

  it("đổi hạn mức tăng: gửi byte đúng (80 MB)", async () => {
    await renderReady();
    putSettings.mockResolvedValue({ updated: ["custom_sound_quota_bytes"] });

    type("custom_sound_quota_bytes", "80");
    fireEvent.click(saveButton());

    await waitFor(() => expect(putSettings).toHaveBeenCalled());
    expect(putSettings.mock.calls[0][0]).toEqual({
      changes: [{ key: "custom_sound_quota_bytes", value: 80 * MB }],
    });
  });
});

describe("AdminSettingsPage — kiểm tra phía giao diện", () => {
  it("giá trị ngoài phạm vi: hiện lỗi đúng ô, nêu phạm vi, không gọi API", async () => {
    await renderReady();

    type("moderation_retention_days", "3");
    fireEvent.click(saveButton());

    const alert = await screen.findByText("Giá trị phải từ 7 đến 365 ngày.");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(input("moderation_retention_days").getAttribute("aria-invalid")).toBe("true");
    expect(input("price_change_notice_days").getAttribute("aria-invalid")).toBeNull();
    expect(putSettings).not.toHaveBeenCalled();
  });

  it("không phải số nguyên (7,5 hoặc chữ) bị chặn với câu nêu phạm vi", async () => {
    await renderReady();

    type("jam_edit_cooldown_sec", "7,5");
    fireEvent.click(saveButton());

    await screen.findByText("Nhập số nguyên từ 1 đến 3600 giây.");
    expect(putSettings).not.toHaveBeenCalled();
  });

  it("hạn mức chỉ nhận MB nguyên: 5.5 bị chặn, phạm vi hiện theo MB", async () => {
    await renderReady();

    type("custom_sound_quota_bytes", "5.5");
    fireEvent.click(saveButton());

    await screen.findByText("Nhập số nguyên từ 5 đến 1024 MB.");
    expect(putSettings).not.toHaveBeenCalled();
  });

  it("sửa ô lỗi thì lỗi của ô đó biến mất", async () => {
    await renderReady();
    type("moderation_retention_days", "3");
    fireEvent.click(saveButton());
    await screen.findByText("Giá trị phải từ 7 đến 365 ngày.");

    type("moderation_retention_days", "40");

    expect(screen.queryByText("Giá trị phải từ 7 đến 365 ngày.")).toBeNull();
  });

  it("gợi ý phạm vi luôn hiện dưới ô nhập", async () => {
    await renderReady();
    expect(screen.getByText("Cho phép: từ 5 đến 1024 MB")).toBeTruthy();
    expect(screen.getByText("Cho phép: từ 1 đến 60 ngày")).toBeTruthy();
  });
});

describe("AdminSettingsPage — lỗi từ máy chủ", () => {
  it("400 theo khoá: hiện inline dưới đúng ô, giữ chữ đã gõ để sửa, không tải lại", async () => {
    await renderReady();
    putSettings.mockRejectedValue(
      new ApiError(400, "Invalid platform settings", {
        errors: [{ key: "jam_edit_cooldown_sec", code: "out_of_range", params: { min: 1, max: 3600, unit: "seconds" } }],
      }),
    );

    type("jam_edit_cooldown_sec", "10");
    fireEvent.click(saveButton());

    await screen.findByText("Giá trị phải từ 1 đến 3600 giây.");
    expect(input("jam_edit_cooldown_sec").getAttribute("aria-invalid")).toBe("true");
    expect(input("jam_edit_cooldown_sec").value).toBe("10");
    expect(getSettings).toHaveBeenCalledTimes(1);
  });

  it("lỗi lưu (500): tải lại từ máy chủ, ô hiện giá trị thật chứ không phải chữ vừa gõ, có role=alert", async () => {
    await renderReady();
    putSettings.mockRejectedValue(new ApiError(500, "Could not save platform settings", {}));

    type("price_change_notice_days", "21");
    fireEvent.click(saveButton());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Không lưu được cài đặt");
    await waitFor(() => expect(input("price_change_notice_days").value).toBe("7"));
    expect(getSettings).toHaveBeenCalledTimes(2);
    expect(saveButton().disabled).toBe(true);
  });

  it("lỗi mạng khi lưu cũng tải lại giá trị thật", async () => {
    await renderReady();
    putSettings.mockRejectedValue(new TypeError("Failed to fetch"));

    type("moderation_retention_days", "100");
    fireEvent.click(saveButton());

    await waitFor(() => expect(input("moderation_retention_days").value).toBe("30"));
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("lỗi lưu rồi tải lại cũng lỗi: không giữ form, hiện lỗi tải kèm Thử lại", async () => {
    await renderReady();
    putSettings.mockRejectedValue(new ApiError(500, "x", {}));
    getSettings.mockRejectedValue(new Error("down"));

    type("price_change_notice_days", "21");
    fireEvent.click(saveButton());

    await screen.findByText("Không tải được cài đặt nền tảng.");
    expect(document.querySelector("input")).toBeNull();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeTruthy();
  });
});

describe("AdminSettingsPage — giảm hạn mức (409)", () => {
  async function triggerReduction() {
    await renderReady();
    putSettings.mockRejectedValueOnce(
      new ApiError(409, "Quota reduction requires confirmation", {
        requiresConfirmation: true,
        maxUsageBytes: 30 * MB,
      }),
    );
    type("custom_sound_quota_bytes", "10");
    fireEvent.click(saveButton());
    return screen.findByRole("alertdialog");
  }

  it("409 mở hộp xác nhận với đúng câu và mức dùng lớn nhất", async () => {
    const dialog = await triggerReduction();

    const text = dialog.textContent ?? "";
    expect(text).toContain("Dự án và âm thanh hiện có vẫn hoạt động bình thường, giới hạn chỉ áp dụng cho nội dung mới.");
    expect(text).toContain("30 MB");
    expect(text).toContain("10 MB");
    expect(putSettings).toHaveBeenCalledTimes(1);
  });

  it("xác nhận thì gửi lại đúng payload kèm confirmReduction: true", async () => {
    const dialog = await triggerReduction();
    putSettings.mockResolvedValueOnce({ updated: ["custom_sound_quota_bytes"] });
    getSettings.mockResolvedValue(payload({ custom_sound_quota_bytes: 10 * MB }));

    fireEvent.click(within(dialog).getByRole("button", { name: "Hạ giới hạn" }));

    await waitFor(() => expect(putSettings).toHaveBeenCalledTimes(2));
    expect(putSettings.mock.calls[1][0]).toEqual({
      changes: [{ key: "custom_sound_quota_bytes", value: 10 * MB }],
      confirmReduction: true,
    });
    await screen.findByText("Đã lưu cài đặt.");
    expect(input("custom_sound_quota_bytes").value).toBe("10");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("huỷ hộp xác nhận thì không gửi lại và giữ chữ đã gõ", async () => {
    const dialog = await triggerReduction();

    fireEvent.click(within(dialog).getByRole("button", { name: "Huỷ" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(putSettings).toHaveBeenCalledTimes(1);
    expect(input("custom_sound_quota_bytes").value).toBe("10");
  });

  it("xác nhận nhưng lưu lỗi: đóng hộp, hiện lỗi, tải lại giá trị thật", async () => {
    const dialog = await triggerReduction();
    putSettings.mockRejectedValueOnce(new ApiError(500, "x", {}));

    fireEvent.click(within(dialog).getByRole("button", { name: "Hạ giới hạn" }));

    await screen.findByRole("alert");
    await waitFor(() => expect(input("custom_sound_quota_bytes").value).toBe("50"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("AdminSettingsPage — tải trang", () => {
  it("lỗi tải: role=alert, có Thử lại, không giả làm form rỗng", async () => {
    getSettings.mockRejectedValueOnce(new Error("down"));
    render(<AdminSettingsPage />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Không tải được cài đặt nền tảng.");
    expect(document.querySelector("input")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();

    getSettings.mockResolvedValueOnce(payload());
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    await screen.findByRole("heading", { name: "Giới hạn" });
    expect(input("price_change_notice_days").value).toBe("7");
  });

  it("đang tải hiện trạng thái chờ, chưa có form", () => {
    getSettings.mockReturnValue(new Promise(() => {}));
    render(<AdminSettingsPage />);
    expect(screen.getByRole("status").textContent).toBe("Đang tải…");
    expect(document.querySelector("form")).toBeNull();
  });

  it("gỡ trang khi đang tải không gây lỗi và huỷ yêu cầu", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let resolve: (value: PlatformSettingsResponse) => void = () => {};
    let signal: AbortSignal | undefined;
    getSettings.mockImplementation((s) => {
      signal = s;
      return new Promise((r) => {
        resolve = r;
      });
    });

    const { unmount } = render(<AdminSettingsPage />);
    unmount();
    resolve(payload());
    await Promise.resolve();

    expect(signal?.aborted).toBe(true);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
