import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  requestModerationTriage,
  type ModerationTriageResult,
} from "../../lib/api-moderation-triage";
import { setLang } from "../../lib/i18n";
import { ModerationTriagePanel } from "./moderation-triage-panel";

vi.mock("../../lib/api-moderation-triage", () => ({
  requestModerationTriage: vi.fn(),
}));

const P1 = "33333333-3333-4333-8333-333333333333";

function triageResult(
  over: Partial<ModerationTriageResult> = {},
): ModerationTriageResult {
  return {
    priority: "high",
    categories: ["copyright_claim", "spam"],
    summary: "Two reports allege unauthorized reuse of a commercial track.",
    recommendedCheck: "Compare project tracks against the submitted copyright evidence.",
    explanationSource: "ai",
    metrics: {
      reportCount: 2,
      reporterCount: 2,
      hasCopyrightClaim: true,
      reasonCounts: {
        copyright: 1,
        inappropriate: 0,
        spam: 1,
        harassment: 0,
        other: 0,
      },
    },
    ...over,
  };
}

beforeEach(() => {
  setLang("en");
  vi.mocked(requestModerationTriage).mockReset();
});

afterEach(() => {
  cleanup();
});

describe("ModerationTriagePanel", () => {
  it("shows loading state initially and renders AI priority, categories, summary, recommendedCheck, and disclaimer", async () => {
    let resolve: (value: ModerationTriageResult) => void = () => {};
    vi.mocked(requestModerationTriage).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    render(<ModerationTriagePanel projectId={P1} status="open" />);

    expect(screen.getByRole("status").textContent).toContain(
      "Analyzing reports for triage…",
    );

    resolve(triageResult());

    expect(
      await screen.findByText(
        "Two reports allege unauthorized reuse of a commercial track.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("High priority").className).toContain("bg-danger-muted");
    expect(screen.getByText("Copyright claim")).toBeTruthy();
    expect(screen.getByText("Spam")).toBeTruthy();
    expect(
      screen.getByText(
        "Compare project tracks against the submitted copyright evidence.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("AI assists triage only; Admin makes the final decision."),
    ).toBeTruthy();
    expect(requestModerationTriage).toHaveBeenCalledWith({
      projectId: P1,
      status: "open",
      lang: "en",
    });
  });

  it("maps medium priority to warning badge and low priority to neutral badge", async () => {
    vi.mocked(requestModerationTriage).mockResolvedValueOnce(
      triageResult({ priority: "medium", categories: ["abusive_language"] }),
    );
    const { rerender } = render(
      <ModerationTriagePanel projectId={P1} status="open" />,
    );
    expect((await screen.findByText("Medium priority")).className).toContain(
      "bg-warning-muted",
    );

    vi.mocked(requestModerationTriage).mockResolvedValueOnce(
      triageResult({ priority: "low", categories: ["other"] }),
    );
    rerender(
      <ModerationTriagePanel
        projectId="44444444-4444-4444-8444-444444444444"
        status="open"
      />,
    );
    expect((await screen.findByText("Low priority")).className).toContain(
      "bg-foreground/10",
    );
  });

  it("shows clear rule-only fallback notice when summary is null", async () => {
    vi.mocked(requestModerationTriage).mockResolvedValue(
      triageResult({
        priority: "medium",
        categories: ["inappropriate_content"],
        summary: null,
        recommendedCheck: null,
        explanationSource: "rule",
      }),
    );

    render(<ModerationTriagePanel projectId={P1} status="open" />);

    const fallback = await screen.findByTestId("triage-rule-fallback");
    expect(fallback.textContent).toContain("Rule-based baseline only");
    expect(screen.getByText("Rule baseline")).toBeTruthy();
    expect(screen.getByText("Medium priority")).toBeTruthy();
    expect(screen.getByText("Inappropriate content")).toBeTruthy();
    expect(
      screen.getByText("AI assists triage only; Admin makes the final decision."),
    ).toBeTruthy();
  });

  it("regenerates triage when clicking Regenerate and supports error retry", async () => {
    vi.mocked(requestModerationTriage)
      .mockRejectedValueOnce(new Error("network fail"))
      .mockResolvedValueOnce(
        triageResult({ summary: "First generated summary." }),
      )
      .mockResolvedValueOnce(
        triageResult({ summary: "Regenerated summary." }),
      );

    render(<ModerationTriagePanel projectId={P1} status="open" />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not run moderation triage.");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("First generated summary.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(await screen.findByText("Regenerated summary.")).toBeTruthy();
    await waitFor(() => expect(requestModerationTriage).toHaveBeenCalledTimes(3));
  });

  it("renders Vietnamese copy when lang is pinned to vi and calls onClose", async () => {
    setLang("vi");
    const onClose = vi.fn();
    vi.mocked(requestModerationTriage).mockResolvedValue(
      triageResult({
        summary: "Có 2 báo cáo về bản quyền.",
        recommendedCheck: "Kiểm tra bằng chứng bản quyền.",
      }),
    );

    render(
      <ModerationTriagePanel projectId={P1} status="open" onClose={onClose} />,
    );

    expect(await screen.findByText("Có 2 báo cáo về bản quyền.")).toBeTruthy();
    expect(screen.getByText("Ưu tiên cao")).toBeTruthy();
    expect(
      screen.getByText(
        "AI chỉ hỗ trợ phân loại; Quản trị viên đưa ra quyết định cuối cùng.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Đóng phân loại" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
