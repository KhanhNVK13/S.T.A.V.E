import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { EffectiveTheme } from "@stave/shared-types";
import { setLang } from "../../lib/i18n";
import * as billing from "../../lib/api-billing";
import { ThemePresets } from "./theme-presets";

const refresh = vi.fn().mockResolvedValue(undefined);
let currentTheme: EffectiveTheme | null = null;

vi.mock("../../context/theme-context", () => ({
  useTheme: () => ({ theme: currentTheme, loading: false, refresh }),
}));

vi.mock("../../lib/api-billing", () => ({
  setMyPresetTheme: vi.fn(),
  activateSavedCustomTheme: vi.fn(),
}));

function theme(over: Partial<EffectiveTheme>): EffectiveTheme {
  return { type: null, presetKey: null, palette: null, hasPaidAccess: false, ...over };
}

const REUSE = "Dùng lại theme từ ảnh đã lưu";

beforeEach(() => {
  setLang("vi");
  refresh.mockClear();
  vi.mocked(billing.setMyPresetTheme).mockReset().mockResolvedValue(undefined);
  vi.mocked(billing.activateSavedCustomTheme).mockReset().mockResolvedValue({ type: "custom", palette: {} });
  currentTheme = theme({});
});

afterEach(() => cleanup());

describe("ThemePresets", () => {
  it("TPC-01: free users can pick a preset; it saves and reloads the theme", async () => {
    render(<ThemePresets />);
    fireEvent.click(screen.getByTestId("theme-preset-moss"));
    await waitFor(() => expect(billing.setMyPresetTheme).toHaveBeenCalledWith("moss"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("TPC-02: the default is selected when nothing is chosen, and picking it again does nothing", () => {
    render(<ThemePresets />);
    const space = screen.getByTestId("theme-preset-space");
    expect(space.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(space);
    expect(billing.setMyPresetTheme).not.toHaveBeenCalled();
  });

  it("TPC-03: the saved preset is marked selected, an unknown key falls back to default", () => {
    currentTheme = theme({ type: "preset", presetKey: "tide" });
    const { unmount } = render(<ThemePresets />);
    expect(screen.getByTestId("theme-preset-tide").getAttribute("aria-checked")).toBe("true");
    unmount();
    currentTheme = theme({ type: "preset", presetKey: "retired" });
    render(<ThemePresets />);
    expect(screen.getByTestId("theme-preset-space").getAttribute("aria-checked")).toBe("true");
  });

  it("TPC-04: choosing the default sends the space key (clears the palette)", async () => {
    currentTheme = theme({ type: "preset", presetKey: "claret" });
    render(<ThemePresets />);
    fireEvent.click(screen.getByTestId("theme-preset-space"));
    await waitFor(() => expect(billing.setMyPresetTheme).toHaveBeenCalledWith("space"));
  });

  it("TPC-05: replacing an active custom theme asks first and only saves after confirming", async () => {
    currentTheme = theme({ type: "custom", palette: {}, hasPaidAccess: true, hasSavedCustom: true });
    render(<ThemePresets />);
    fireEvent.click(screen.getByTestId("theme-preset-moss"));
    expect(billing.setMyPresetTheme).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Dùng giao diện này" }));
    await waitFor(() => expect(billing.setMyPresetTheme).toHaveBeenCalledWith("moss"));
  });

  it("TPC-06: shows an alert when saving fails", async () => {
    vi.mocked(billing.setMyPresetTheme).mockRejectedValue(new Error("nope"));
    render(<ThemePresets />);
    fireEvent.click(screen.getByTestId("theme-preset-claret"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Không lưu được giao diện màu");
  });

  it("TPC-07: paid users with a saved image theme can switch back to it", async () => {
    currentTheme = theme({ type: "preset", presetKey: "moss", hasPaidAccess: true, hasSavedCustom: true });
    render(<ThemePresets />);
    fireEvent.click(screen.getByRole("button", { name: REUSE }));
    await waitFor(() => expect(billing.activateSavedCustomTheme).toHaveBeenCalled());
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("TPC-09: when the saved theme could not be loaded nothing is marked and the default can still be chosen", async () => {
    currentTheme = null;
    render(<ThemePresets />);
    expect(screen.getByTestId("theme-preset-space").getAttribute("aria-checked")).toBe("false");
    fireEvent.click(screen.getByTestId("theme-preset-space"));
    await waitFor(() => expect(billing.setMyPresetTheme).toHaveBeenCalledWith("space"));
  });

  it("TPC-10: an expired custom theme is not applied, so picking a preset needs no confirmation", async () => {
    currentTheme = theme({ type: "custom", palette: {}, hasPaidAccess: false, hasSavedCustom: true });
    render(<ThemePresets />);
    fireEvent.click(screen.getByTestId("theme-preset-moss"));
    await waitFor(() => expect(billing.setMyPresetTheme).toHaveBeenCalledWith("moss"));
  });

  it("TPC-08: the reuse button is hidden without paid access or without a saved theme", () => {
    currentTheme = theme({ type: "preset", presetKey: "moss", hasPaidAccess: false, hasSavedCustom: true });
    const { unmount } = render(<ThemePresets />);
    expect(screen.queryByRole("button", { name: REUSE })).toBeNull();
    unmount();
    currentTheme = theme({ type: "preset", presetKey: "moss", hasPaidAccess: true, hasSavedCustom: false });
    render(<ThemePresets />);
    expect(screen.queryByRole("button", { name: REUSE })).toBeNull();
  });

  it("TPC-11: only the selected preset is in the tab order", () => {
    currentTheme = theme({ type: "preset", presetKey: "tide" });
    render(<ThemePresets />);
    const radios = screen.getAllByRole("radio");
    const tabbable = radios.filter((r) => r.getAttribute("tabindex") === "0");
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]).toBe(screen.getByTestId("theme-preset-tide"));
  });

  it("TPC-12: arrow keys move focus and choose the next preset, with wrap-around", async () => {
    currentTheme = theme({ type: "preset", presetKey: "tide" });
    render(<ThemePresets />);
    const radios = screen.getAllByRole("radio");
    const tide = screen.getByTestId("theme-preset-tide");
    tide.focus();
    fireEvent.keyDown(tide, { key: "ArrowRight" });
    const expected = radios[(radios.indexOf(tide) + 1) % radios.length];
    expect(document.activeElement).toBe(expected);
    await waitFor(() => expect(billing.setMyPresetTheme).toHaveBeenCalledTimes(1));
  });

  it("TPC-13: Home and End jump to the first and last preset", async () => {
    render(<ThemePresets />);
    const radios = screen.getAllByRole("radio");
    fireEvent.keyDown(radios[0], { key: "End" });
    expect(document.activeElement).toBe(radios[radios.length - 1]);
    await waitFor(() => expect(billing.setMyPresetTheme).toHaveBeenCalled());
    fireEvent.keyDown(radios[1], { key: "Home" });
    expect(document.activeElement).toBe(radios[0]);
  });
});
