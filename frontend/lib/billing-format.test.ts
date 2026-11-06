import { describe, expect, it } from "vitest";
import { formatVnd, isFakePaymentPageEnabled, parseOrderCode } from "./billing-format";

describe("FE-BIL-01 formatVnd", () => {
  it("UTCID01 formats whole đồng amounts in Vietnamese style", () => {
    expect(formatVnd(49000).replace(/\s/g, " ")).toBe("49.000 ₫");
    expect(formatVnd(0).replace(/\s/g, " ")).toBe("0 ₫");
  });
});

describe("FE-BIL-02 isFakePaymentPageEnabled", () => {
  it("UTCID01 is enabled only for an explicit fake provider outside production", () => {
    expect(isFakePaymentPageEnabled("development", "fake")).toBe(true);
    expect(isFakePaymentPageEnabled("development", " FAKE ")).toBe(true);
    expect(isFakePaymentPageEnabled("production", "fake")).toBe(false);
    expect(isFakePaymentPageEnabled("development", "payos")).toBe(false);
    expect(isFakePaymentPageEnabled("development", undefined)).toBe(false);
  });
});

describe("FE-BIL-03 parseOrderCode", () => {
  it("UTCID01 accepts a positive safe integer", () => {
    expect(parseOrderCode("1730000000000123")).toBe(1730000000000123);
  });

  it("UTCID02 rejects anything else", () => {
    for (const value of [undefined, "", "0", "-1", "1.5", "12abc", "99999999999999999", ["1"]]) {
      expect(parseOrderCode(value)).toBeNull();
    }
  });
});
