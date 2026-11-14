import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NewProjectVisibilityField } from "./new-project-visibility";
import { setLang } from "@/lib/i18n";

beforeEach(() => setLang("en"));
afterEach(cleanup);

describe("FE-PRJ-02 NewProjectVisibilityField(props)", () => {
  it("UTCID01 hides the license picker while the project is private", () => {
    render(<NewProjectVisibilityField visibility="private" license="CC-BY" onVisibilityChange={vi.fn()} onLicenseChange={vi.fn()} />);
    expect(screen.queryByRole("radio", { name: /CC BY-SA/ })).toBeNull();
  });

  it("UTCID02 shows the license picker when public and reports a license change", () => {
    const onLic = vi.fn();
    render(<NewProjectVisibilityField visibility="public" license="CC-BY" onVisibilityChange={vi.fn()} onLicenseChange={onLic} />);
    fireEvent.click(screen.getByRole("radio", { name: /CC BY-NC/ }));
    expect(onLic).toHaveBeenCalledWith("CC-BY-NC");
  });

  it("UTCID03 reports a switch back to private", () => {
    const onVis = vi.fn();
    render(<NewProjectVisibilityField visibility="public" license="CC-BY" onVisibilityChange={onVis} onLicenseChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: /Private/ }));
    expect(onVis).toHaveBeenCalledWith("private");
  });

  it("UTCID04 reports a switch to public", () => {
    const onVis = vi.fn();
    render(<NewProjectVisibilityField visibility="private" license="CC-BY" onVisibilityChange={onVis} onLicenseChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: /Public/ }));
    expect(onVis).toHaveBeenCalledWith("public");
  });
});
