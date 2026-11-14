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
  const probeCount = () => document.body.childElementCount;

  it("UTCID01 (N): no DOM (SSR) → returns a copy of {bg: var(--surface)} unchanged", () => {
    const spec = { bg: "var(--surface)" };
    vi.stubGlobal("document", undefined);
    const out = resolveCssColors(spec);
    expect(out).toEqual({ bg: "var(--surface)" });
    expect(out).not.toBe(spec);
  });

  it("UTCID02 (N): computed rgb(18, 18, 20) → {bg: rgb(18, 18, 20)}, probe removed", () => {
    const before = probeCount();
    stubComputed("rgb(18, 18, 20)");
    expect(resolveCssColors({ bg: "var(--surface)" })).toEqual({ bg: "rgb(18, 18, 20)" });
    expect(probeCount()).toBe(before);
  });

  it("UTCID03 (N): color-mix expression resolved to oklab(...), probe removed", () => {
    const before = probeCount();
    stubComputed("oklab(0.5 0.1 0.1)");
    expect(resolveCssColors({ a: "color-mix(in oklab, red, blue)" })).toEqual({ a: "oklab(0.5 0.1 0.1)" });
    expect(probeCount()).toBe(before);
  });

  it("UTCID04 (A): computed rgba(0, 0, 0, 0) → original var(--missing) kept", () => {
    stubComputed("rgba(0, 0, 0, 0)");
    expect(resolveCssColors({ bg: "var(--missing)" })).toEqual({ bg: "var(--missing)" });
  });

  it("UTCID05 (A): computed \"\" → original \"notacolor\" kept", () => {
    stubComputed("");
    expect(resolveCssColors({ bg: "notacolor" })).toEqual({ bg: "notacolor" });
  });

  it("UTCID06 (B): empty spec → {} and no probe left in the DOM", () => {
    const before = probeCount();
    stubComputed("rgb(18, 18, 20)");
    expect(resolveCssColors({})).toEqual({});
    expect(probeCount()).toBe(before);
  });

  it("UTCID07 (A): getComputedStyle throws → error propagated, probe still removed (finally)", () => {
    const before = probeCount();
    vi.spyOn(window, "getComputedStyle").mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => resolveCssColors({ bg: "var(--surface)" })).toThrow("boom");
    expect(probeCount()).toBe(before);
  });

  it("output has exactly the same keys as the spec", () => {
    stubComputed("rgb(1, 1, 1)", "rgb(2, 2, 2)", "rgb(3, 3, 3)");
    expect(Object.keys(resolveCssColors({ a: "x", b: "y", c: "z" }))).toEqual(["a", "b", "c"]);
  });

  it("the probe is invisible / non-interactive and removed afterwards", () => {
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

  it("real jsdom computation — an already-concrete rgb() colour is returned as rgb()", () => {
    expect(resolveCssColors({ k: "rgb(10, 20, 30)" })).toEqual({ k: "rgb(10, 20, 30)" });
  });

  it("each key is probed independently (previous value cleared between keys)", () => {
    const seen: string[] = [];
    vi.spyOn(window, "getComputedStyle").mockImplementation((el) => {
      seen.push((el as HTMLElement).style.backgroundColor);
      return { backgroundColor: "rgba(0, 0, 0, 0)" } as CSSStyleDeclaration;
    });
    resolveCssColors({ a: "rgb(1, 2, 3)", b: "not-a-colour" });
    expect(seen[1]).not.toBe("rgb(1, 2, 3)");
  });
});
