import { describe, expect, it } from "vitest";
import { buildCreateProjectPayload, createdToastKey } from "./new-project";

const base = { name: "  Song ", description: " ", genre: " Pop ", license: "CC-BY-SA" as const };

describe("FE-PRJ-01 new-project (buildCreateProjectPayload, createdToastKey)", () => {
  it("UTCID01 a private project is sent without a license and with trimmed fields", () => {
    expect(buildCreateProjectPayload({ ...base, visibility: "private" })).toEqual({
      name: "Song",
      description: null,
      genre: "Pop",
      visibility: "private",
    });
  });

  it("UTCID02 a public project is sent with the chosen license", () => {
    expect(buildCreateProjectPayload({ ...base, visibility: "public" })).toMatchObject({
      visibility: "public",
      license: "CC-BY-SA",
    });
  });

  it("UTCID03 a description and genre that are filled in are kept trimmed", () => {
    expect(
      buildCreateProjectPayload({ ...base, description: " Demo ", genre: " Rock ", visibility: "private" }),
    ).toMatchObject({ description: "Demo", genre: "Rock" });
  });

  it("UTCID04 a blank genre is sent as null", () => {
    expect(buildCreateProjectPayload({ ...base, genre: "  ", visibility: "private" }).genre).toBeNull();
  });

  it("UTCID05 the toast explains when the server kept the project private", () => {
    expect(createdToastKey({ visibilityKeptPrivate: true })).toBe("new.createdKeptPrivate");
  });

  it("UTCID06 the ordinary toast is used when the project was created as requested or the response is empty", () => {
    expect(createdToastKey({})).toBe("new.created");
    expect(createdToastKey(null)).toBe("new.created");
  });
});
