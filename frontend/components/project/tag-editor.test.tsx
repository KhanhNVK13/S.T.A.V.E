import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TagEditor, cleanTag } from "./tag-editor";
import { setLang } from "@/lib/i18n";

function Harness({ initial = [] as string[] }) {
  const [tags, setTags] = useState(initial);
  return (
    <>
      <TagEditor tags={tags} onChange={setTags} />
      <output data-testid="tags">{tags.join("|")}</output>
    </>
  );
}

function add(text: string) {
  const input = screen.getByRole("textbox", { name: "New tag" });
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter" });
}

const current = () => screen.getByTestId("tags").textContent;

beforeEach(() => setLang("en"));
afterEach(cleanup);

describe("cleanTag", () => {
  it("trims, collapses spaces and lowercases", () => {
    expect(cleanTag("  Lo   Fi ")).toBe("lo fi");
  });
});

describe("TagEditor", () => {
  it("adds a normalized tag on Enter and clears the field", () => {
    render(<Harness />);
    add("  Lo-Fi ");
    expect(current()).toBe("lo-fi");
    expect((screen.getByRole("textbox", { name: "New tag" }) as HTMLInputElement).value).toBe("");
    expect(screen.getByText("1/5 tags")).toBeTruthy();
  });

  it("rejects a duplicate without adding it", () => {
    render(<Harness initial={["jazz"]} />);
    add("JAZZ");
    expect(current()).toBe("jazz");
    expect(screen.getByRole("alert").textContent).toMatch(/already added/);
  });

  it("rejects characters outside letters, numbers, hyphens and spaces", () => {
    render(<Harness />);
    add("<b>");
    expect(current()).toBe("");
    expect(screen.getByRole("alert").textContent).toMatch(/letters, numbers/);
  });

  it("stops at five tags and disables the input", () => {
    render(<Harness initial={["a", "b", "c", "d", "e"]} />);
    expect((screen.getByRole("textbox", { name: "New tag" }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText("5/5 tags")).toBeTruthy();
  });

  it("removes a tag with its button", () => {
    render(<Harness initial={["jazz", "piano"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove tag jazz" }));
    expect(current()).toBe("piano");
  });
});
