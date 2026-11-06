import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { setLang } from "../../lib/i18n";
import * as api from "../../lib/api-client";
import { MergeRiskPanel } from "./merge-risk-panel";

vi.mock("../../lib/api-client", () => ({
  getMergeRisk: vi.fn(),
}));

beforeEach(() => {
  setLang("vi");
  vi.mocked(api.getMergeRisk).mockReset();
});

afterEach(() => {
  cleanup();
});

function mockResult(overrides: Partial<Parameters<typeof api.getMergeRisk>[0]> = {}) {
  return {
    level: "low" as const,
    metrics: {
      sourceChanged: 1,
      targetChanged: 1,
      overlap: 0,
      conflictsCount: 0,
      sourceCommits: 1,
      targetCommits: 0,
    },
    explanation: "Hợp nhất đơn giản, ít chồng chéo và không có xung đột.",
    ...overrides,
  };
}

describe("UC-71 MergeRiskPanel", () => {
  it("MRP-01: shows the risk level, all numbers and the explanation", async () => {
    vi.mocked(api.getMergeRisk).mockResolvedValue({
      ...mockResult(),
      level: "high",
      metrics: {
        sourceChanged: 12,
        targetChanged: 8,
        overlap: 6,
        conflictsCount: 7,
        sourceCommits: 15,
        targetCommits: 3,
      },
      explanation: "Hai nhánh sửa cùng khu vực, 7 xung đột.",
    });

    render(
      <MergeRiskPanel
        sourceBranchId="s-1"
        targetBranchId="t-1"
      />,
    );

    const panel = await screen.findByTestId("merge-risk-panel");
    const text = panel.textContent ?? "";
    expect(panel.dataset.level).toBe("high");
    expect(text).toContain("Rủi ro hợp nhất");
    expect(text).toContain("Cao");
    expect(text).toContain("12");
    expect(text).toContain("8");
    expect(text).toContain("7");
    expect(text).toContain("15");
    expect(text).toContain("3");
    expect(text).toContain("Hai nhánh sửa cùng khu vực, 7 xung đột.");
  });

  it("MRP-02: hides the panel when loading fails so merge still works", async () => {
    vi.mocked(api.getMergeRisk).mockRejectedValue(new Error("nope"));

    render(
      <MergeRiskPanel
        sourceBranchId="s-1"
        targetBranchId="t-1"
      />,
    );

    await waitFor(() =>
      expect(
        document.querySelector('[data-testid="merge-risk-panel"]'),
      ).toBeNull(),
    );
  });

  it("MRP-03: when explanation is null, only the numbers are shown", async () => {
    vi.mocked(api.getMergeRisk).mockResolvedValue({
      ...mockResult(),
      level: "medium",
      explanation: null,
    });

    render(
      <MergeRiskPanel
        sourceBranchId="s-1"
        targetBranchId="t-1"
      />,
    );

    const panel = await screen.findByTestId("merge-risk-panel");
    expect(panel.dataset.level).toBe("medium");
    const text = panel.textContent ?? "";
    expect(text).toContain("Vừa");
    // Không có đoạn giải thích
    expect(text).not.toContain("Hợp nhất đơn giản");
  });
});
