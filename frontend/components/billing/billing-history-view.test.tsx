import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { EffectiveSubscription, SubscriptionPlan, TransactionHistoryItem } from "@stave/shared-types";
import { BillingHistoryView } from "./billing-history-view";
import { getMySubscription, listTransactions } from "@/lib/api-billing";
import { I18nProvider } from "@/context/i18n-context";
import { setLang } from "@/lib/i18n";

vi.mock("@/lib/api-billing", () => ({
  getMySubscription: vi.fn(),
  listTransactions: vi.fn(),
  reportPaymentIssue: vi.fn(),
}));

const PLUS: SubscriptionPlan = {
  id: "plus",
  name: "STAVE+",
  description: "",
  priceVnd: 49000,
  features: {},
  isActive: true,
  isDefault: false,
  sortOrder: 1,
  priceEffectiveAt: null,
};

const subscription: EffectiveSubscription = {
  plan: PLUS,
  status: "active",
  currentPeriodEnd: "2026-12-06T10:00:00.000Z",
  graceUntil: null,
  cancelAtPeriodEnd: false,
  pendingPlan: null,
  hasPaidAccess: true,
  inGrace: false,
};

const item = (overrides: Partial<TransactionHistoryItem>): TransactionHistoryItem => ({
  id: "tx-1",
  createdAt: "2026-11-06T10:00:00.000Z",
  description: "STAVE+ subscription",
  amountVnd: 49000,
  kind: "charge",
  displayStatus: "success",
  planName: "STAVE+",
  retryOf: null,
  hasOpenIssue: false,
  ...overrides,
});

beforeEach(() => {
  vi.mocked(getMySubscription).mockResolvedValue(subscription);
  vi.mocked(listTransactions).mockResolvedValue({
    items: [item({}), item({ id: "tx-2", displayStatus: "failed", kind: "refund", hasOpenIssue: true })],
    nextCursor: null,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  setLang("en");
});

describe("BillingHistoryView", () => {
  it("shows the history in Vietnamese", async () => {
    setLang("vi");
    render(<BillingHistoryView />);

    expect(await screen.findByRole("heading", { name: "Thanh toán" })).toBeDefined();
    expect(await screen.findByText("Gói hiện tại: STAVE+")).toBeDefined();
    expect(await screen.findAllByText("Thành công")).not.toHaveLength(0);
    expect(screen.getByText("Thất bại")).toBeDefined();
    expect(screen.getByText("Hoàn tiền")).toBeDefined();
    expect(screen.getByText("Biên lai")).toBeDefined();
    expect(screen.getByText("Đã có sự cố đang xử lý")).toBeDefined();
  });

  it("shows the history in English", async () => {
    setLang("en");
    render(<BillingHistoryView />);

    expect(await screen.findByRole("heading", { name: "Billing" })).toBeDefined();
    expect(await screen.findByText("Current plan: STAVE+")).toBeDefined();
    expect(await screen.findByText("Succeeded")).toBeDefined();
    expect(screen.getByText("Failed")).toBeDefined();
    expect(screen.getByText("Refund")).toBeDefined();
    expect(screen.getByText("Receipt")).toBeDefined();
    expect(screen.getByText("Issue under review")).toBeDefined();
    expect(screen.getByText("Next payment: Dec 6, 2026.")).toBeDefined();
  });

  it("opens the report dialog in the selected language", async () => {
    setLang("en");
    render(<BillingHistoryView />);

    fireEvent.click(await screen.findByRole("button", { name: "Report an issue" }));

    expect(await screen.findByRole("dialog")).toBeDefined();
    expect(screen.getByText("Report a payment issue")).toBeDefined();
    expect(screen.getByText("Send issue")).toBeDefined();
  });

  it("shows an empty state when there are no transactions", async () => {
    setLang("en");
    vi.mocked(listTransactions).mockResolvedValue({ items: [], nextCursor: null });
    render(<BillingHistoryView />);

    expect(await screen.findByText("No transactions yet")).toBeDefined();
  });

  it("shows a translated error with a retry button when the list fails", async () => {
    setLang("en");
    vi.mocked(listTransactions).mockRejectedValue(new Error("boom"));
    render(<BillingHistoryView />);

    expect(await screen.findByText("Couldn't load the transaction history.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
  });

  it("re-translates a stored load error when the language changes", async () => {
    setLang("en");
    vi.mocked(listTransactions).mockRejectedValue(new Error("boom"));
    render(
      <I18nProvider>
        <BillingHistoryView />
      </I18nProvider>,
    );

    expect(await screen.findByText("Couldn't load the transaction history.")).toBeDefined();

    act(() => setLang("vi"));

    expect(await screen.findByText("Không tải được lịch sử giao dịch.")).toBeDefined();
    expect(screen.queryByText("Couldn't load the transaction history.")).toBeNull();
  });
});
