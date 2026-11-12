import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { setLang } from "../../lib/i18n";
import * as api from "../../lib/api-client";
import { ProjectPreviewButton } from "./preview-button";

const player = vi.hoisted(() => ({
  play: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("../../lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api-client")>()),
  getProjectPreview: vi.fn(),
  recordProjectPlay: vi.fn(),
}));
vi.mock("../../lib/snapshot-player", () => ({
  SnapshotPlayer: vi.fn(() => player),
}));
vi.mock("../../context/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

const snapshot = {
  schemaVersion: 3,
  meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
  tracks: [],
  notes: [{ id: "n", trackId: "t", pitch: 60, start: 0, duration: 480, velocity: 90 }],
} as never;

beforeEach(() => {
  setLang("vi");
  player.play.mockReset();
  player.stop.mockReset();
  vi.mocked(api.getProjectPreview).mockReset();
  vi.mocked(api.recordProjectPlay).mockReset().mockResolvedValue(undefined);
});

afterEach(() => cleanup());

describe("ProjectPreviewButton", () => {
  it("PRV-01: loads the preview, starts playback, then stops on the second click", async () => {
    vi.mocked(api.getProjectPreview).mockResolvedValue({ commitId: "c1", snapshot });
    player.play.mockResolvedValue(true);
    render(<ProjectPreviewButton projectId="p1" projectName="Bài A" />);
    fireEvent.click(screen.getByRole("button", { name: "Nghe thử Bài A" }));
    const stop = await screen.findByRole("button", { name: "Dừng nghe thử Bài A" });
    expect(player.play).toHaveBeenCalledWith(snapshot, expect.any(Map), expect.any(Function));
    expect(api.recordProjectPlay).toHaveBeenCalledWith("p1");
    fireEvent.click(stop);
    expect(player.stop).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Nghe thử Bài A" })).toBeTruthy();
  });

  it("PRV-02: a project without any version shows a message and never plays", async () => {
    vi.mocked(api.getProjectPreview).mockResolvedValue({ commitId: null, snapshot: null });
    render(<ProjectPreviewButton projectId="p1" projectName="Bài A" />);
    fireEvent.click(screen.getByRole("button", { name: "Nghe thử Bài A" }));
    expect(await screen.findByText("Dự án này chưa có phiên bản nào để phát.")).toBeTruthy();
    expect(player.play).not.toHaveBeenCalled();
  });

  it("PRV-03: a failed request is reported, not swallowed", async () => {
    vi.mocked(api.getProjectPreview).mockRejectedValue(new Error("offline"));
    render(<ProjectPreviewButton projectId="p1" projectName="Bài A" />);
    fireEvent.click(screen.getByRole("button", { name: "Nghe thử Bài A" }));
    expect(await screen.findByText("Chưa phát được dự án này. Hãy thử lại.")).toBeTruthy();
  });

  it("PRV-04: the owner's own plays are not counted", async () => {
    vi.mocked(api.getProjectPreview).mockResolvedValue({ commitId: "c1", snapshot });
    player.play.mockResolvedValue(true);
    render(<ProjectPreviewButton projectId="p1" projectName="Bài A" countPlay={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Nghe thử Bài A" }));
    await screen.findByRole("button", { name: "Dừng nghe thử Bài A" });
    await waitFor(() => expect(player.play).toHaveBeenCalled());
    expect(api.recordProjectPlay).not.toHaveBeenCalled();
  });
});

describe("ProjectPreviewButton on a private project", () => {
  it("PRV-05: asks the member endpoint and never counts a play", async () => {
    vi.mocked(api.getProjectPreview).mockResolvedValue({ commitId: "c1", snapshot });
    player.play.mockResolvedValue(true);
    render(<ProjectPreviewButton projectId="p1" projectName="Bài A" isPublic={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Nghe thử Bài A" }));
    await screen.findByRole("button", { name: "Dừng nghe thử Bài A" });
    expect(api.getProjectPreview).toHaveBeenCalledWith("p1", false);
    expect(api.recordProjectPlay).not.toHaveBeenCalled();
  });
});
