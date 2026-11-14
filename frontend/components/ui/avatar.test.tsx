import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Avatar } from "./avatar";

afterEach(cleanup);

function initialOf(displayName: string | null | undefined, username: string | null | undefined): string {
  const { container } = render(<Avatar id="u1" label={displayName || username || ""} />);
  return container.textContent ?? "";
}

describe("FE-LIB-17 Avatar initial (display name → username → ?)", () => {
  it("UTCID01 (N) display name \"an\", username \"bob\" → \"A\"", () => {
    expect(initialOf("an", "bob")).toBe("A");
  });

  it("UTCID02 (N) display name null, username \"bob\" → \"B\"", () => {
    expect(initialOf(null, "bob")).toBe("B");
  });

  it("UTCID03 (B) empty display name, username \"bob\" → \"B\"", () => {
    expect(initialOf("", "bob")).toBe("B");
  });

  it("UTCID04 (A) display name undefined, username null → \"?\"", () => {
    expect(initialOf(undefined, null)).toBe("?");
  });

  it("UTCID05 (B) both names empty → \"?\"", () => {
    expect(initialOf("", "")).toBe("?");
  });

  it("UTCID06 (N) display name \"ánh\" → \"Á\"", () => {
    expect(initialOf("ánh", null)).toBe("Á");
  });

  it("shows the uploaded image instead of the initial when an avatar URL exists", () => {
    const { container } = render(<Avatar id="u1" label="an" imageUrl="https://cdn.test/a.png" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://cdn.test/a.png");
    expect(container.textContent).toBe("");
  });
});
