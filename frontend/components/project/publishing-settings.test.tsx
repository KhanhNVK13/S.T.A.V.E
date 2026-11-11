import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LicenseCard, TagsCard } from "./publishing-settings";
import { getProjectTags, setProjectTags, updateProject } from "@/lib/api-client";
import { setLang } from "@/lib/i18n";

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, getProjectTags: vi.fn(), setProjectTags: vi.fn(), updateProject: vi.fn() };
});

const getTags = vi.mocked(getProjectTags);
const putTags = vi.mocked(setProjectTags);
const patchProject = vi.mocked(updateProject);

beforeEach(() => setLang("en"));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LicenseCard", () => {
  it("asks for a license on a public project that has none and saves the choice", async () => {
    patchProject.mockResolvedValue(undefined);
    const onSaved = vi.fn();
    render(<LicenseCard projectId="p1" license={null} disabled={false} onSaved={onSaved} />);
    expect(screen.getByText(/has no license yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /CC BY-SA/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save license" }));
    await waitFor(() => expect(patchProject).toHaveBeenCalledWith("p1", { license: "CC-BY-SA" }));
    expect(onSaved).toHaveBeenCalledWith("CC-BY-SA");
  });

  it("keeps Save disabled until the license changes", () => {
    render(<LicenseCard projectId="p1" license="CC-BY" disabled={false} onSaved={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Save license" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /CC BY-NC/ }));
    expect((screen.getByRole("button", { name: "Save license" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("reports a failed save instead of staying silent", async () => {
    patchProject.mockRejectedValue(new Error("boom"));
    render(<LicenseCard projectId="p1" license="CC-BY" disabled={false} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: /CC BY-NC/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save license" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn't save the license/);
  });
});

describe("TagsCard", () => {
  it("loads the tags, saves edits and shows the server-normalized result", async () => {
    getTags.mockResolvedValue(["jazz"]);
    putTags.mockResolvedValue(["jazz", "lo-fi"]);
    render(<TagsCard projectId="p1" disabled={false} />);
    await screen.findByText("#jazz");
    const save = screen.getByRole("button", { name: "Save tags" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    const input = screen.getByRole("textbox", { name: "New tag" });
    fireEvent.change(input, { target: { value: "Lo-Fi" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(putTags).toHaveBeenCalledWith("p1", ["jazz", "lo-fi"]));
    expect(await screen.findByText("Tags saved.")).toBeTruthy();
  });

  it("shows an error with retry when the tags cannot be loaded", async () => {
    getTags.mockRejectedValueOnce(new Error("down"));
    render(<TagsCard projectId="p1" disabled={false} />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn't load the tags/);
    getTags.mockResolvedValue(["x"]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("#x")).toBeTruthy();
  });

  it("is read-only on an archived project", async () => {
    getTags.mockResolvedValue(["jazz"]);
    render(<TagsCard projectId="p1" disabled />);
    await screen.findByText("#jazz");
    expect((screen.getByRole("button", { name: "Remove tag jazz" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
