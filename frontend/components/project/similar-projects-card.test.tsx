import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { setLang } from "../../lib/i18n";
import { getSimilarProjects, type SimilarProjectItem } from "../../lib/api-similar";
import { SimilarProjectsCard } from "./similar-projects-card";

vi.mock("../../lib/api-similar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api-similar")>()),
  getSimilarProjects: vi.fn(),
}));

const mockGetSimilar = vi.mocked(getSimilarProjects);

function makeItem(
  id: string,
  name: string,
  over: Partial<SimilarProjectItem> = {},
): SimilarProjectItem {
  return {
    id,
    name,
    description: null,
    genre: "Lo-Fi",
    visibility: "public",
    archived_at: null,
    created_at: "2026-11-18T10:00:00.000Z",
    updated_at: "2026-11-19T10:00:00.000Z",
    play_count: 5,
    fork_count: 1,
    owner: {
      id: `owner-${id}`,
      username: `user_${id}`,
      display_name: `Creator ${id}`,
      avatar_url: null,
    },
    tags: [],
    similarity: 0.92,
    tempo: 84,
    tonalityTonic: "A",
    tonalityMode: "minor",
    ...over,
  };
}

beforeEach(() => {
  setLang("en");
  mockGetSimilar.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("SimilarProjectsCard", () => {
  it("renders similar projects with similarity percentage, BPM, key badge, and project link", async () => {
    mockGetSimilar.mockResolvedValue([
      makeItem("p2", "Rainy Keys", {
        similarity: 0.93,
        tempo: 82,
        tonalityTonic: "A",
        tonalityMode: "minor",
      }),
    ]);

    render(<SimilarProjectsCard projectId="p1" />);

    const card = await screen.findByTestId("similar-projects-card");
    expect(card.textContent).toContain("Similar structure");
    expect(card.textContent).toContain("Rainy Keys");
    expect(card.textContent).toContain("93% match");
    expect(card.textContent).toContain("82 BPM");
    expect(card.textContent).toContain("A minor");
    expect(card.textContent).toContain("by Creator p2");
    const link = screen.getByRole("link", { name: /Rainy Keys/i });
    expect(link.getAttribute("href")).toBe("/projects/p2");
  });

  it("renders Vietnamese labels when language is set to vi", async () => {
    setLang("vi");
    mockGetSimilar.mockResolvedValue([
      makeItem("p3", "Chiều Tà", {
        similarity: 0.88,
        tempo: 110,
        tonalityTonic: "C",
        tonalityMode: "major",
      }),
    ]);

    render(<SimilarProjectsCard projectId="p1" />);

    const card = await screen.findByTestId("similar-projects-card");
    expect(card.textContent).toContain("Dự án có cấu trúc tương tự");
    expect(card.textContent).toContain("88% tương đồng");
    expect(card.textContent).toContain("C trưởng");
  });

  it("renders null when no similar projects exist or when fetching fails", async () => {
    mockGetSimilar.mockResolvedValueOnce([]);
    const { container, rerender } = render(<SimilarProjectsCard projectId="p1" />);
    await waitFor(() => expect(mockGetSimilar).toHaveBeenCalledWith("p1"));
    await act(async () => {});
    expect(container.querySelector('[data-testid="similar-projects-card"]')).toBeNull();

    mockGetSimilar.mockRejectedValueOnce(new Error("404"));
    rerender(<SimilarProjectsCard projectId="p2" />);
    await waitFor(() => expect(mockGetSimilar).toHaveBeenCalledWith("p2"));
    await act(async () => {});
    expect(container.querySelector('[data-testid="similar-projects-card"]')).toBeNull();
  });

  it("does not fetch when project is private", () => {
    const { container } = render(<SimilarProjectsCard projectId="p1" isPublic={false} />);
    expect(mockGetSimilar).not.toHaveBeenCalled();
    expect(container.firstChild).toBeNull();
  });
});
