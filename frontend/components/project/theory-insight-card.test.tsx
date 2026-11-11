import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { setLang } from "../../lib/i18n";
import * as api from "../../lib/api-client";
import { TheoryInsightCard } from "./theory-insight-card";

vi.mock("../../lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api-client")>()),
  getTheoryInsight: vi.fn(),
}));

beforeEach(() => {
  setLang("vi");
  vi.mocked(api.getTheoryInsight).mockReset();
});

afterEach(() => {
  cleanup();
});

const full: api.TheoryInsightResult = {
  tonality: { tonic: "C", mode: "major", confidence: 0.9 },
  chords: [
    { bar: 1, chord: "C" },
    { bar: 2, chord: null },
  ],
  truncated: false,
  explanation: "Bản nhạc ở giọng Đô trưởng.",
};

describe("TheoryInsightCard", () => {
  it("TI-01: shows key, confidence in words, chords per bar and the labelled suggestion", async () => {
    vi.mocked(api.getTheoryInsight).mockResolvedValue(full);
    render(<TheoryInsightCard projectId="p-1" />);

    expect((await screen.findByTestId("ti-key")).textContent).toBe("C trưởng");
    const card = screen.getByTestId("theory-insight-card");
    const text = card.textContent ?? "";
    expect(text).toContain("Độ tin cậy: Cao");
    expect(screen.getByTestId("ti-chords").textContent).toContain("Ô nhịp 1");
    expect(text).toContain("Không có hợp âm cơ bản");
    expect(text).toContain("Bản nhạc ở giọng Đô trưởng.");
    expect(text).toContain("Gợi ý tự động");
    expect(api.getTheoryInsight).toHaveBeenCalledWith("p-1", "vi", undefined);
  });

  it("TI-02: shows a note and no explanation when the key is unknown", async () => {
    vi.mocked(api.getTheoryInsight).mockResolvedValue({
      tonality: null,
      chords: [{ bar: 1, chord: "Am" }],
      truncated: false,
      explanation: null,
    });
    render(<TheoryInsightCard projectId="p-1" />);

    await screen.findByTestId("ti-chords");
    const text = screen.getByTestId("theory-insight-card").textContent ?? "";
    expect(text).toContain("Chưa đủ nốt để xác định giọng.");
    expect(text).not.toContain("Gợi ý tự động");
  });

  it("TI-03: shows the empty state for a project without notes", async () => {
    vi.mocked(api.getTheoryInsight).mockResolvedValue({
      tonality: null,
      chords: [],
      truncated: false,
      explanation: null,
    });
    render(<TheoryInsightCard projectId="p-1" />);
    expect(await screen.findByText("Thêm vài nốt để xem giọng và hợp âm.")).toBeTruthy();
  });

  it("TI-04: says only the key was analysed when truncated", async () => {
    vi.mocked(api.getTheoryInsight).mockResolvedValue({ ...full, chords: [], truncated: true });
    render(<TheoryInsightCard projectId="p-1" />);
    expect(await screen.findByText("Dự án lớn nên chỉ phân tích giọng.")).toBeTruthy();
  });

  it("TI-05: shows a loading state first", () => {
    vi.mocked(api.getTheoryInsight).mockReturnValue(new Promise(() => {}));
    render(<TheoryInsightCard projectId="p-1" />);
    expect(screen.getByText("Đang phân tích bản nhạc…")).toBeTruthy();
  });

  it("TI-06: shows an alert with Retry on failure and reloads on click", async () => {
    vi.mocked(api.getTheoryInsight).mockRejectedValueOnce(new Error("nope"));
    render(<TheoryInsightCard projectId="p-1" />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Không phân tích được nhạc lý.");

    vi.mocked(api.getTheoryInsight).mockResolvedValue(full);
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect((await screen.findByTestId("ti-key")).textContent).toBe("C trưởng");
    expect(api.getTheoryInsight).toHaveBeenCalledTimes(2);
  });
});
