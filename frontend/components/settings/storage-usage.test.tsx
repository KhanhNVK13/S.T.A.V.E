import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { StorageUsage } from "@stave/shared-types";
import { setLang } from "../../lib/i18n";
import { I18nProvider } from "../../context/i18n-context";
import * as api from "../../lib/api-client";
import { StorageUsageSection } from "./storage-usage";

vi.mock("../../lib/api-client", () => ({ getStorageUsage: vi.fn() }));

const getUsage = vi.mocked(api.getStorageUsage);
const MB = 1024 * 1024;

function usage(overrides: Partial<StorageUsage> = {}): StorageUsage {
  return {
    plan: { name: "Free", extraStorageBytes: 0 },
    categories: [
      { key: "custom_sounds", usedBytes: 12 * MB, count: 3, quotaBytes: 50 * MB, maxFileBytes: 10 * MB },
      { key: "audio_sketches", usedBytes: 10 * MB, count: 2, quotaBytes: null, maxFileBytes: 20 * MB },
      { key: "avatar", usedBytes: 300000, count: 1, quotaBytes: null, maxFileBytes: 2 * MB },
    ],
    ...overrides,
  };
}

function mount() {
  return render(
    <I18nProvider>
      <StorageUsageSection />
    </I18nProvider>,
  );
}

beforeEach(() => {
  setLang("en");
  getUsage.mockReset().mockResolvedValue(usage());
});

afterEach(cleanup);

describe("FE-STO-01 StorageUsageSection", () => {
  it("UTCID01 shows each category with its usage and per-file limit", async () => {
    mount();
    await screen.findByText("Sound library");
    expect(screen.getByText("12.0 MB of 50.0 MB")).toBeTruthy();
    expect(screen.getByText("Audio sketches")).toBeTruthy();
    expect(screen.getByText("10.0 MB used")).toBeTruthy();
    expect(screen.getByText("Profile picture")).toBeTruthy();
    expect(screen.getByText(/3 files · Up to 10\.0 MB per file/)).toBeTruthy();
    expect(screen.getByText(/1 file · Up to 2\.0 MB per file/)).toBeTruthy();
  });

  it("UTCID02 only the capped category has a progress bar", async () => {
    mount();
    await screen.findByText("Sound library");
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(1);
    expect(bars[0].getAttribute("aria-valuenow")).toBe("24");
  });

  it("UTCID03 a paid plan shows the extra storage it adds", async () => {
    getUsage.mockResolvedValue(usage({ plan: { name: "STAVE+", extraStorageBytes: 2048 * MB } }));
    mount();
    await screen.findByText("Your plan: STAVE+ · 2.0 GB extra storage");
  });

  it("UTCID04 the free plan shows no extra storage", async () => {
    mount();
    await screen.findByText("Your plan: Free");
  });

  it("UTCID05 a failed load says so and retry loads again", async () => {
    getUsage.mockRejectedValueOnce(new Error("boom"));
    mount();
    await screen.findByText("Could not load your storage usage.");
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Sound library");
    expect(getUsage).toHaveBeenCalledTimes(2);
  });

  it("UTCID06 switching to Vietnamese changes the labels", async () => {
    setLang("vi");
    mount();
    await waitFor(() => expect(screen.getByText("Thư viện âm thanh")).toBeTruthy());
    expect(screen.getByText("Bản thu ý tưởng")).toBeTruthy();
  });
});
