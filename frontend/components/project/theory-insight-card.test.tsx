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

const fullRuleOnly: api.TheoryInsightResult = {
  tonality: { tonic: "C", mode: "major", confidence: 0.9 },
  alternativeTonality: { tonic: "A", mode: "minor", confidence: 0.82 },
  chords: [
    { bar: 1, chord: "C", roman: "I" },
    { bar: 2, chord: "G7", roman: "V7" },
    { bar: 3, chord: null, roman: null },
  ],
  cadences: [
    {
      type: "half",
      fromBar: 1,
      toBar: 2,
      fromChord: "C",
      toChord: "G7",
      fromRoman: "I",
      toRoman: "V7",
    },
  ],
  profile: {
    tempo: 120,
    timeSignature: [4, 4],
    totalBars: 3,
    totalNotes: 12,
    pitchedTrackCount: 1,
    percussionTrackCount: 0,
    pitchRange: { lowest: "C4", highest: "G5", lowestMidi: 60, highestMidi: 79 },
    averageNotesPerBar: 4,
    densestBar: { bar: 1, noteCount: 5 },
    velocity: { min: 70, max: 110, average: 90 },
    scaleFit: { inScalePercent: 92, outOfScaleCount: 1, accidentalPitchClasses: ["F#"] },
  },
  integrity: {
    duplicateCount: 1,
    overlapCount: 0,
    duplicateSamples: [{ bar: 1, trackName: "Piano", pitchName: "C4" }],
    overlapSamples: [],
  },
  truncated: false,
  explanation: null,
  explanationSource: null,
};

describe("TheoryInsightCard", () => {
  it("loads objective musicology & MIDI 1.0 integrity with explain=false and only calls AI on click", async () => {
    vi.mocked(api.getTheoryInsight)
      .mockResolvedValueOnce(fullRuleOnly)
      .mockResolvedValueOnce({
        ...fullRuleOnly,
        explanation: "Bản nhạc viết ở giọng C trưởng với kết nửa tại ô nhịp 1-2.",
        explanationSource: "ai",
      });

    render(<TheoryInsightCard projectId="p-1" />);

    expect((await screen.findByTestId("ti-key")).textContent).toBe("C trưởng");
    const card = screen.getByTestId("theory-insight-card");
    const text = card.textContent ?? "";
    expect(text).toContain("Krumhansl-Schmuckler · MIDI 1.0");
    expect(text).toContain("r=0.90");
    expect(text).toContain("Ứng viên gần: A thứ");
    expect(screen.getByTestId("ti-chords").textContent).toContain("V7");
    expect(screen.getByTestId("ti-cadences").textContent).toContain("Kết nửa");
    expect(screen.getByTestId("ti-profile").textContent).toContain("C4–G5");
    expect(screen.getByTestId("ti-profile").textContent).toContain("70–110 (TB 90)");
    expect(screen.getByTestId("ti-profile").textContent).toContain("92% trong gam · 1 nốt biến âm (F#)");
    expect(screen.getByTestId("ti-integrity").textContent).toContain("1 nốt trùng hệt thời điểm & cao độ");
    expect(screen.queryByTestId("ti-ai-callout")).toBeNull();
    expect(api.getTheoryInsight).toHaveBeenCalledWith("p-1", "vi", undefined, {
      explain: false,
    });

    fireEvent.click(screen.getByTestId("ti-ai-btn"));
    const callout = await screen.findByTestId("ti-ai-callout");
    expect(api.getTheoryInsight).toHaveBeenNthCalledWith(2, "p-1", "vi", undefined, {
      explain: true,
    });
    expect(callout.textContent).toContain("Bản nhạc viết ở giọng C trưởng");
    expect(callout.textContent).toContain("không phán xét nghệ thuật");
  });

  it("shows empty state and hides AI button when no notes exist", async () => {
    vi.mocked(api.getTheoryInsight).mockResolvedValue({
      tonality: null,
      chords: [],
      truncated: false,
      explanation: null,
    });
    render(<TheoryInsightCard projectId="p-1" />);
    expect(await screen.findByText("Thêm vài nốt để xem giọng và hợp âm.")).toBeTruthy();
    expect(screen.queryByTestId("ti-ai-btn")).toBeNull();
  });

  it("says only the key was analysed when truncated", async () => {
    vi.mocked(api.getTheoryInsight).mockResolvedValue({
      ...fullRuleOnly,
      chords: [],
      truncated: true,
    });
    render(<TheoryInsightCard projectId="p-1" />);
    expect(await screen.findByText("Dự án lớn nên chỉ phân tích giọng.")).toBeTruthy();
  });

  it("shows a loading state first and Retry on failure", async () => {
    vi.mocked(api.getTheoryInsight).mockRejectedValueOnce(new Error("nope"));
    render(<TheoryInsightCard projectId="p-1" />);
    expect(screen.getByText("Đang phân tích bản nhạc…")).toBeTruthy();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Không phân tích được nhạc lý.");

    vi.mocked(api.getTheoryInsight).mockResolvedValue(fullRuleOnly);
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect((await screen.findByTestId("ti-key")).textContent).toBe("C trưởng");
    expect(api.getTheoryInsight).toHaveBeenCalledTimes(2);
  });
});
