import { beforeEach, describe, expect, it } from "vitest";
import { setLang } from "./i18n";
import { formatVnd } from "./format-vnd";

beforeEach(() => setLang("vi"));

const plain = (text: string) => text.replace(/\s/g, " ");

describe("FE-BIL-01 formatVnd", () => {
  it("UTCID01 formats whole đồng amounts in Vietnamese style", () => {
    expect(plain(formatVnd(49000))).toBe("49.000 ₫");
    expect(plain(formatVnd(1250000))).toBe("1.250.000 ₫");
  });

  it("UTCID02 formats a free plan as zero đồng", () => {
    expect(plain(formatVnd(0))).toBe("0 ₫");
  });

  it("UTCID03 follows the selected language", () => {
    setLang("en");
    expect(plain(formatVnd(49000))).toBe("₫49,000");
  });
});
