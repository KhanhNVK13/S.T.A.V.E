import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TrackPanel } from "./track-panel";
import type { DraftTrack } from "@stave/shared-types";
import { setLang } from "../../../lib/i18n/store";

// ============================================================================
// SHEET: FE-EDT-19 (TrackPanel.commitLabel)
// ============================================================================
describe("FE-EDT-19 TrackPanel.commitLabel", () => {
  beforeEach(() => {
    setLang("vi");
  });
  afterEach(() => {
    cleanup();
  });
  const baseTrack: DraftTrack = {
    id: "t1",
    name: "Piano",
    order: 0,
    color: "#6366f1",
    muted: false,
    solo: false,
    volume: 1,
    pan: 0,
    instrument: null,
  };

  function setup(trackOverrides: Partial<DraftTrack> = {}) {
    const onSetTrackLabel = vi.fn<(id: string, label: string) => void>();
    const onSelectTrack = vi.fn();
    const onAddTrack = vi.fn();
    const onToggleMute = vi.fn();
    const onToggleSolo = vi.fn();
    const onDeleteTrack = vi.fn();
    const onAssignInstrument = vi.fn();
    const onSetTrackColor = vi.fn();
    const onSetTrackVolume = vi.fn();
    const onSetTrackPan = vi.fn();

    const track: DraftTrack = { ...baseTrack, ...trackOverrides };

    const utils = render(
      <TrackPanel
        tracks={[track]}
        selectedTrackId={track.id}
        onSelectTrack={onSelectTrack}
        onAddTrack={onAddTrack}
        onToggleMute={onToggleMute}
        onToggleSolo={onToggleSolo}
        onDeleteTrack={onDeleteTrack}
        onAssignInstrument={onAssignInstrument}
        onSetTrackColor={onSetTrackColor}
        onSetTrackLabel={onSetTrackLabel}
        onSetTrackVolume={onSetTrackVolume}
        onSetTrackPan={onSetTrackPan}
        canAddTrack={true}
        maxTracks={32}
      />,
    );

    const clickRenameButton = () => {
      const btn = screen.getByTitle("Đổi tên track");
      fireEvent.click(btn);
    };

    const getInput = () => screen.getByDisplayValue(track.name) as HTMLInputElement;

    return {
      ...utils,
      onSetTrackLabel,
      clickRenameButton,
      getInput,
    };
  }

  it("UTCID01 clicking rename button enters editing mode with current name", () => {
    const { clickRenameButton } = setup();
    clickRenameButton();
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe("Piano");
  });

  it("UTCID02 typing new name and pressing Enter commits trimmed label", () => {
    const { clickRenameButton, onSetTrackLabel } = setup();
    clickRenameButton();
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Synth Lead" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSetTrackLabel).toHaveBeenCalledWith("t1", "Synth Lead");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("UTCID03 typing new name and triggering blur commits label", () => {
    const { clickRenameButton, onSetTrackLabel } = setup();
    clickRenameButton();
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Acoustic Drums" } });
    fireEvent.blur(input);

    expect(onSetTrackLabel).toHaveBeenCalledWith("t1", "Acoustic Drums");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("UTCID04 typing new name with surrounding whitespace trims before commit", () => {
    const { clickRenameButton, onSetTrackLabel } = setup();
    clickRenameButton();
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "   Electric Bass   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSetTrackLabel).toHaveBeenCalledWith("t1", "Electric Bass");
  });

  it("UTCID05 empty or whitespace-only name does not call onSetTrackLabel", () => {
    const { clickRenameButton, onSetTrackLabel } = setup();
    clickRenameButton();
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSetTrackLabel).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("UTCID06 pressing Escape cancels edit without calling onSetTrackLabel", () => {
    const { clickRenameButton, onSetTrackLabel } = setup();
    clickRenameButton();
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Discarded Name" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onSetTrackLabel).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("UTCID07 accepts and commits name at 50 characters boundary", () => {
    const { clickRenameButton, onSetTrackLabel } = setup();
    clickRenameButton();
    const input = screen.getByRole("textbox");
    const name50 = "A".repeat(50);
    fireEvent.change(input, { target: { value: name50 } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSetTrackLabel).toHaveBeenCalledWith("t1", name50);
  });

  it("UTCID08 input element specifies maxLength of 50", () => {
    const { clickRenameButton } = setup();
    clickRenameButton();
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.maxLength).toBe(50);
  });
});
