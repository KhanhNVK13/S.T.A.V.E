import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ExplorePage from "./page";
import {
  getFeaturedContent,
  listPublicProjects,
  type FeaturedContent,
  type PublicProject,
  type PublicProjectsResponse,
} from "../../lib/api-client";
import {
  listFilteredPublicProjects,
  parseExploreQuery,
} from "../../lib/api-similar";
import { setLang } from "../../lib/i18n";

const pushMock = vi.fn();
let currentSearchParams = new URLSearchParams();
let currentAuthUser: { id: string } | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => currentSearchParams,
}));

vi.mock("../../context/auth-context", () => ({
  useAuth: () => ({ user: currentAuthUser }),
}));

vi.mock("../../components/space/use-space-scene", () => ({
  useSpaceScene: () => {},
  useSpaceScroll: () => {},
}));

vi.mock("../../lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-client")>();
  return {
    ...actual,
    getFeaturedContent: vi.fn(),
    listPublicProjects: vi.fn(),
  };
});

vi.mock("../../lib/api-similar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api-similar")>();
  return {
    ...actual,
    listFilteredPublicProjects: vi.fn(),
    parseExploreQuery: vi.fn(),
  };
});

const mockGetFeaturedContent = vi.mocked(getFeaturedContent);
const mockListPublicProjects = vi.mocked(listPublicProjects);
const mockListFilteredPublicProjects = vi.mocked(listFilteredPublicProjects);
const mockParseExploreQuery = vi.mocked(parseExploreQuery);

function makeProject(id: string, name: string, over: Partial<PublicProject> = {}): PublicProject {
  return {
    id,
    name,
    description: null,
    genre: "Jazz",
    visibility: "public",
    archived_at: null,
    created_at: "2026-11-18T10:00:00.000Z",
    updated_at: "2026-11-19T10:00:00.000Z",
    play_count: 10,
    fork_count: 2,
    owner: {
      id: `owner-${id}`,
      username: `user_${id}`,
      display_name: `User ${id}`,
      avatar_url: null,
    },
    tags: [],
    ...over,
  };
}

function makeFeatured(over: Partial<FeaturedContent> = {}): FeaturedContent {
  return {
    hero: {
      title: "STAVE",
      subtitle: "Versioned MIDI",
      cta_primary: { label: "Create", href: "/projects/new" },
      cta_secondary: { label: "Explore", href: "/explore" },
    },
    featured_projects: [],
    trending_projects: [],
    stats: {
      total_projects: 10,
      total_users: 5,
      total_forks: 3,
    },
    ...over,
  };
}

function makeListResponse(
  items: PublicProject[],
  over: Partial<PublicProjectsResponse> = {},
): PublicProjectsResponse {
  return {
    items,
    total: items.length,
    page: 1,
    totalPages: 1,
    limit: 9,
    ...over,
  };
}

function getFeaturedSection(): HTMLElement | null {
  return document.querySelector('section[aria-labelledby="explore-featured"]');
}

