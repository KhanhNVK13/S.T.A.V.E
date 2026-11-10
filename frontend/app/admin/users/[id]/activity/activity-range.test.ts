import { describe, expect, it } from "vitest";
import { computeActivityRange } from "./activity-range";
import { pinTimeZone } from "../../../../../lib/test-helpers/time-zone";

const NOW = new Date("2026-11-06T10:00:00.000Z");
const DAY_MS = 86_400_000;

describe("computeActivityRange — múi giờ ghim cố định trong test", () => {
  describe("Asia/Ho_Chi_Minh (UTC+7)", () => {
    pinTimeZone("Asia/Ho_Chi_Minh");

    it("đổi ngày địa phương UTC+7 thành instant ISO đầy đủ (đầu ngày và cuối ngày)", () => {
      expect(computeActivityRange({ from: "2026-10-01", to: "2026-10-31" }, NOW)).toEqual({
        from: "2026-09-30T17:00:00.000Z",
        to: "2026-10-31T16:59:59.999Z",
      });
    });

    it("chỉ chọn from: to là thời điểm gọi", () => {
      const range = computeActivityRange({ from: "2026-11-01", to: "" }, NOW);
      expect(range?.from).toBe("2026-10-31T17:00:00.000Z");
      expect(range?.to).toBe(NOW.toISOString());
    });
  });

  describe("America/Los_Angeles (UTC-7 mùa hè)", () => {
    pinTimeZone("America/Los_Angeles");

    it("đổi ngày địa phương thành instant ISO đúng", () => {
      expect(computeActivityRange({ from: "2026-10-01", to: "2026-10-31" }, NOW)).toEqual({
        from: "2026-10-01T07:00:00.000Z",
        to: "2026-11-01T06:59:59.999Z",
      });
    });
  });

  describe("UTC", () => {
    pinTimeZone("UTC");

    it("đầu ngày và cuối ngày trùng ngày UTC", () => {
      expect(computeActivityRange({ from: "2026-10-01", to: "2026-10-31" }, NOW)).toEqual({
        from: "2026-10-01T00:00:00.000Z",
        to: "2026-10-31T23:59:59.999Z",
      });
    });
  });
});

describe("computeActivityRange", () => {
  it("không phụ thuộc múi giờ máy: bằng đầu/cuối ngày địa phương", () => {
    const range = computeActivityRange({ from: "2026-03-08", to: "2026-03-09" }, NOW);
    expect(range?.from).toBe(new Date(2026, 2, 8, 0, 0, 0, 0).toISOString());
    expect(range?.to).toBe(new Date(2026, 2, 9, 23, 59, 59, 999).toISOString());
  });

  it("không chọn ngày: 30 ngày gần nhất tính từ thời điểm gọi, cả hai đầu đều có", () => {
    const range = computeActivityRange({ from: "", to: "" }, NOW);
    expect(range).toEqual({
      from: new Date(NOW.getTime() - 30 * DAY_MS).toISOString(),
      to: NOW.toISOString(),
    });
  });

  it("chỉ chọn from: to là thời điểm gọi", () => {
    const range = computeActivityRange({ from: "2026-11-01", to: "" }, NOW);
    expect(range?.from).toBe(new Date(2026, 10, 1, 0, 0, 0, 0).toISOString());
    expect(range?.to).toBe(NOW.toISOString());
  });

  it("chỉ chọn to: from lùi 30 ngày từ cuối ngày đó", () => {
    const range = computeActivityRange({ from: "", to: "2026-10-31" }, NOW);
    const to = new Date(2026, 9, 31, 23, 59, 59, 999);
    expect(range).toEqual({
      from: new Date(to.getTime() - 30 * DAY_MS).toISOString(),
      to: to.toISOString(),
    });
  });

  it("cùng một ngày là hợp lệ", () => {
    const range = computeActivityRange({ from: "2026-10-05", to: "2026-10-05" }, NOW);
    expect(range).not.toBeNull();
    expect(new Date(range!.from).getTime()).toBeLessThan(new Date(range!.to).getTime());
  });

  it("from sau to là không hợp lệ", () => {
    expect(computeActivityRange({ from: "2026-10-31", to: "2026-10-01" }, NOW)).toBeNull();
  });

  it("ngày không có thật là không hợp lệ", () => {
    expect(computeActivityRange({ from: "2026-02-30", to: "" }, NOW)).toBeNull();
    expect(computeActivityRange({ from: "abc", to: "" }, NOW)).toBeNull();
  });

  it("from nằm sau thời điểm gọi và không có to là không hợp lệ", () => {
    expect(computeActivityRange({ from: "2027-01-01", to: "" }, NOW)).toBeNull();
  });
});
