import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { setLang } from "../../lib/i18n";
import type { AudioSketch } from "../../lib/api-client";
import * as audioToMidi from "../../lib/audio-to-midi";
import { AudioToMidiDialog } from "./audio-to-midi-dialog";

vi.mock("../../lib/audio-to-midi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/audio-to-midi")>()),
  resampleAudioForBasicPitch: vi.fn(),
  runBasicPitchInference: vi.fn(),
  extractMidiNotesFromFrames: vi.fn(),
  fetchAndDecodeAudio: vi.fn(),
}));

function fakeBuffer(duration = 10): AudioBuffer {
  return {
    duration,
    sampleRate: 44100,
    numberOfChannels: 1,
    length: Math.round(duration * 44100),
  } as AudioBuffer;
}

function fakeSketch(over: Partial<AudioSketch> = {}): AudioSketch {
  return {
    id: "sk-1",
    project_id: "proj-1",
    created_by: "user-1",
    name: "Hum hook",
    file_url: "proj-1/sk-1.wav",
    duration_sec: 12,
    size_bytes: 500_000,
    trim_start_sec: 2,
    trim_end_sec: 8,
    created_at: "2026-11-01T00:00:00Z",
    playbackUrl: "https://example.test/sk-1.wav",
    ...over,
  };
}

const RAW_STUB: audioToMidi.RawBasicPitchFrames = {
  frames: [[0.5]],
  onsets: [[0.6]],
  contours: [[0.2]],
};

beforeEach(() => {
  setLang("en");
  vi.mocked(audioToMidi.resampleAudioForBasicPitch).mockReset().mockResolvedValue(fakeBuffer(6));
  vi.mocked(audioToMidi.runBasicPitchInference).mockReset().mockResolvedValue(RAW_STUB);
  vi.mocked(audioToMidi.fetchAndDecodeAudio).mockReset().mockResolvedValue(fakeBuffer(12));
  vi.mocked(audioToMidi.extractMidiNotesFromFrames).mockReset().mockImplementation((_raw, opts) => {
    if ((opts.onsetThreshold ?? 0.5) >= 0.75) return [];
    return [
      { id: "n1", pitch: 48, start: 0, duration: 240, velocity: 90 }, // C3
      { id: "n2", pitch: 67, start: 240, duration: 240, velocity: 95 }, // G4
    ];
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AudioToMidiDialog", () => {
  it("shows progress during inference, caches raw frames, and displays summary metrics", async () => {
    let resolveInference!: (val: audioToMidi.RawBasicPitchFrames) => void;
    vi.mocked(audioToMidi.runBasicPitchInference).mockImplementation(
      (_mono, onProgress) =>
        new Promise((resolve) => {
          onProgress?.(40);
          resolveInference = resolve;
        }),
    );

    render(
      <AudioToMidiDialog
        open
        onClose={vi.fn()}
        buffer={fakeBuffer(10)}
        trim={{ start: 1, end: 7 }}
        tempo={120}
        ppq={480}
        canAddTrack
        defaultTrackName="Vocal sketch"
        onConfirm={vi.fn()}
      />,
    );

    const progressbar = await screen.findByRole("progressbar");
    expect(progressbar.getAttribute("aria-valuenow")).toBe("40");
    expect(screen.getByText("40%")).toBeTruthy();

    resolveInference(RAW_STUB);

    expect(await screen.findByTestId("a2m-note-count")).toBeTruthy();
    expect(screen.getByTestId("a2m-note-count").textContent).toBe("2");
    expect(screen.getByTestId("a2m-pitch-range").textContent).toBe("C3–G4");
    expect(screen.getByTestId("a2m-analyzed-duration").textContent).toBe("6.0s");
    expect(screen.queryByText(/UC-|BR-/)).toBeNull();
  });

  it("re-runs only extractMidiNotesFromFrames when tweaking thresholds and quantize grid", async () => {
    render(
      <AudioToMidiDialog
        open
        onClose={vi.fn()}
        buffer={fakeBuffer(8)}
        trim={{ start: 0, end: 8 }}
        tempo={120}
        ppq={480}
        canAddTrack
        defaultTrackName="Lead"
        onConfirm={vi.fn()}
      />,
    );

    await screen.findByTestId("a2m-note-count");
    expect(audioToMidi.runBasicPitchInference).toHaveBeenCalledTimes(1);
    expect(audioToMidi.resampleAudioForBasicPitch).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Onset sensitivity"), { target: { value: "0.75" } });
    expect(screen.getByTestId("a2m-note-count").textContent).toBe("0");
    expect(
      (screen.getByRole("button", { name: "Add to Piano Roll" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.change(screen.getByLabelText("Onset sensitivity"), { target: { value: "0.4" } });
    fireEvent.click(screen.getByRole("button", { name: "1/8" }));

    expect(screen.getByTestId("a2m-note-count").textContent).toBe("2");
    expect(audioToMidi.runBasicPitchInference).toHaveBeenCalledTimes(1);
    expect(audioToMidi.resampleAudioForBasicPitch).toHaveBeenCalledTimes(1);
    expect(audioToMidi.extractMidiNotesFromFrames).toHaveBeenLastCalledWith(
      RAW_STUB,
      expect.objectContaining({ onsetThreshold: 0.4, quantizeDivision: 8 }),
    );
  });

  it("decodes saved AudioSketch via fetchAndDecodeAudio with its trim range and confirms track creation", async () => {
    const onConfirm = vi.fn();
    render(
      <AudioToMidiDialog
        open
        onClose={vi.fn()}
        sketch={fakeSketch()}
        tempo={120}
        ppq={480}
        canAddTrack
        defaultTrackName="Hum hook"
        onConfirm={onConfirm}
      />,
    );

    await screen.findByTestId("a2m-note-count");
    expect(audioToMidi.fetchAndDecodeAudio).toHaveBeenCalledWith("https://example.test/sk-1.wav");
    expect(audioToMidi.resampleAudioForBasicPitch).toHaveBeenCalledWith(expect.anything(), 2, 8);

    const nameInput = screen.getByLabelText("Track name") as HTMLInputElement;
    expect(nameInput.hasAttribute("minLength")).toBe(false);
    fireEvent.change(nameInput, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Add to Piano Roll" }));
    expect(screen.getByText("Enter a track name.")).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.change(nameInput, { target: { value: "Transcribed Hum" } });
    fireEvent.change(screen.getByLabelText("Instrument"), { target: { value: "Flute" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to Piano Roll" }));

    expect(onConfirm).toHaveBeenCalledWith({
      name: "Transcribed Hum",
      instrument: "Flute",
      notes: [
        { id: "n1", pitch: 48, start: 0, duration: 240, velocity: 90 },
        { id: "n2", pitch: 67, start: 240, duration: 240, velocity: 95 },
      ],
    });
  });

  it("shows error with Retry on failure and disables confirm when !canAddTrack", async () => {
    vi.mocked(audioToMidi.runBasicPitchInference)
      .mockRejectedValueOnce(new Error("Model failed"))
      .mockResolvedValueOnce(RAW_STUB);

    render(
      <AudioToMidiDialog
        open
        onClose={vi.fn()}
        buffer={fakeBuffer(5)}
        trim={{ start: 0, end: 5 }}
        tempo={120}
        ppq={480}
        canAddTrack={false}
        maxTracks={32}
        defaultTrackName="Idea"
        onConfirm={vi.fn()}
      />,
    );

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Model failed")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await screen.findByTestId("a2m-note-count");
    expect(screen.getByText(/32-track limit/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Add to Piano Roll" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
