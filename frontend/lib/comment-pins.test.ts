import { describe, expect, it } from "vitest";
import type { CommentItem } from "@stave/shared-types";
import {
  MAX_VISIBLE_PINS,
  buildCommentPins,
  hitBarPin,
  pinLabel,
  visibleBarPins,
} from "./comment-pins";

const author = { id: "u", username: "u", displayName: null, avatarUrl: null };

function comment(over: Partial<CommentItem> & { id: string }): CommentItem {
  return {
    projectId: "p",
    body: "x",
    trackId: null,
    bar: null,
    noteId: null,
    parentId: null,
    author,
    createdAt: "2026-01-01T00:00:00Z",
    noteMissing: false,
    ...over,
  };
}

describe("buildCommentPins", () => {
  it("groups comments per bar and converts bar to tick", () => {
    const { bars } = buildCommentPins(
      [
        comment({ id: "a", bar: 3 }),
        comment({ id: "b", bar: 3, parentId: "a" }),
        comment({ id: "c", bar: 1 }),
      ],
      480,
      [4, 4],
    );
    expect(bars).toEqual([
      { bar: 1, tick: 0, count: 1, dimmed: false },
      { bar: 3, tick: 2 * 480 * 4, count: 2, dimmed: false },
    ]);
  });

  it("uses the time signature for bar length", () => {
    const { bars } = buildCommentPins([comment({ id: "a", bar: 2 })], 480, [3, 4]);
    expect(bars[0].tick).toBe(480 * 3);
  });

  it("ignores project-wide comments for bar pins", () => {
    expect(buildCommentPins([comment({ id: "a" })], 480, [4, 4]).bars).toEqual([]);
  });

  it("dims a bar only when every comment points to a missing note", () => {
    const mixed = buildCommentPins(
      [
        comment({ id: "a", bar: 2, noteId: "n1", noteMissing: true }),
        comment({ id: "b", bar: 2 }),
      ],
      480,
      [4, 4],
    );
    expect(mixed.bars[0].dimmed).toBe(false);
    const gone = buildCommentPins(
      [comment({ id: "a", bar: 2, noteId: "n1", noteMissing: true })],
      480,
      [4, 4],
    );
    expect(gone.bars[0].dimmed).toBe(true);
  });

  it("marks only existing notes and counts comments per note", () => {
    const { notes } = buildCommentPins(
      [
        comment({ id: "a", bar: 1, noteId: "n1" }),
        comment({ id: "b", bar: 1, noteId: "n1", parentId: "a" }),
        comment({ id: "c", bar: 1, noteId: "n2", noteMissing: true }),
      ],
      480,
      [4, 4],
    );
    expect(notes.get("n1")?.count).toBe(2);
    expect(notes.has("n2")).toBe(false);
  });
});

describe("visibleBarPins", () => {
  const pins = Array.from({ length: 1000 }, (_, i) => ({
    bar: i + 1,
    tick: i * 100,
    count: 1,
    dimmed: false,
  }));

  it("returns only pins inside the visible tick range", () => {
    const out = visibleBarPins(pins, 1000, 2000);
    expect(out[0].tick).toBeGreaterThanOrEqual(999);
    expect(out[out.length - 1].tick).toBeLessThanOrEqual(2000);
  });

  it("caps the number of drawn pins", () => {
    expect(visibleBarPins(pins, 0, 1e9)).toHaveLength(MAX_VISIBLE_PINS);
  });
});

describe("pinLabel / hitBarPin", () => {
  it("caps the label at 99+", () => {
    expect(pinLabel(7)).toBe("7");
    expect(pinLabel(250)).toBe("99+");
  });

  it("hits a pin in the ruler and misses elsewhere", () => {
    const pins = [{ bar: 2, tick: 1000, count: 3, dimmed: false }];
    const px = 0.06;
    const x = 72 + 1000 * px - 50 + 4;
    expect(hitBarPin(pins, x, 8, px, 50, 72, 34)?.bar).toBe(2);
    expect(hitBarPin(pins, x, 30, px, 50, 72, 34)).toBeNull();
    expect(hitBarPin(pins, x + 100, 8, px, 50, 72, 34)).toBeNull();
    expect(hitBarPin(pins, x, 50, px, 50, 72, 34)).toBeNull();
  });
});