beforeEach(() => {
  setLang("en");
  currentSearchParams = new URLSearchParams();
  currentAuthUser = null;
  pushMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ExplorePage Featured section", () => {
  it("renders featured.trending_projects (and not featured.featured_projects) when trending_projects is non-empty", async () => {
    const trending = [
      makeProject("t1", "Trending Song 1"),
      makeProject("t2", "Trending Song 2"),
    ];
    const legacyFeatured = [makeProject("f1", "Legacy Featured Song")];
    const allItems = [makeProject("a1", "All List Song")];

    mockGetFeaturedContent.mockResolvedValue(
      makeFeatured({
        trending_projects: trending,
        featured_projects: legacyFeatured,
      }),
    );
    mockListPublicProjects.mockResolvedValue(makeListResponse(allItems));

    render(<ExplorePage />);

    const featuredHeading = await screen.findByRole("heading", { name: "Featured" });
    const featuredSection = featuredHeading.closest("section");
    expect(featuredSection).not.toBeNull();
    expect(within(featuredSection as HTMLElement).getByText("Trending Song 1")).toBeTruthy();
    expect(within(featuredSection as HTMLElement).getByText("Trending Song 2")).toBeTruthy();
    expect(within(featuredSection as HTMLElement).queryByText("Legacy Featured Song")).toBeNull();

    expect(await screen.findByText("All List Song")).toBeTruthy();
    expect(mockListPublicProjects).toHaveBeenCalledTimes(1);
  });

  it("does not flash fallback items while featured is still loading", async () => {
    let resolveFeatured: (value: FeaturedContent) => void = () => {};
    mockGetFeaturedContent.mockReturnValue(
      new Promise((resolve) => {
        resolveFeatured = resolve;
      }),
    );
    mockListPublicProjects.mockResolvedValue(
      makeListResponse([makeProject("n1", "Newest Item 1")]),
    );

    render(<ExplorePage />);

    expect(await screen.findByText("Newest Item 1")).toBeTruthy();
    expect(getFeaturedSection()).toBeNull();

    await act(async () => {
      resolveFeatured(
        makeFeatured({
          trending_projects: [makeProject("t1", "Arrived Trending")],
        }),
      );
    });

    const featuredSection = getFeaturedSection();
    expect(featuredSection).not.toBeNull();
    expect(within(featuredSection as HTMLElement).getByText("Arrived Trending")).toBeTruthy();
    expect(within(featuredSection as HTMLElement).queryByText("Newest Item 1")).toBeNull();
  });

  it("falls back to up to 6 newest items from listPublicProjects when trending_projects is empty and sort is newest, without an extra fetch", async () => {
    const newestEight = Array.from({ length: 8 }, (_, idx) =>
      makeProject(`n${idx + 1}`, `Newest Track ${idx + 1}`),
    );

    mockGetFeaturedContent.mockResolvedValue(
      makeFeatured({
        trending_projects: [],
        featured_projects: [makeProject("f1", "Ignored Featured")],
      }),
    );
    mockListPublicProjects.mockResolvedValue(makeListResponse(newestEight));

    render(<ExplorePage />);

    const featuredHeading = await screen.findByRole("heading", { name: "Featured" });
    const featuredSection = featuredHeading.closest("section") as HTMLElement;

    for (let i = 1; i <= 6; i++) {
      expect(within(featuredSection).getByText(`Newest Track ${i}`)).toBeTruthy();
    }
    expect(within(featuredSection).queryByText("Newest Track 7")).toBeNull();
    expect(within(featuredSection).queryByText("Newest Track 8")).toBeNull();
    expect(within(featuredSection).queryByText("Ignored Featured")).toBeNull();

    expect(mockListPublicProjects).toHaveBeenCalledTimes(1);
    expect(mockListPublicProjects).toHaveBeenCalledWith({
      page: 1,
      limit: 9,
      sort: "newest",
      genre: undefined,
      search: undefined,
      tag: undefined,
      instrument: undefined,
    });
  });

  it("fetches 6 newest projects as fallback when trending_projects is empty and sort is most_played", async () => {
    currentSearchParams = new URLSearchParams("sort=most_played");

    const mostPlayedItems = [makeProject("mp1", "Most Played Hit")];
    const newestFallbackItems = [
      makeProject("nf1", "Fresh Fallback 1"),
      makeProject("nf2", "Fresh Fallback 2"),
    ];

    mockGetFeaturedContent.mockResolvedValue(
      makeFeatured({ trending_projects: [], featured_projects: [] }),
    );
    mockListPublicProjects.mockImplementation(async (params) => {
      if (params?.sort === "newest") {
        return makeListResponse(newestFallbackItems, { limit: 6 });
      }
      return makeListResponse(mostPlayedItems);
    });

    render(<ExplorePage />);

    const featuredHeading = await screen.findByRole("heading", { name: "Featured" });
    const featuredSection = featuredHeading.closest("section") as HTMLElement;

    expect(await within(featuredSection).findByText("Fresh Fallback 1")).toBeTruthy();
    expect(within(featuredSection).getByText("Fresh Fallback 2")).toBeTruthy();
    expect(within(featuredSection).queryByText("Most Played Hit")).toBeNull();

    expect(mockListPublicProjects).toHaveBeenCalledWith({
      page: 1,
      limit: 6,
      sort: "newest",
    });

    const allHeading = screen.getByRole("heading", { name: "All projects" });
    const allSection = allHeading.closest("section") as HTMLElement;
    expect(within(allSection).getByText("Most Played Hit")).toBeTruthy();
  });

  it("hides the Featured section when filtered by genre", async () => {
    currentSearchParams = new URLSearchParams("genre=Jazz");

    mockGetFeaturedContent.mockResolvedValue(
      makeFeatured({ trending_projects: [makeProject("t1", "Trending Song")] }),
    );
    mockListPublicProjects.mockResolvedValue(
      makeListResponse([makeProject("j1", "Jazz Filtered Song")]),
    );

    render(<ExplorePage />);

    expect(await screen.findByText("Jazz Filtered Song")).toBeTruthy();
    expect(getFeaturedSection()).toBeNull();
    expect(screen.queryByRole("heading", { name: "Featured" })).toBeNull();
  });

  it("hides the Featured section on page 2", async () => {
    currentSearchParams = new URLSearchParams("page=2");

    mockGetFeaturedContent.mockResolvedValue(
      makeFeatured({ trending_projects: [makeProject("t1", "Trending Song")] }),
    );
    mockListPublicProjects.mockResolvedValue(
      makeListResponse([makeProject("p2", "Page 2 Song")], { page: 2, totalPages: 2 }),
    );

    render(<ExplorePage />);

    expect(await screen.findByText("Page 2 Song")).toBeTruthy();
    expect(getFeaturedSection()).toBeNull();
    expect(screen.queryByRole("heading", { name: "Featured" })).toBeNull();
  });

  it("shows retry alert when getFeaturedContent rejects and recovers on retry", async () => {
    mockGetFeaturedContent
      .mockRejectedValueOnce(new Error("featured failed"))
      .mockResolvedValueOnce(
        makeFeatured({ trending_projects: [makeProject("t1", "Recovered Trending")] }),
      );
    mockListPublicProjects.mockResolvedValue(
      makeListResponse([makeProject("a1", "All Song")]),
    );

    render(<ExplorePage />);

    const featuredHeading = await screen.findByRole("heading", { name: "Featured" });
    const featuredSection = featuredHeading.closest("section") as HTMLElement;
    const alert = await within(featuredSection).findByRole("alert");
    expect(alert.textContent).toContain("Couldn't load the featured projects. Please try again.");

    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mockGetFeaturedContent).toHaveBeenCalledTimes(2));
    expect(await within(featuredSection).findByText("Recovered Trending")).toBeTruthy();
  });
});

