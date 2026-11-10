import { describe, expect, it } from "vitest";
import { formatOccurredAt, parseOccurredAt } from "./format-occurred-at";

describe("parseOccurredAt", () => {
  it("cắt phần thập phân 6 chữ số về 3 chữ số, dạng +00:00", () => {
    expect(parseOccurredAt("2026-11-01T10:00:00.123456+00:00")?.getTime()).toBe(
      new Date("2026-11-01T10:00:00.123Z").getTime(),
    );
  });

  it("dạng Z với 6 chữ số", () => {
    expect(parseOccurredAt("2026-11-01T10:00:00.123456Z")?.getTime()).toBe(
      new Date("2026-11-01T10:00:00.123Z").getTime(),
    );
  });

  it("dạng +07:00 với 6 chữ số", () => {
    expect(parseOccurredAt("2026-11-01T10:00:00.123456+07:00")?.getTime()).toBe(
      new Date("2026-11-01T10:00:00.123+07:00").getTime(),
    );
  });

  it("cắt chứ không làm tròn", () => {
    expect(parseOccurredAt("2026-11-01T10:00:00.999999Z")?.getTime()).toBe(
      new Date("2026-11-01T10:00:00.999Z").getTime(),
    );
  });

  it.each(["2026-11-01T10:00:00Z", "2026-11-01T10:00:00.5Z", "2026-11-01T10:00:00.12Z", "2026-11-01T10:00:00.123Z"])(
    "giữ nguyên dạng ngắn hơn hoặc bằng 3 chữ số %p",
    (value) => {
      expect(parseOccurredAt(value)?.getTime()).toBe(new Date(value).getTime());
    },
  );

  it.each(["", "rác", "2026-13-45T99:99:99Z", "hôm qua"])("trả null khi không parse được %p", (value) => {
    expect(parseOccurredAt(value)).toBeNull();
  });
});

describe("formatOccurredAt", () => {
  it("định dạng theo locale của người xem", () => {
    const iso = "2026-11-01T10:00:00.123456+00:00";
    const date = new Date("2026-11-01T10:00:00.123Z");
    expect(formatOccurredAt(iso, "vi-VN")).toBe(date.toLocaleString("vi-VN"));
    expect(formatOccurredAt(iso, "en-US")).toBe(date.toLocaleString("en-US"));
  });

  it("không parse được thì hiện chuỗi gốc, không bao giờ hiện Invalid Date", () => {
    expect(formatOccurredAt("rác", "vi-VN")).toBe("rác");
    expect(formatOccurredAt("2026-13-45T99:99:99Z", "vi-VN")).toBe("2026-13-45T99:99:99Z");
    expect(formatOccurredAt("", "vi-VN")).toBe("");
    expect(formatOccurredAt("rác", "vi-VN")).not.toContain("Invalid");
  });
});
