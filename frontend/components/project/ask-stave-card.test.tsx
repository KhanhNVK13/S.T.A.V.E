import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { EffectiveSubscription } from "@stave/shared-types";
import { setLang } from "../../lib/i18n";
import * as billingApi from "../../lib/api-billing";
import * as askApi from "../../lib/api-ask-stave";
import { AskStaveCard } from "./ask-stave-card";

vi.mock("../../lib/api-billing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api-billing")>()),
  getMySubscription: vi.fn(),
}));

vi.mock("../../lib/api-ask-stave", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api-ask-stave")>()),
  askProjectHistory: vi.fn(),
}));

function subscription(hasPaidAccess: boolean): EffectiveSubscription {
  return {
    plan: {
      id: hasPaidAccess ? "plus" : "free",
      name: hasPaidAccess ? "STAVE+" : "Free",
      description: "",
      priceVnd: hasPaidAccess ? 49000 : 0,
      features: hasPaidAccess ? { ask_stave: true } : {},
      isActive: true,
      isDefault: !hasPaidAccess,
      sortOrder: hasPaidAccess ? 1 : 0,
      priceEffectiveAt: null,
    },
    status: hasPaidAccess ? "active" : "none",
    currentPeriodEnd: null,
    graceUntil: null,
    cancelAtPeriodEnd: false,
    pendingPlan: null,
    hasPaidAccess,
    inGrace: false,
  };
}

beforeEach(() => {
  setLang("en");
  vi.mocked(billingApi.getMySubscription).mockReset();
  vi.mocked(askApi.askProjectHistory).mockReset();
});

afterEach(() => {
  cleanup();
});

describe("AskStaveCard", () => {
  it("renders a STAVE+ feature gate with disabled sample pills and /plans link for free users", async () => {
    vi.mocked(billingApi.getMySubscription).mockResolvedValue(subscription(false));

    render(<AskStaveCard projectId="proj-1" />);

    const gate = await screen.findByTestId("ask-stave-gate");
    expect(gate.textContent).toContain("Ask questions about your project's history and theory");

    const upgradeLink = screen.getByRole("link", { name: "Upgrade to STAVE+" });
    expect(upgradeLink.getAttribute("href")).toBe(
      "/plans?feature=ask_stave&returnTo=%2Fprojects%2Fproj-1",
    );

    const comparePill = screen.getByRole("button", { name: "Compare branches" }) as HTMLButtonElement;
    const chordsPill = screen.getByRole("button", { name: "Chords in bars 1–16" }) as HTMLButtonElement;
    const commentsPill = screen.getByRole("button", { name: "Most commented bars" }) as HTMLButtonElement;
    expect(comparePill.disabled).toBe(true);
    expect(chordsPill.disabled).toBe(true);
    expect(commentsPill.disabled).toBe(true);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("submits questions for STAVE+ users and renders grounded answer with localized tool chips", async () => {
    vi.mocked(billingApi.getMySubscription).mockResolvedValue(subscription(true));
    vi.mocked(askApi.askProjectHistory).mockResolvedValue({
      answer: "main and chorus-v2 differ by 4 added notes in bars 3–4.",
      toolsUsed: [
        "list_branches",
        "compare_branches",
        "get_theory_range",
        "summarize_comments",
        "get_recent_commits",
      ],
      rateLimited: false,
    });

    render(<AskStaveCard projectId="proj-1" />);

    const input = (await screen.findByRole("textbox")) as HTMLInputElement;
    expect(input.hasAttribute("minLength")).toBe(false);

    fireEvent.change(input, { target: { value: "  What changed on chorus-v2?  " } });
    fireEvent.click(screen.getByTestId("ask-stave-submit"));

    const callout = await screen.findByTestId("ask-stave-callout");
    expect(askApi.askProjectHistory).toHaveBeenCalledWith(
      "proj-1",
      "What changed on chorus-v2?",
      "en",
    );
    expect(callout.textContent).toContain("main and chorus-v2 differ by 4 added notes in bars 3–4.");

    const tools = screen.getByTestId("ask-stave-tools").textContent ?? "";
    expect(tools).toContain("Branches");
    expect(tools).toContain("Branch diff");
    expect(tools).toContain("Theory & chords");
    expect(tools).toContain("Comments");
    expect(tools).toContain("Recent commits");
    expect(screen.getByTestId("ask-stave-card").textContent).not.toMatch(/\b(?:UC|BR)-\d+\b/);
  });

  it("submits quick-question chips and displays Vietnamese labels when lang is vi", async () => {
    setLang("vi");
    vi.mocked(billingApi.getMySubscription).mockResolvedValue(subscription(true));
    vi.mocked(askApi.askProjectHistory).mockResolvedValue({
      answer: "Giọng chính là C trưởng, ô nhịp 1–4 gồm C, F, G, C.",
      toolsUsed: ["get_theory_range"],
      rateLimited: false,
    });

    render(<AskStaveCard projectId="proj-1" />);

    const chip = await screen.findByRole("button", { name: "Hợp âm ô nhịp 1–16" });
    fireEvent.click(chip);

    const callout = await screen.findByTestId("ask-stave-callout");
    expect(askApi.askProjectHistory).toHaveBeenCalledWith(
      "proj-1",
      "Hợp âm ô nhịp 1–16",
      "vi",
    );
    expect(callout.textContent).toContain("Giọng chính là C trưởng");
    expect(screen.getByTestId("ask-stave-tools").textContent).toContain("Nhạc lý & hợp âm");
  });

  it("validates short input client-side and handles rate-limited and unavailable responses", async () => {
    vi.mocked(billingApi.getMySubscription).mockResolvedValue(subscription(true));
    vi.mocked(askApi.askProjectHistory)
      .mockResolvedValueOnce({ answer: null, toolsUsed: [], rateLimited: true })
      .mockResolvedValueOnce({ answer: null, toolsUsed: [], rateLimited: false });

    render(<AskStaveCard projectId="proj-1" />);

    const input = await screen.findByRole("textbox");
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.click(screen.getByTestId("ask-stave-submit"));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Enter a question of at least 2 characters.",
    );
    expect(askApi.askProjectHistory).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Compare branches" }));
    const rateLimitedCallout = await screen.findByTestId("ask-stave-callout");
    expect(rateLimitedCallout.textContent).toContain(
      "You have reached the Ask STAVE limit (10 questions/minute).",
    );

    fireEvent.click(screen.getByRole("button", { name: "Most commented bars" }));
    const unavailableCallout = await screen.findByTestId("ask-stave-callout");
    expect(unavailableCallout.textContent).toContain(
      "Ask STAVE is temporarily unavailable right now.",
    );
  });

  it("shows a retry button when loading subscription fails", async () => {
    vi.mocked(billingApi.getMySubscription)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(subscription(true));

    render(<AskStaveCard projectId="proj-1" />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("textbox")).toBeTruthy();
  });
});
