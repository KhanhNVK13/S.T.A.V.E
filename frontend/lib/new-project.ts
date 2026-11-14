import type { CreateProjectPayload } from "./api-client";
import type { TKey } from "./i18n";
import { DEFAULT_LICENSE, type ProjectLicense } from "./license";

export type NewProjectVisibility = "public" | "private";

export function buildCreateProjectPayload(input: {
  name: string;
  description: string;
  genre: string;
  visibility: NewProjectVisibility;
  license: ProjectLicense;
}): CreateProjectPayload {
  const payload: CreateProjectPayload = {
    name: input.name.trim(),
    description: input.description.trim() || null,
    genre: input.genre.trim() || null,
    visibility: input.visibility,
  };
  if (input.visibility === "public") payload.license = input.license || DEFAULT_LICENSE;
  return payload;
}

export function createdToastKey(created: { visibilityKeptPrivate?: boolean } | null | undefined): TKey {
  return created?.visibilityKeptPrivate ? "new.createdKeptPrivate" : "new.created";
}
