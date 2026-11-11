import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PublicHistory } from "./public-history";
import { getPublicBranches, getPublicCommits, getPublicDiff } from "@/lib/api-public-history";
import type { PublicCommitItem } from "@/lib/api-public-history";
import { setLang } from "@/lib/i18n";

vi.mock("@/lib/api-public-history", () => ({
  getPublicBranches: vi.fn(),
  getPublicCommits: vi.fn(),
  getPublicDiff: vi.fn(),
}));

const branches = vi.mocked(getPublicBranches);
const commits = vi.mocked(getPublicCommits);
const diff = vi.mocked(getPublicDiff);

function commit(id: string, message: string, createdAt: string): PublicCommitItem {
  return {
    id,
    branch_id: "b1",
    parent_commit_id: null,
    merged_from_commit_id: null,
    message,
    created_at: createdAt,
    author: { id: "u1", username: "an", display_name: "An", avatar_url: null },
  };
}

const first = commit("c1aaaaaaaa", "First idea", "2026-11-01T00:00:00Z");
const second = commit("c2bbbbbbbb", "Add drums", "2026-11-02T00:00:00Z");

beforeEach(() => {
  setLang("en");
  branches.mockResolvedValue([{ id: "b1", name: "main", is_default: true, head_commit_id: "c2bbbbbbbb" }]);
  commits.mockResolvedValue({ items: [second, first], total: 2, page: 1, totalPages: 1, limit: 20 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PublicHistory (guest)", () => {
  it("lists the commits read-only with no write actions and a sign-in link", async () => {
    render(<PublicHistory projectId="p1" />);
    expect(await screen.findByText("First idea")).toBeTruthy();
    expect(screen.getByText("Add drums")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /restore|tag|delete|branch/i })).toBeNull();
    const signIn = screen.getByRole("link", { name: /sign in/i });
    expect(signIn.getAttribute("href")).toBe("/login?next=%2Fprojects%2Fp1");
  });

  it("compares two ticked versions (older as base) through the public diff endpoint", async () => {
    diff.mockResolvedValue({
      areIdentical: false,
      metaChanges: [],
      summary: { notes: { added: 2, removed: 0, modified: 0, totalChanges: 2 }, tracks: { added: 0, removed: 0, modified: 0 } },
      tracksDiff: { added: [], removed: [], modified: [], noteCounts: {} },
      changesByBar: {},
    });
    render(<PublicHistory projectId="p1" />);
    await screen.findByText("First idea");
    const compare = screen.getByRole("button", { name: /compare/i }) as HTMLButtonElement;
    expect(compare.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /Add drums/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /First idea/ }));
    expect(compare.disabled).toBe(false);
    fireEvent.click(compare);
    await waitFor(() => expect(diff).toHaveBeenCalledWith("p1", "c1aaaaaaaa", "c2bbbbbbbb"));
    expect(await screen.findByText("+2")).toBeTruthy();
  });

  it("shows an empty state for a project without versions", async () => {
    commits.mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 0, limit: 20 });
    render(<PublicHistory projectId="p1" />);
    expect(await screen.findByText("This project has no versions yet.")).toBeTruthy();
  });

  it("offers a retry when the history fails to load", async () => {
    commits.mockRejectedValueOnce(new Error("down"));
    render(<PublicHistory projectId="p1" />);
    const retry = await screen.findByRole("button", { name: "Try again" });
    fireEvent.click(retry);
    expect(await screen.findByText("First idea")).toBeTruthy();
  });

  it("loads the next page on demand", async () => {
    commits.mockResolvedValueOnce({ items: [second], total: 2, page: 1, totalPages: 2, limit: 1 });
    commits.mockResolvedValueOnce({ items: [first], total: 2, page: 2, totalPages: 2, limit: 1 });
    render(<PublicHistory projectId="p1" />);
    await screen.findByText("Add drums");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("First idea")).toBeTruthy();
    expect(commits).toHaveBeenLastCalledWith("p1", { branchId: undefined, page: 2, limit: 20 });
  });
});