describe("ExplorePage musical filters and AI search", () => {
  it("reads tempoMin, tempoMax, and mode URL params, renders removable pills, and calls listFilteredPublicProjects", async () => {
    currentSearchParams = new URLSearchParams("tempoMin=70&tempoMax=85&mode=minor");
    mockGetFeaturedContent.mockResolvedValue(makeFeatured());
    mockListFilteredPublicProjects.mockResolvedValue(
      makeListResponse([makeProject("m1", "Minor Ballad")]),
    );

    render(<ExplorePage />);

    expect(await screen.findByText("Minor Ballad")).toBeTruthy();
    expect(getFeaturedSection()).toBeNull();
    expect(mockListFilteredPublicProjects).toHaveBeenCalledWith({
      page: 1,
      limit: 9,
      sort: "newest",
      genre: undefined,
      search: undefined,
      tag: undefined,
      instrument: undefined,
      tempoMin: 70,
      tempoMax: 85,
      mode: "minor",
    });

    const minPill = screen.getByRole("button", { name: "Remove minimum tempo filter" });
    const maxPill = screen.getByRole("button", { name: "Remove maximum tempo filter" });
    const modePill = screen.getByRole("button", { name: "Remove mode filter" });
    expect(minPill.textContent).toContain(">= 70 BPM");
    expect(maxPill.textContent).toContain("<= 85 BPM");
    expect(modePill.textContent).toContain("Minor");

    fireEvent.click(maxPill);
    expect(pushMock).toHaveBeenCalled();
  });

  it("hides Smart search button when signed out and runs parseExploreQuery with dismissible callout when signed in", async () => {
    mockGetFeaturedContent.mockResolvedValue(
      makeFeatured({ trending_projects: [makeProject("t1", "Featured Song")] }),
    );
    mockListPublicProjects.mockResolvedValue(makeListResponse([makeProject("a1", "All Song")]));

    const { unmount } = render(<ExplorePage />);
    expect(await screen.findByText("All Song")).toBeTruthy();
    expect(screen.queryByTestId("explore-ai-search-btn")).toBeNull();
    unmount();

    currentAuthUser = { id: "user-1" };
    mockParseExploreQuery.mockResolvedValue({
      instruments: ["Acoustic Grand Piano"],
      genre: "Jazz",
      tempoMin: null,
      tempoMax: 85,
      mode: "minor",
      search: null,
      explanation: "Mapped query to objective filters: Acoustic Grand Piano · Jazz · Minor mode · <= 85 BPM.",
      source: "ai",
    });

    render(<ExplorePage />);

    const input = screen.getByLabelText("Search public projects");
    fireEvent.change(input, { target: { value: "slow minor jazz piano under 85 bpm" } });
    fireEvent.click(screen.getByTestId("explore-ai-search-btn"));

    await waitFor(() =>
      expect(mockParseExploreQuery).toHaveBeenCalledWith(
        "slow minor jazz piano under 85 bpm",
        "en",
      ),
    );
    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining("tempoMax=85"),
    );
    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining("mode=minor"),
    );
    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining("genre=Jazz"),
    );

    const callout = await screen.findByTestId("explore-ai-callout");
    expect(callout.textContent).toContain("Mapped query to objective filters");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss filter note" }));
    expect(screen.queryByTestId("explore-ai-callout")).toBeNull();
  });
});
