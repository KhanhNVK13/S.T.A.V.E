import {
  apiFetch,
  type PublicProject,
  type PublicProjectsResponse,
} from "./api-client";

export interface SimilarProjectItem extends PublicProject {
  similarity: number;
  tempo: number;
  tonalityTonic: string | null;
  tonalityMode: "major" | "minor" | null;
}

export interface ExploreParseResponse {
  instruments: string[];
  genre: string | null;
  tempoMin: number | null;
  tempoMax: number | null;
  mode: "major" | "minor" | null;
  search: string | null;
  explanation: string;
  source: "ai" | "rule";
}

export async function getSimilarProjects(
  projectId: string,
  limit = 6,
): Promise<SimilarProjectItem[]> {
  const query = limit !== 6 ? `?limit=${encodeURIComponent(String(limit))}` : "";
  return apiFetch<SimilarProjectItem[]>(
    `/explore/projects/${encodeURIComponent(projectId)}/similar${query}`,
  );
}

export async function parseExploreQuery(
  query: string,
  lang: "vi" | "en",
): Promise<ExploreParseResponse> {
  return apiFetch<ExploreParseResponse>("/ai/explore-parse", {
    method: "POST",
    body: JSON.stringify({ query, lang }),
  });
}

export async function listFilteredPublicProjects(params?: {
  page?: number;
  limit?: number;
  genre?: string;
  tag?: string;
  sort?:
    | "newest"
    | "recently_updated"
    | "popular"
    | "most_played"
    | "most_forked";
  search?: string;
  instrument?: string[];
  tempoMin?: number;
  tempoMax?: number;
  mode?: "major" | "minor";
}): Promise<PublicProjectsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.genre) searchParams.set("genre", params.genre);
  if (params?.tag) searchParams.set("tag", params.tag);
  if (params?.sort) searchParams.set("sort", params.sort);
  if (params?.search) searchParams.set("search", params.search);
  if (params?.instrument?.length) {
    searchParams.set("instrument", params.instrument.join(","));
  }
  if (params?.tempoMin !== undefined) {
    searchParams.set("tempoMin", String(params.tempoMin));
  }
  if (params?.tempoMax !== undefined) {
    searchParams.set("tempoMax", String(params.tempoMax));
  }
  if (params?.mode) {
    searchParams.set("mode", params.mode);
  }

  const query = searchParams.toString();
  return apiFetch<PublicProjectsResponse>(
    `/explore/projects${query ? `?${query}` : ""}`,
  );
}
