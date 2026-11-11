import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Dialog } from "./dialog";
import { setLang } from "../../lib/i18n";

beforeEach(() => setLang("en"));
afterEach(cleanup);

function overlayOf(title: string): HTMLElement {
  return screen.getByRole("dialog", { name: title }).parentElement as HTMLElement;
}

describe("Dialog dirty guard", () => {
  it("closes immediately on background click and Esc when not dirty", () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Editor" onClose={onClose}>
        body
      </Dialog>,
    );
    fireEvent.mouseDown(overlayOf("Editor"));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Discard changes?")).toBeNull();
  });

  it("asks before closing when dirty, on background click", () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Editor" dirty onClose={onClose}>
        body
      </Dialog>,
    );
    fireEvent.mouseDown(overlayOf("Editor"));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Discard changes?")).toBeTruthy();
  });

  it("Esc closes only the confirmation first, keeping edits", () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Editor" dirty onClose={onClose}>
        body
      </Dialog>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByText("Discard changes?")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Discard changes?")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Editor" })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("'Keep editing' keeps the dialog, 'Discard changes' closes it", () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Editor" dirty onClose={onClose}>
        body
      </Dialog>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not ask or close while closeDisabled", () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Editor" dirty closeDisabled onClose={onClose}>
        body
      </Dialog>,
    );
    fireEvent.mouseDown(overlayOf("Editor"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText("Discard changes?")).toBeNull();
  });
});
