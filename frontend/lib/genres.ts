/** Canonical genre list for all project genres (create, edit, Explore filter). */
export const GENRES = [
  "Pop",
  "Rock",
  "Jazz",
  "Hip-Hop",
  "R&B / Soul",
  "Lo-Fi",
  "Electronic / EDM",
  "House",
  "Techno",
  "Trance",
  "Dubstep",
  "Drum & Bass",
  "Synthwave",
  "Trap",
  "Classical",
  "Orchestral",
  "Soundtrack / Cinematic",
  "Ambient",
  "Blues",
  "Country",
  "Folk / Acoustic",
  "Funk",
  "Disco",
  "Indie",
  "Alternative",
  "Metal",
  "Punk",
  "Reggae",
  "Latin",
  "Bossa Nova",
  "Gospel",
  "World / Traditional",
  "Other",
] as const;

export type Genre = (typeof GENRES)[number];

export function isGenre(value: string): value is Genre {
  return (GENRES as readonly string[]).includes(value);
}
