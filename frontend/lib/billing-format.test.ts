import { describe, expect, it } from "vitest";
import { isFakePaymentPageEnabled, parseOrderCode, parseReturnTo } from "./billing-format";

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

describe("FE-BIL-06 parseReturnTo", () => {
  it("UTCID01 keeps a same-site path", () => {
    expect(parseReturnTo("/profile?tab=theme")).toBe("/profile?tab=theme");
  });

  it("UTCID02 drops anything that could leave the site", () => {
    for (const value of [undefined, "", "//evil.com", "/\\evil.com", "https://x", "javascript:alert(1)", "/a?u=https://x", ["/plans"]]) {
      expect(parseReturnTo(value)).toBeNull();
    }
  });
});
