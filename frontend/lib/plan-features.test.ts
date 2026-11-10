import { describe, expect, it } from "vitest";
import { parsePlanFeature, planFeatureList } from "./plan-features";

describe("FE-BIL-04 planFeatureList", () => {
  it("UTCID01 lists the catalogue features a plan turns on, in catalogue order", () => {
    expect(planFeatureList({ extra_storage: true, theme_from_image: true })).toEqual([
      { key: "theme_from_image", label: "Theme tạo từ ảnh" },
      { key: "extra_storage", label: "Tăng dung lượng lưu trữ" },
    ]);
  });

  it("UTCID02 ignores unknown keys and values that are not true", () => {
    expect(planFeatureList({ theme_from_image: false, extra_storage: "yes", other: true })).toEqual([]);
    expect(planFeatureList({})).toEqual([]);
  });
});

describe("FE-BIL-05 parsePlanFeature", () => {
  it("UTCID01 accepts a known feature key", () => {
    expect(parsePlanFeature("theme_from_image")).toBe("theme_from_image");
  });

  it("UTCID02 rejects missing, repeated or unknown values", () => {
    expect(parsePlanFeature(undefined)).toBeNull();
    expect(parsePlanFeature(["theme_from_image"])).toBeNull();
    expect(parsePlanFeature("<script>")).toBeNull();
  });
});
