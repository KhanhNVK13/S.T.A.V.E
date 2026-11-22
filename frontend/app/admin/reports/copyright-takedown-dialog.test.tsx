import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CopyrightTakedownContext } from "@stave/shared-types";
import { ApiError } from "../../../lib/api-client";
import { copyrightTakedown, getCopyrightContext } from "../../../lib/admin-reports-api";
import { setLang } from "../../../lib/i18n";
import { I18nProvider } from "../../../context/i18n-context";
import { CopyrightTakedownDialog } from "./copyright-takedown-dialog";

vi.mock("../../../lib/admin-reports-api", () => ({
  getCopyrightContext: vi.fn(),
  copyrightTakedown: vi.fn(),
}));

beforeEach(() => setLang("en"));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const context = (over: Partial<CopyrightTakedownContext> = {}): CopyrightTakedownContext => ({
  claims: [
    {
      reportId: "r1",
      createdAt: "2026-11-20T00:00:00.000Z",
      claimantName: "Nguyen Van A",
      claimantRole: "owner",
      workDescription: "Bài hát Mưa năm 2020",
      evidence: "Bản thảo gốc",
      goodFaith: true,
      accuracy: true,
    },
  ],
  forks: [{ projectId: "f1", name: "Song remix", ownerDisplayName: "Fork Owner" }],
  forksTruncated: false,
  priorTakedowns: 0,
  sounds: [],
  truncated: false,
  retentionDays: 30,
  ...over,
});

function open(onRemoved = vi.fn()) {
  render(
    <I18nProvider>
      <CopyrightTakedownDialog projectId="p1" projectName="Song" onClose={() => {}} onRemoved={onRemoved} />
    </I18nProvider>,
  );
  return onRemoved;
}

const reason = "Copied a commercial track note for note";

describe("CopyrightTakedownDialog", () => {
  it("hiện khiếu nại, danh sách fork kèm chủ và thời hạn lưu giữ", async () => {
    vi.mocked(getCopyrightContext).mockResolvedValue(context());
    open();
    await screen.findByText("Claimant: Nguyen Van A (copyright owner)");
    expect(screen.getByText("Song remix · by Fork Owner")).toBeTruthy();
    expect(screen.getByText(/kept for 30 days/)).toBeTruthy();
    expect(screen.getByText("This owner has no earlier confirmed copyright removal.")).toBeTruthy();
  });

  it("chủ dự án từng bị xác nhận từ 3 lần thì cảnh báo tái phạm", async () => {
    vi.mocked(getCopyrightContext).mockResolvedValue(context({ priorTakedowns: 3 }));
    open();
    await screen.findByText(/Three or more removals/);
  });

  it("lý do quá ngắn thì không gỡ", async () => {
    vi.mocked(getCopyrightContext).mockResolvedValue(context());
    open();
    await screen.findByText(/Claimant/);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "ngắn" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove project and forks" }));
    expect(copyrightTakedown).not.toHaveBeenCalled();
  });

  it("gỡ thành công báo số fork đã gỡ theo", async () => {
    vi.mocked(getCopyrightContext).mockResolvedValue(context());
    vi.mocked(copyrightTakedown).mockResolvedValue({
      closedReports: 1,
      removedSounds: 0,
      removedForks: 1,
      retainUntil: "2026-12-20T00:00:00.000Z",
    });
    const onRemoved = open();
    await screen.findByText(/Claimant/);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: reason } });
    fireEvent.click(screen.getByRole("button", { name: "Remove project and forks" }));
    await waitFor(() => expect(onRemoved).toHaveBeenCalledWith(1));
    expect(copyrightTakedown).toHaveBeenCalledWith("p1", { reason, removeSoundIds: [] });
  });

  it("dự án đã bị gỡ rồi (409) thì báo trong hộp", async () => {
    vi.mocked(getCopyrightContext).mockResolvedValue(context());
    vi.mocked(copyrightTakedown).mockRejectedValue(new ApiError(409, "x"));
    open();
    await screen.findByText(/Claimant/);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: reason } });
    fireEvent.click(screen.getByRole("button", { name: "Remove project and forks" }));
    await screen.findByText("This project was already removed. Reload the list.");
  });

  it("không còn báo cáo bản quyền (403) thì báo và không cho thử lại", async () => {
    vi.mocked(getCopyrightContext).mockRejectedValue(new ApiError(403, "x"));
    open();
    await screen.findByText("This project has no open copyright report any more. Reload the list.");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});
