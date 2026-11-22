import { describe, expect, it } from "vitest";
import { formatBytes } from "./format-bytes";

describe("FE-FMT-BYTES formatBytes", () => {
  it("UTCID01 zero, negative and non-finite values show 0 KB", () => {
    expect(formatBytes(0)).toBe("0 KB");
    expect(formatBytes(-5)).toBe("0 KB");
    expect(formatBytes(Number.NaN)).toBe("0 KB");
  });

  it("UTCID02 small files never round down to 0 KB", () => {
    expect(formatBytes(10)).toBe("1 KB");
    expect(formatBytes(300000)).toBe("293 KB");
  });

  it("UTCID03 megabytes and gigabytes use one decimal", () => {
    expect(formatBytes(50 * 1024 * 1024)).toBe("50.0 MB");
    expect(formatBytes(2048 * 1024 * 1024)).toBe("2.0 GB");
  });
});
