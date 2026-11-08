import { describe, expect, it } from "vitest";
import { PLATFORM_SETTING_CATALOG } from "@stave/shared-types";
import type { SettingDef } from "@stave/shared-types";
import { displayRange, formatMb, isDirty, parseFieldDraft, toFieldDraft, unitLabelKey } from "./settings-form";

const MB = 1024 * 1024;

function def(key: string): SettingDef {
  const found = PLATFORM_SETTING_CATALOG.find((d) => d.key === key);
  if (!found) throw new Error(key);
  return found;
}

const QUOTA = def("custom_sound_quota_bytes");
const DAYS = def("moderation_retention_days");
const SWITCH = def("registration_enabled");

describe("toFieldDraft", () => {
  it("hạn mức hiện theo MB: 52428800 → 50", () => {
    expect(toFieldDraft(QUOTA, 50 * MB)).toBe("50");
    expect(toFieldDraft(QUOTA, 5 * MB)).toBe("5");
    expect(toFieldDraft(QUOTA, 1024 * MB)).toBe("1024");
  });

  it("byte không chia hết cho MB hiện tối đa 2 chữ số thập phân", () => {
    expect(toFieldDraft(QUOTA, MB * 1.25)).toBe("1.25");
    expect(toFieldDraft(QUOTA, 50 * MB + 1)).toBe("50");
  });

  it("khoá số khác hiện nguyên giá trị, boolean giữ boolean", () => {
    expect(toFieldDraft(DAYS, 30)).toBe("30");
    expect(toFieldDraft(SWITCH, false)).toBe(false);
  });
});

describe("parseFieldDraft", () => {
  it("MB nguyên → byte", () => {
    expect(parseFieldDraft(QUOTA, "50")).toEqual({ ok: true, value: 50 * MB });
    expect(parseFieldDraft(QUOTA, " 5 ")).toEqual({ ok: true, value: 5 * MB });
    expect(parseFieldDraft(QUOTA, "1024")).toEqual({ ok: true, value: 1024 * MB });
  });

  it("MB dưới 5 hoặc trên 1024 → ngoài phạm vi, kèm phạm vi", () => {
    for (const text of ["4", "1025", "0"]) {
      const result = parseFieldDraft(QUOTA, text);
      expect(result).toMatchObject({ ok: false, code: "out_of_range" });
    }
  });

  it.each(["", "  ", "abc", "7.5", "7,5", "-3", "1e3", "٣", "99999999999999999999"])("chỉ nhận số nguyên: %j bị từ chối", (text) => {
    const result = parseFieldDraft(DAYS, text);
    expect(result).toMatchObject({ ok: false, code: "not_integer" });
  });

  it("MB lẻ bị từ chối (ô hạn mức chỉ nhận MB nguyên)", () => {
    expect(parseFieldDraft(QUOTA, "5.5")).toMatchObject({ ok: false, code: "not_integer" });
  });

  it("khoá số trong phạm vi và biên", () => {
    expect(parseFieldDraft(DAYS, "7")).toEqual({ ok: true, value: 7 });
    expect(parseFieldDraft(DAYS, "365")).toEqual({ ok: true, value: 365 });
    expect(parseFieldDraft(DAYS, "6")).toMatchObject({ ok: false, code: "out_of_range" });
    expect(parseFieldDraft(DAYS, "366")).toMatchObject({ ok: false, code: "out_of_range" });
  });

  it("boolean", () => {
    expect(parseFieldDraft(SWITCH, true)).toEqual({ ok: true, value: true });
    expect(parseFieldDraft(SWITCH, "true")).toMatchObject({ ok: false, code: "not_boolean" });
  });
});

describe("isDirty", () => {
  it("số: so với chữ đang hiện của giá trị đã lưu, bỏ khoảng trắng", () => {
    expect(isDirty(DAYS, "30", 30)).toBe(false);
    expect(isDirty(DAYS, " 30 ", 30)).toBe(false);
    expect(isDirty(DAYS, "31", 30)).toBe(true);
    expect(isDirty(DAYS, "", 30)).toBe(true);
  });

  it("hạn mức đã lưu không chia hết MB: không coi là đổi nếu chưa sửa", () => {
    expect(isDirty(QUOTA, "1.25", MB * 1.25)).toBe(false);
    expect(isDirty(QUOTA, "2", MB * 1.25)).toBe(true);
  });

  it("boolean", () => {
    expect(isDirty(SWITCH, true, true)).toBe(false);
    expect(isDirty(SWITCH, false, true)).toBe(true);
  });
});

describe("displayRange / formatMb / unitLabelKey", () => {
  it("phạm vi hạn mức hiện theo MB", () => {
    expect(displayRange(QUOTA)).toEqual({ min: 5, max: 1024 });
  });

  it("phạm vi khác giữ nguyên", () => {
    expect(displayRange(DAYS)).toEqual({ min: 7, max: 365 });
  });

  it("formatMb làm tròn lên 2 chữ số để không báo thấp hơn thực tế", () => {
    expect(formatMb(30 * MB)).toBe("30");
    expect(formatMb(30 * MB + 1)).toBe("30.01");
    expect(formatMb(0)).toBe("0");
  });

  it("nhãn đơn vị", () => {
    expect(unitLabelKey(QUOTA)).toBe("aps.unit.mb");
    expect(unitLabelKey(DAYS)).toBe("aps.unit.days");
    expect(unitLabelKey(def("jam_edit_cooldown_sec"))).toBe("aps.unit.seconds");
  });
});
