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

  const edit = (value: string, action: "Enter" | "blur" | "Escape" = "Enter") => {
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value } });
    if (action === "blur") fireEvent.blur(input);
    else fireEvent.keyDown(input, { key: action });
  };

  it("UTCID01 \"Bass\" + Enter or blur → onSetTrackLabel(trackId, \"Bass\") once, editing closed", () => {
    const { clickRenameButton, onSetTrackLabel } = setup();
    clickRenameButton();
    edit("Bass");
    expect(onSetTrackLabel).toHaveBeenCalledTimes(1);
    expect(onSetTrackLabel).toHaveBeenCalledWith("t1", "Bass");
    expect(screen.queryByRole("textbox")).toBeNull();
    cleanup();
    const second = setup();
    second.clickRenameButton();
    edit("Bass", "blur");
    expect(second.onSetTrackLabel).toHaveBeenCalledWith("t1", "Bass");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("UTCID02 \"  Lead  \" → onSetTrackLabel called with \"Lead\" (trimmed)", () => {
    const { clickRenameButton, onSetTrackLabel } = setup();
    clickRenameButton();
    edit("  Lead  ");
    expect(onSetTrackLabel).toHaveBeenCalledWith("t1", "Lead");
  });

  it("UTCID03 1 character → label accepted", () => {
    const { clickRenameButton, onSetTrackLabel } = setup();
    clickRenameButton();
    edit("X");
    expect(onSetTrackLabel).toHaveBeenCalledWith("t1", "X");
  });

  it("UTCID04 50 characters → counter shows 50/50 and the label is accepted", () => {
    const { clickRenameButton, onSetTrackLabel } = setup();
    clickRenameButton();
    const name50 = "A".repeat(50);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: name50 } });
    expect(screen.getByText("50/50")).not.toBeNull();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onSetTrackLabel).toHaveBeenCalledWith("t1", name50);
  });

  it("UTCID05 typing a 51st character → input stops at 50 characters (maxLength)", () => {
    const { clickRenameButton } = setup();
    clickRenameButton();
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.maxLength).toBe(50);
  });

  it("UTCID06 \"\" (empty) + Enter → editing closed, onSetTrackLabel not called, old name kept", () => {
    const { clickRenameButton, onSetTrackLabel } = setup();
    clickRenameButton();
    edit("");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(onSetTrackLabel).not.toHaveBeenCalled();
    expect(screen.getByText("Piano")).not.toBeNull();
  });

  it("UTCID07 \"   \" (spaces only) + Enter → onSetTrackLabel not called, old name kept", () => {
    const { clickRenameButton, onSetTrackLabel } = setup();
    clickRenameButton();
    edit("   ");
    expect(onSetTrackLabel).not.toHaveBeenCalled();
    expect(screen.getByText("Piano")).not.toBeNull();
  });

  it("UTCID08 \"New name\" + Escape → editing closed, onSetTrackLabel not called", () => {
    const { clickRenameButton, onSetTrackLabel } = setup();
    clickRenameButton();
    edit("New name", "Escape");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(onSetTrackLabel).not.toHaveBeenCalled();
  });

  it("clicking the rename button enters editing mode with the current name", () => {
    const { clickRenameButton } = setup();
    clickRenameButton();
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Piano");
  });
});

describe("FE-EDT-17 TrackPanel pan control", () => {
  beforeEach(() => setLang("en"));
  afterEach(() => cleanup());

  it("UTCID08 (A): double-clicking the pan slider returns the track to centre; a single change sets the pan", () => {
    const onSetTrackPan = vi.fn();
    const track: DraftTrack = {
      id: "t1", name: "Piano", order: 0, color: "#6366f1", muted: false, solo: false, volume: 1, pan: -0.5, instrument: null,
    };
    render(
      <TrackPanel
        tracks={[track]}
        selectedTrackId="t1"
        onSelectTrack={vi.fn()}
        onAddTrack={vi.fn()}
        onToggleMute={vi.fn()}
        onToggleSolo={vi.fn()}
        onDeleteTrack={vi.fn()}
        onAssignInstrument={vi.fn()}
        onSetTrackColor={vi.fn()}
        onSetTrackLabel={vi.fn()}
        onSetTrackVolume={vi.fn()}
        onSetTrackPan={onSetTrackPan}
        canAddTrack={true}
        maxTracks={32}
      />,
    );
    const pan = screen.getByLabelText("Pan track Piano");
    fireEvent.change(pan, { target: { value: "30" } });
    expect(onSetTrackPan).toHaveBeenLastCalledWith("t1", 0.3);
    fireEvent.doubleClick(pan);
    expect(onSetTrackPan).toHaveBeenLastCalledWith("t1", 0);
  });
});
