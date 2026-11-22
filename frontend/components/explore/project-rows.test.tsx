import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ProjectRows } from "./project-rows";
import type { PublicProject } from "../../lib/api-client";
import { setLang } from "../../lib/i18n";

function makeProject(overrides: Partial<PublicProject> = {}): PublicProject {
  return {
    id: "proj-1",
    name: "Midnight Chords",
    description: "Warm synth progression",
    genre: "Lo-Fi",
    visibility: "public",
    archived_at: null,
    created_at: "2026-11-18T10:00:00.000Z",
    updated_at: "2026-11-19T10:00:00.000Z",
    play_count: 42,
    fork_count: 5,
    owner: {
      id: "user-1",
      username: "minh",
      display_name: "Minh",
      avatar_url: null,
    },
    tags: ["lofi"],
    ...overrides,
  };
}

beforeEach(() => {
  setLang("en");
});

afterEach(() => {
  cleanup();
});

describe("ProjectRows", () => {
  it("hides the Comments column and comment stat when comment_count is undefined", () => {
    const projects = [
      makeProject({ id: "p1", name: "Track One", play_count: 10, fork_count: 2 }),
      makeProject({ id: "p2", name: "Track Two", play_count: 20, fork_count: 4 }),
    ];

    const { container } = render(<ProjectRows projects={projects} />);

    expect(screen.getByText("Plays")).toBeTruthy();
    expect(screen.getByText("Fork")).toBeTruthy();
    expect(screen.queryByText("Comments")).toBeNull();
    expect(screen.queryByTitle("Comments")).toBeNull();
    expect(screen.getAllByTitle("Plays")).toHaveLength(2);
    expect(screen.getAllByTitle("Forks")).toHaveLength(2);

    const grid = container.firstElementChild;
    expect(grid?.className).toContain(
      "md:grid-cols-[minmax(0,1fr)_112px_84px_84px_108px]",
    );
  });

  it("hides Comments on creator view (showOwner=false) when comment_count is undefined", () => {
    const projects = [makeProject({ id: "p1", name: "Solo Sketch" })];
    render(<ProjectRows projects={projects} showOwner={false} />);

    expect(screen.getByText("Solo Sketch")).toBeTruthy();
    expect(screen.queryByText("Comments")).toBeNull();
    expect(screen.queryByTitle("Comments")).toBeNull();
  });

  it("renders Comments header and comment stat on every row (including 0 and > 0) when comment_count is present", () => {
    const projects = [
      makeProject({ id: "p1", name: "Silent Piece", comment_count: 0 }),
      makeProject({ id: "p2", name: "Busy Piece", comment_count: 14 }),
    ];

    const { container } = render(<ProjectRows projects={projects} rankFrom={1} />);

    expect(screen.getByText("Rank")).toBeTruthy();
    expect(screen.getByText("Comments")).toBeTruthy();

    const commentStats = screen.getAllByTitle("Comments");
    expect(commentStats).toHaveLength(2);
    expect(commentStats.map((el) => el.textContent?.trim())).toEqual(["0", "14"]);

    const grid = container.firstElementChild;
    expect(grid?.className).toContain(
      "md:grid-cols-[52px_minmax(0,1fr)_112px_84px_84px_84px_108px]",
    );

    expect(within(grid as HTMLElement).getByText("Silent Piece")).toBeTruthy();
    expect(within(grid as HTMLElement).getByText("Busy Piece")).toBeTruthy();
  });

  it("uses Vietnamese labels for Comments header and stat when lang is vi", () => {
    setLang("vi");
    const projects = [
      makeProject({ id: "p1", name: "Bài A", comment_count: 0 }),
      makeProject({ id: "p2", name: "Bài B", comment_count: 3 }),
    ];

    render(<ProjectRows projects={projects} rankFrom={1} />);

    expect(screen.getByText("Hạng")).toBeTruthy();
    expect(screen.getByText("Bình luận")).toBeTruthy();
    const commentStats = screen.getAllByTitle("Bình luận");
    expect(commentStats).toHaveLength(2);
    expect(commentStats.map((el) => el.textContent?.trim())).toEqual(["0", "3"]);
  });
});
