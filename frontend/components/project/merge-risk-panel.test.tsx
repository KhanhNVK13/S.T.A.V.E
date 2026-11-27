import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

function mockResult(overrides: Partial<api.MergeRiskResult> = {}): api.MergeRiskResult {
  return {
    level: "low",
    metrics: {
      sourceChanged: 1,
      targetChanged: 1,
      overlap: 0,
      conflictsCount: 0,
      sourceCommits: 1,
      targetCommits: 0,
    },
    explanation: "Hợp nhất đơn giản, ít chồng chéo và không có xung đột.",
    explanationSource: "rule",
    ...overrides,
  };
}

describe("MergeRiskPanel", () => {
  it("loads rule metrics with explain=false and shows low-risk rule note without AI badge", async () => {
    vi.mocked(api.getMergeRisk).mockResolvedValue(mockResult());

    render(<MergeRiskPanel sourceBranchId="s-1" targetBranchId="t-1" />);

    const panel = await screen.findByTestId("merge-risk-panel");
    expect(panel.dataset.level).toBe("low");
    expect(api.getMergeRisk).toHaveBeenCalledWith("s-1", "t-1", "vi", {
      explain: false,
    });
    expect(panel.textContent).toContain("Hợp nhất đơn giản");
    expect(panel.textContent).toContain("Đánh giá quy tắc tự động");
    expect(screen.queryByTestId("merge-risk-ai-btn")).toBeNull();
    expect(screen.queryByTestId("merge-risk-ai-callout")).toBeNull();
  });

  it("shows on-demand AI button for medium/high risk and renders AiCallout on click", async () => {
    vi.mocked(api.getMergeRisk)
      .mockResolvedValueOnce(
        mockResult({
          level: "high",
          metrics: {
            sourceChanged: 12,
            targetChanged: 8,
            overlap: 6,
            conflictsCount: 7,
            sourceCommits: 15,
            targetCommits: 3,
          },
          explanation: null,
          explanationSource: null,
        }),
      )
      .mockResolvedValueOnce(
        mockResult({
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
          explanationSource: "ai",
        }),
      );

    render(<MergeRiskPanel sourceBranchId="s-1" targetBranchId="t-1" />);

    const panel = await screen.findByTestId("merge-risk-panel");
    expect(panel.dataset.level).toBe("high");
    expect(panel.textContent).toContain("Cao");
    expect(screen.queryByTestId("merge-risk-ai-callout")).toBeNull();

    fireEvent.click(screen.getByTestId("merge-risk-ai-btn"));
    const callout = await screen.findByTestId("merge-risk-ai-callout");
    expect(api.getMergeRisk).toHaveBeenNthCalledWith(2, "s-1", "t-1", "vi", {
      explain: true,
    });
    expect(callout.textContent).toContain("AI");
    expect(callout.textContent).toContain("Hai nhánh sửa cùng khu vực, 7 xung đột.");
  });

  it("shows fallback inside AiCallout when AI returns null explanation", async () => {
    vi.mocked(api.getMergeRisk)
      .mockResolvedValueOnce(
        mockResult({
          level: "medium",
          explanation: null,
          explanationSource: null,
        }),
      )
      .mockResolvedValueOnce(
        mockResult({
          level: "medium",
          explanation: null,
          explanationSource: null,
        }),
      );

    render(<MergeRiskPanel sourceBranchId="s-1" targetBranchId="t-1" />);
    const btn = await screen.findByTestId("merge-risk-ai-btn");
    fireEvent.click(btn);

    const callout = await screen.findByTestId("merge-risk-ai-callout");
    expect(callout.textContent).toContain("AI hiện chưa phản hồi");
  });

  it("shows an unavailable note when loading metrics fails and does not block merge", async () => {
    vi.mocked(api.getMergeRisk).mockRejectedValue(new Error("nope"));

    render(<MergeRiskPanel sourceBranchId="s-1" targetBranchId="t-1" />);

    const note = await screen.findByTestId("merge-risk-unavailable");
    expect(note.textContent).toContain("vẫn có thể hợp nhất");
    expect(document.querySelector('[data-testid="merge-risk-panel"]')).toBeNull();
  });
});
