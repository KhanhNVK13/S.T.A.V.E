import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PALETTE_KEYS, type EffectiveTheme, type Palette } from "@stave/shared-types";
import { setLang } from "../../lib/i18n";
import * as billing from "../../lib/api-billing";
import { ThemeProvider } from "../../context/theme-context";
import { ThemeFromImage } from "./theme-from-image";

const authValue = { user: { id: "u1" }, profile: { id: "u1" }, loading: false };

vi.mock("../../context/auth-context", () => ({
  useAuth: () => authValue,
}));

vi.mock("../../lib/use-session-ready", () => ({
  useSessionReady: () => true,
}));

vi.mock("../../lib/api-billing", () => ({
  getMyEffectiveTheme: vi.fn(),
  saveMyCustomTheme: vi.fn(),
}));

const previewPalette = paletteOf(0.31, 250);
const oldPalette = paletteOf(0.12, 30);

vi.mock("../../lib/load-image-pixels", () => ({
  loadImagePixels: vi.fn().mockResolvedValue([{ r: 1, g: 2, b: 3 }]),
}));

vi.mock("../../lib/theme-from-image", async () => {
  const actual = await vi.importActual<typeof import("../../lib/theme-from-image")>(
    "../../lib/theme-from-image",
  );
  return { ...actual, extractPalette: vi.fn(() => previewPalette) };
});

function paletteOf(lightness: number, hue: number): Palette {
  return Object.fromEntries(
    PALETTE_KEYS.map((key, i) => [key, `oklch(${(lightness + i / 100).toFixed(2)} 0.02 ${hue})`]),
  ) as Palette;
}

function customTheme(palette: Palette): EffectiveTheme {
  return { type: "custom", presetKey: null, palette, hasPaidAccess: true, hasSavedCustom: true };
}

function readVars(): Record<string, string> {
  const root = document.documentElement;
  return Object.fromEntries(PALETTE_KEYS.map((key) => [key, root.style.getPropertyValue(key)]));
}

function Harness({ show }: { show: boolean }) {
  return <ThemeProvider>{show && <ThemeFromImage />}</ThemeProvider>;
}

async function previewAndSave(save: () => Promise<unknown>) {
  vi.mocked(billing.saveMyCustomTheme).mockImplementation(save as never);
  const view = render(<Harness show />);
  await waitFor(() => expect(readVars()).toEqual(oldPalette));
  const input = screen.getByLabelText(/./, { selector: 'input[type="file"]' });
  const file = new File(["x"], "pic.png", { type: "image/png" });
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
  await waitFor(() => expect(readVars()).toEqual(previewPalette));
  return view;
}

beforeEach(() => {
  setLang("vi");
  vi.mocked(billing.getMyEffectiveTheme).mockReset().mockResolvedValue(customTheme(oldPalette));
  vi.mocked(billing.saveMyCustomTheme).mockReset();
});

afterEach(() => {
  cleanup();
  for (const key of PALETTE_KEYS) document.documentElement.style.removeProperty(key);
});

describe("ThemeFromImage khi rời trang quanh lúc lưu", () => {
  it("TFI-01: lưu thành công rồi tháo component thì giữ palette mới, không áp lại theme cũ", async () => {
    await previewAndSave(async () => {
      vi.mocked(billing.getMyEffectiveTheme).mockResolvedValue(customTheme(previewPalette));
      return { type: "custom", palette: previewPalette };
    });
    fireEvent.click(screen.getByRole("button", { name: /Áp dụng và lưu/ }));
    await waitFor(() => expect(billing.saveMyCustomTheme).toHaveBeenCalled());
    await waitFor(() => expect(billing.getMyEffectiveTheme).toHaveBeenCalledTimes(2));
    await act(async () => {});

    cleanup();
    expect(readVars()).toEqual(previewPalette);
  });

  it("TFI-02: rời trang khi yêu cầu lưu còn đang chạy, lưu xong thì palette mới được áp lại", async () => {
    let finishSave: (value: unknown) => void = () => undefined;
    const { rerender } = await previewAndSave(
      () => new Promise((resolve) => (finishSave = resolve)),
    );
    fireEvent.click(screen.getByRole("button", { name: /Áp dụng và lưu/ }));
    await waitFor(() => expect(billing.saveMyCustomTheme).toHaveBeenCalled());

    rerender(<Harness show={false} />);
    expect(readVars()).toEqual(oldPalette);

    vi.mocked(billing.getMyEffectiveTheme).mockResolvedValue(customTheme(previewPalette));
    await act(async () => {
      finishSave({ type: "custom", palette: previewPalette });
    });
    await waitFor(() => expect(readVars()).toEqual(previewPalette));
  });

  it("TFI-03: rời trang khi chưa lưu thì trả về theme đã lưu", async () => {
    const { rerender } = await previewAndSave(async () => ({}));
    rerender(<Harness show={false} />);
    expect(readVars()).toEqual(oldPalette);
  });
});
