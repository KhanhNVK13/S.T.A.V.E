import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { EffectiveSubscription, PlanListItem, SubscriptionPlan } from "@stave/shared-types";
import { PlansView } from "./plans-view";
import { getMySubscription, listSubscriptionPlans } from "@/lib/api-billing";
import { I18nProvider } from "@/context/i18n-context";
import { setLang } from "@/lib/i18n";

vi.mock("@/lib/api-billing", () => ({
  cancelScheduledDowngrade: vi.fn(),
  cancelSubscription: vi.fn(),
  changePlan: vi.fn(),
  getMySubscription: vi.fn(),
  listSubscriptionPlans: vi.fn(),
  previewCancellation: vi.fn(),
  previewPlanChange: vi.fn(),
  renewSubscription: vi.fn(),
  resumeSubscription: vi.fn(),
  startCheckout: vi.fn(),
}));

const basePlan = (overrides: Partial<SubscriptionPlan>): SubscriptionPlan => ({
  id: "plan",
  name: "Plan",
  description: "",
  priceVnd: 0,
  features: {},
  isActive: true,
  isDefault: false,
  sortOrder: 0,
  priceEffectiveAt: null,
  ...overrides,
});

const FREE: PlanListItem = {
  ...basePlan({ id: "free", name: "Free", isDefault: true }),
  isCurrent: true,
};
const PLUS: PlanListItem = {
  ...basePlan({ id: "plus", name: "STAVE+", priceVnd: 49000, features: { theme_from_image: true } }),
  isCurrent: false,
};

const freeSubscription: EffectiveSubscription = {
  plan: FREE,
  status: "none",
  currentPeriodEnd: null,
  graceUntil: null,
  cancelAtPeriodEnd: false,
  pendingPlan: null,
  hasPaidAccess: false,
  inGrace: false,
};

function renderView() {
  render(<PlansView feature={null} canceled={false} returnTo={null} />);
}

beforeEach(() => {
  vi.mocked(listSubscriptionPlans).mockResolvedValue([FREE, PLUS]);
  vi.mocked(getMySubscription).mockResolvedValue(freeSubscription);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  setLang("en");
});

describe("PlansView", () => {
  it("shows the plans in Vietnamese", async () => {
    setLang("vi");
    renderView();

    expect(await screen.findByRole("heading", { name: "Gói dịch vụ" })).toBeDefined();
    expect(screen.getAllByText("Miễn phí").length).toBeGreaterThan(0);
    expect(screen.getByText("Gói hiện tại")).toBeDefined();
    expect(screen.getByText("Theme tạo từ ảnh")).toBeDefined();
    expect(screen.getByRole("button", { name: "Nâng cấp lên STAVE+" })).toBeDefined();
  });

  it("shows the plans in English with English money formatting", async () => {
    setLang("en");
    renderView();

    expect(await screen.findByRole("heading", { name: "Plans" })).toBeDefined();
    expect(screen.getAllByText("Free").length).toBeGreaterThan(0);
    expect(screen.getByText("Current plan")).toBeDefined();
    expect(screen.getByText("Theme created from an image")).toBeDefined();
    expect(screen.getByText("₫49,000")).toBeDefined();
    expect(screen.getByRole("button", { name: "Upgrade to STAVE+" })).toBeDefined();
  });

  it("explains the payment before leaving the page, in the selected language", async () => {
    setLang("en");
    renderView();

    fireEvent.click(await screen.findByRole("button", { name: "Upgrade to STAVE+" }));

    expect(await screen.findByRole("alertdialog")).toBeDefined();
    expect(screen.getByText(/You'll pay/)).toBeDefined();
    expect(screen.getByText("Continue to payment")).toBeDefined();
    expect(screen.getByText("Not now")).toBeDefined();
  });

  it("shows a translated retry state when the plans cannot be loaded", async () => {
    setLang("en");
    vi.mocked(listSubscriptionPlans).mockRejectedValue(new Error("boom"));
    renderView();

    expect(await screen.findByText("Couldn't load the plans.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
  });

  it("re-translates the load error when the language changes", async () => {
    setLang("en");
    vi.mocked(listSubscriptionPlans).mockRejectedValue(new Error("boom"));
    render(
      <I18nProvider>
        <PlansView feature={null} canceled={false} returnTo={null} />
      </I18nProvider>,
    );

    expect(await screen.findByText("Couldn't load the plans.")).toBeDefined();

    act(() => setLang("vi"));

    expect(await screen.findByText("Không tải được danh sách gói.")).toBeDefined();
    expect(screen.queryByText("Couldn't load the plans.")).toBeNull();
  });
});
