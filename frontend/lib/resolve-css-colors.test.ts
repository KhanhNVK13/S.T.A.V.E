/**
 * resolve-css-colors.test.ts — Report 5, FE-LIB-23 resolveCssColors (UC-78/79 theme colours for canvas).
 * Owner: Haidnde180202.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveCssColors } from "./resolve-css-colors";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** getComputedStyle stub answering backgroundColor in call order. */
function stubComputed(...values: string[]) {
  const spy = vi.spyOn(window, "getComputedStyle");
  values.forEach((v) => spy.mockReturnValueOnce({ backgroundColor: v } as CSSStyleDeclaration));
  return spy;
}

describe("FE-LIB-23 resolveCssColors", () => {
  it("FE-LIB-23 UTCID01 (N): every CSS expression is replaced by the browser-computed colour", () => {
    stubComputed("rgb(255, 255, 255)", "oklab(0.5 0.1 0.1)");
    expect(resolveCssColors({ bg: "var(--surface)", grid: "color-mix(in oklab, var(--border) 50%, white)" })).toEqual({
      bg: "rgb(255, 255, 255)",
      grid: "oklab(0.5 0.1 0.1)",
    });
  });

  it("FE-LIB-23 UTCID02 (N): output has exactly the same keys as the spec", () => {
    stubComputed("rgb(1, 1, 1)", "rgb(2, 2, 2)", "rgb(3, 3, 3)");
    expect(Object.keys(resolveCssColors({ a: "x", b: "y", c: "z" }))).toEqual(["a", "b", "c"]);
  });

  it("FE-LIB-23 UTCID03 (A): invalid expression (computed = transparent) → original expression kept so the bug stays visible", () => {
    stubComputed("rgba(0, 0, 0, 0)");
    expect(resolveCssColors({ bad: "var(--does-not-exist" })).toEqual({ bad: "var(--does-not-exist" });
  });

  it("FE-LIB-23 UTCID04 (A): browser returns an empty string → original expression kept", () => {
    stubComputed("");
    expect(resolveCssColors({ k: "var(--x)" })).toEqual({ k: "var(--x)" });
  });

  it("FE-LIB-23 UTCID05 (B): empty spec → empty object; no probe element left in the DOM", () => {
    const before = document.body.childElementCount;
    expect(resolveCssColors({})).toEqual({});
    expect(document.body.childElementCount).toBe(before);
  });

  it("FE-LIB-23 UTCID06 (N): the probe is invisible / non-interactive and removed afterwards", () => {
    let probe: HTMLElement | null = null;
    vi.spyOn(window, "getComputedStyle").mockImplementation((el) => {
      probe = el as HTMLElement;
      return { backgroundColor: "rgb(0, 0, 255)" } as CSSStyleDeclaration;
    });
    resolveCssColors({ k: "blue" });
    expect(probe!.style.opacity).toBe("0");
    expect(probe!.style.pointerEvents).toBe("none");
    expect(probe!.style.position).toBe("absolute");
    expect(probe!.isConnected).toBe(false);
  });

  it("FE-LIB-23 UTCID07 (A): getComputedStyle throws → error propagates but the probe is still removed (finally)", () => {
    const before = document.body.childElementCount;
    vi.spyOn(window, "getComputedStyle").mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => resolveCssColors({ k: "red" })).toThrow("boom");
    expect(document.body.childElementCount).toBe(before);
  });

  it("FE-LIB-23 UTCID08 (B): no DOM (SSR) → returns a copy of the spec unchanged", () => {
    const spec = { bg: "var(--surface)" };
    vi.stubGlobal("document", undefined);
    const out = resolveCssColors(spec);
    expect(out).toEqual(spec);
    expect(out).not.toBe(spec);
  });

  it("FE-LIB-23 UTCID09 (N): real jsdom computation — an already-concrete rgb() colour is returned as rgb()", () => {
    expect(resolveCssColors({ k: "rgb(10, 20, 30)" })).toEqual({ k: "rgb(10, 20, 30)" });
  });

  it("FE-LIB-23 UTCID10 (N): each key is probed independently (previous value cleared between keys)", () => {
    const seen: string[] = [];
    vi.spyOn(window, "getComputedStyle").mockImplementation((el) => {
      seen.push((el as HTMLElement).style.backgroundColor);
      return { backgroundColor: "rgba(0, 0, 0, 0)" } as CSSStyleDeclaration;
    });
    resolveCssColors({ a: "rgb(1, 2, 3)", b: "not-a-colour" });
    expect(seen[1]).not.toBe("rgb(1, 2, 3)");
  });
});
