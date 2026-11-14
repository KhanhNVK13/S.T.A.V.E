import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminPlansPage from "./page";
import { changeAdminPlanFeatures, listAdminPlans, type AdminPlanItem } from "../../../lib/api-admin-plans";
import { setLang } from "../../../lib/i18n";

vi.mock("../../../lib/api-admin-plans", () => ({
  listAdminPlans: vi.fn(),
  createAdminPlan: vi.fn(),
  changeAdminPlanPrice: vi.fn(),
  changeAdminPlanFeatures: vi.fn(),
  setAdminPlanActive: vi.fn(),
}));

function plan(over: Partial<AdminPlanItem> = {}): AdminPlanItem {
  return {
    id: "p1",
    name: "STAVE Plus",
    description: "",
    priceVnd: 49000,
    features: { theme_from_image: true, extra_storage: false, extra_storage_mb: 100 },
    isActive: true,
    isDefault: false,
    sortOrder: 1,
    priceEffectiveAt: null,
    featuresEffectiveAt: null,
    subscriberCount: 3,
    ...over,
  };
}

beforeEach(() => {
  setLang("en");
  vi.mocked(listAdminPlans).mockResolvedValue([
    plan(),
    plan({ id: "free", name: "Free", isDefault: true, priceVnd: 0 }),
  ]);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("FE-APL-01 AdminPlansPage FeaturesDialog (edit plan features)", () => {
  it("UTCID01 shows the scheduled effective date and disables editing the default plan", async () => {
    vi.mocked(listAdminPlans).mockResolvedValue([
      plan({ featuresEffectiveAt: "2026-12-01T00:00:00Z" }),
      plan({ id: "free", name: "Free", isDefault: true }),
    ]);
    render(<AdminPlansPage />);
    await screen.findByText("STAVE Plus");
    expect(screen.getByText(/Features change on/)).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: "Edit features" }) as HTMLButtonElement[];
    expect(buttons[0].disabled).toBe(false);
    expect(buttons[1].disabled).toBe(true);
  });

  it("UTCID02 asks for confirmation before saving, then sends the features and the effective date", async () => {
    vi.mocked(changeAdminPlanFeatures).mockResolvedValue(plan());
    render(<AdminPlansPage />);
    await screen.findByText("STAVE Plus");
    fireEvent.click(screen.getAllByRole("button", { name: "Edit features" })[0]);
    fireEvent.click(await screen.findByLabelText("Extra storage", { selector: 'input[type="checkbox"]' }));
    fireEvent.click(screen.getByRole("button", { name: "Schedule feature change" }));
    expect(changeAdminPlanFeatures).not.toHaveBeenCalled();
    await screen.findByText("Confirm the feature change");
    const confirm = screen.getAllByRole("button", { name: "Schedule feature change" }).at(-1)!;
    fireEvent.click(confirm);
    await waitFor(() => expect(changeAdminPlanFeatures).toHaveBeenCalled());
    const [id, features, effectiveAt] = vi.mocked(changeAdminPlanFeatures).mock.calls[0];
    expect(id).toBe("p1");
    expect(features).toEqual({ theme_from_image: true, extra_storage: true, extra_storage_mb: 100 });
    expect(new Date(effectiveAt).getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 3600 * 1000);
  });

  it("UTCID03 an effective date earlier than the notice period shows an error and does not call the API", async () => {
    render(<AdminPlansPage />);
    await screen.findByText("STAVE Plus");
    fireEvent.click(screen.getAllByRole("button", { name: "Edit features" })[0]);
    const input = (await screen.findByLabelText("Effective from")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2020-01-01T00:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Schedule feature change" }));
    await screen.findByRole("alert");
    expect(changeAdminPlanFeatures).not.toHaveBeenCalled();
  });
  it("UTCID04 the dialog opens with the features the plan currently grants", async () => {
    render(<AdminPlansPage />);
    await screen.findByText("STAVE Plus");
    fireEvent.click(screen.getAllByRole("button", { name: "Edit features" })[0]);
    const extra = (await screen.findByLabelText("Extra storage", { selector: 'input[type="checkbox"]' })) as HTMLInputElement;
    expect(extra.checked).toBe(false);
    expect((screen.getByLabelText("Extra storage (MB)", { exact: false, selector: 'input[type="number"]' }) as HTMLInputElement).value).toBe("100");
  });

  it("UTCID05 extra storage outside the allowed range is refused without calling the API", async () => {
    render(<AdminPlansPage />);
    await screen.findByText("STAVE Plus");
    fireEvent.click(screen.getAllByRole("button", { name: "Edit features" })[0]);
    const storage = (await screen.findByLabelText("Extra storage (MB)", { exact: false, selector: 'input[type="number"]' })) as HTMLInputElement;
    fireEvent.change(storage, { target: { value: "102401" } });
    fireEvent.click(screen.getByRole("button", { name: "Schedule feature change" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/whole number from 0 to 102400/);
    expect(changeAdminPlanFeatures).not.toHaveBeenCalled();
  });

  it("UTCID06 Cancel in the confirmation step schedules nothing", async () => {
    render(<AdminPlansPage />);
    await screen.findByText("STAVE Plus");
    fireEvent.click(screen.getAllByRole("button", { name: "Edit features" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Schedule feature change" }));
    await screen.findByText("Confirm the feature change");
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" }).at(-1)!);
    await waitFor(() => expect(screen.queryByText("Confirm the feature change")).toBeNull());
    expect(changeAdminPlanFeatures).not.toHaveBeenCalled();
  });

  it("UTCID07 a failed save shows the error in the dialog and keeps the existing features", async () => {
    vi.mocked(changeAdminPlanFeatures).mockRejectedValue(new Error("boom"));
    render(<AdminPlansPage />);
    await screen.findByText("STAVE Plus");
    fireEvent.click(screen.getAllByRole("button", { name: "Edit features" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Schedule feature change" }));
    await screen.findByText("Confirm the feature change");
    fireEvent.click(screen.getAllByRole("button", { name: "Schedule feature change" }).at(-1)!);
    expect(await screen.findByText("Couldn't schedule the feature change.")).toBeTruthy();
    expect(screen.queryByText("Confirm the feature change")).toBeNull();
  });
});
