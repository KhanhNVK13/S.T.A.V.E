import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MergeResolutionsSummary } from "./merge-resolutions-summary";
import { setLang } from "@/lib/i18n";
import { summarizeResolutions } from "@/lib/merge-resolutions";

beforeEach(() => setLang("en"));
afterEach(cleanup);

describe("FE-MRS-01 merge-resolutions (summarizeResolutions, MergeResolutionsSummary)", () => {
  it("UTCID01 counts choices by kind in a fixed order", () => {
    const s = summarizeResolutions([
      { noteId: "a", choice: "KEEP_BOTH" },
      { noteId: "b", choice: "KEEP_BOTH" },
      { noteId: "c", choice: "PICK_SOURCE" },
    ]);
    expect(s.total).toBe(3);
    expect(s.counts).toEqual([
      { choice: "PICK_SOURCE", n: 1 },
      { choice: "KEEP_BOTH", n: 2 },
    ]);
  });

  it("UTCID02 no or empty resolutions summarise to zero", () => {
    expect(summarizeResolutions(null)).toEqual({ total: 0, counts: [] });
    expect(summarizeResolutions([])).toEqual({ total: 0, counts: [] });
  });

  it("UTCID03 renders nothing when there are no resolutions", () => {
    const { container } = render(<MergeResolutionsSummary records={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("UTCID04 renders the total and the count of each kept version", () => {
    render(<MergeResolutionsSummary records={[{ noteId: "a", choice: "KEEP_BOTH" }, { noteId: "b", choice: "PICK_TARGET" }]} />);
    expect(screen.getByText("Kept both: 1")).toBeTruthy();
    expect(screen.getByText("Kept the target version: 1")).toBeTruthy();
    expect(screen.getByText(/2 conflicts resolved/)).toBeTruthy();
  });

  it("UTCID05 kinds that were not chosen are not listed", () => {
    render(<MergeResolutionsSummary records={[{ noteId: "a", choice: "PICK_SOURCE" }]} />);
    expect(screen.queryByText(/Kept both/)).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
});
