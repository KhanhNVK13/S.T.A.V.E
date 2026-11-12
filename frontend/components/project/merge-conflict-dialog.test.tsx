import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { MergeConflictResult } from "../../lib/api-client";
import { MergeConflictDialog } from "./merge-conflict-dialog";

afterEach(cleanup);

const note = (pitch: number) => ({ id: "n", trackId: "t", pitch, start: 0, duration: 480, velocity: 90 });

const result: MergeConflictResult = {
  hasConflicts: true,
  conflictsCount: 2,
  conflictsByBar: {
    "1": [
      {
        noteId: "11111111-aaaa",
        type: "MODIFIED_DIFFERENTLY",
        baseNote: note(60),
        sourceNote: note(62),
        targetNote: note(64),
      },
      { noteId: "22222222-bbbb", type: "DELETE_VS_MODIFY", baseNote: note(60), sourceNote: note(61) },
    ],
  },
};

function renderDialog() {
  return render(
    <MergeConflictDialog
      result={result}
      sourceName="feature"
      targetName="main"
      submitting={false}
      onCancel={vi.fn()}
      onResolve={vi.fn()}
    />,
  );
}

describe("MergeConflictDialog diff colours", () => {
  it("marks modified notes with the diff-modify token and a ~ glyph", () => {
    renderDialog();
    const glyphs = [...document.querySelectorAll('[data-diff-glyph="modify"]')];
    expect(glyphs).toHaveLength(3);
    for (const g of glyphs) {
      expect(g.textContent).toBe("~");
      expect(g.parentElement?.className).toContain("text-diff-modify-foreground");
    }
  });

  it("marks a deleted side with the diff-remove token and a − glyph", () => {
    renderDialog();
    const glyphs = [...document.querySelectorAll('[data-diff-glyph="remove"]')];
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0].textContent).toBe("−");
    expect(glyphs[0].parentElement?.className).toContain("text-diff-remove-foreground");
  });

  it("uses no raw success/danger classes for note options", () => {
    renderDialog();
    const options = [...document.querySelectorAll("fieldset")].map((f) => f.innerHTML).join(" ");
    expect(options).not.toMatch(/text-(success|danger|warning)\b/);
  });
});
