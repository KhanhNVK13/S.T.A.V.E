import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { REMOVAL_REASON_MIN_LENGTH, type RemovalImpact } from "@stave/shared-types";
import { RemoveDialog } from "./remove-dialog";
import { getRemovalImpact, removeProject } from "../../../lib/admin-reports-api";
import { ApiError } from "../../../lib/api-client";
import { setLang } from "../../../lib/i18n";

vi.mock("../../../lib/admin-reports-api", () => ({
  getRemovalImpact: vi.fn(),
  removeProject: vi.fn(),
}));

const P1 = "33333333-3333-4333-8333-333333333333";
const KICK = "00000000-0000-4000-8000-000000000001";
const SNARE = "00000000-0000-4000-8000-000000000002";

function impact(over: Partial<RemovalImpact> = {}): RemovalImpact {
  return {
    forkCount: 3,
    retentionDays: 30,
    ownerSounds: [
      { id: KICK, name: "Kick" },
      { id: SNARE, name: "Snare" },
    ],
    ...over,
  };
}

// Each dialog has exactly one textbox (the reason field); query by role so we
// are not affected by the Field error text joining the label.
const reasonBox = () => screen.getByRole("textbox") as HTMLTextAreaElement;
const submitButton = () => screen.getByRole("button", { name: /^Remove project$/ }) as HTMLButtonElement;

function renderDialog(onRemoved?: () => void) {
  return render(<RemoveDialog projectId={P1} onClose={vi.fn()} onRemoved={onRemoved ?? vi.fn()} />);
}

async function ready() {
  await screen.findByText(/Forks of this project are not affected \(3\)/);
}

beforeEach(() => {
  setLang("en");
  vi.mocked(getRemovalImpact).mockResolvedValue(impact());
  vi.mocked(removeProject).mockResolvedValue({
    hiddenAt: "2026-11-09T00:00:00.000Z",
    retainedUntil: "2026-12-09T00:00:00.000Z",
    closedReports: 4,
    soundResults: [],
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("RemoveDialog: removal-impact data", () => {
  it("shows fork count, the owner's sounds, and the kept-until line", async () => {
    renderDialog();
    await ready();
    expect(screen.getByRole("checkbox", { name: "Remove sound Kick" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Remove sound Snare" })).toBeTruthy();
    expect(screen.getByText(/Kept until/)).toBeTruthy();
  });

  it("no owner sounds: shows the empty line instead of a list", async () => {
    vi.mocked(getRemovalImpact).mockResolvedValue(impact({ ownerSounds: [], forkCount: 0 }));
    renderDialog();
    expect(await screen.findByText("No custom sounds to remove.")).toBeTruthy();
    expect(screen.getByText(/Forks of this project are not affected \(0\)/)).toBeTruthy();
  });

  it("error loading impact: shows the error and retry reloads it", async () => {
    vi.mocked(getRemovalImpact)
      .mockRejectedValueOnce(new ApiError(500, "boom"))
      .mockResolvedValueOnce(impact());
    renderDialog();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load the reports for this project.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/Forks of this project are not affected \(3\)/)).toBeTruthy();
    expect(getRemovalImpact).toHaveBeenCalledTimes(2);
  });
});

describe("RemoveDialog: reason validation", () => {
  it("reason shorter than the minimum disables submit and never calls the API", async () => {
    renderDialog();
    await ready();
    fireEvent.change(reasonBox(), { target: { value: "too short" } });
    expect(submitButton().disabled).toBe(true);
    expect(screen.getByText(`The reason needs at least ${REMOVAL_REASON_MIN_LENGTH} characters.`)).toBeTruthy();
    fireEvent.click(submitButton());
    expect(removeProject).not.toHaveBeenCalled();
  });
});

describe("RemoveDialog: submit", () => {
  it("sends the right payload: trimmed reason, chosen policy, selected sounds", async () => {
    const onRemoved = vi.fn();
    renderDialog(onRemoved);
    await ready();
    fireEvent.click(screen.getByRole("radio", { name: /Copyright infringement/i }));
    fireEvent.change(reasonBox(), { target: { value: "  copied the song  " } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Remove sound Kick" }));
    fireEvent.click(submitButton());
    await waitFor(() => expect(removeProject).toHaveBeenCalledTimes(1));
    expect(removeProject).toHaveBeenCalledWith(P1, {
      reason: "copied the song",
      policy: "copyright",
      removeSoundIds: [KICK],
    });
    expect(onRemoved).toHaveBeenCalledTimes(1);
  });

  it("needs a policy: submit stays disabled until one is chosen", async () => {
    renderDialog();
    await ready();
    fireEvent.change(reasonBox(), { target: { value: "valid reason here" } });
    expect(submitButton().disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /^Other$/i }));
    expect(submitButton().disabled).toBe(false);
  });

  it("409: shows the already-removed message and the form stays open", async () => {
    vi.mocked(removeProject).mockRejectedValue(new ApiError(409, "Conflict"));
    renderDialog();
    await ready();
    fireEvent.click(screen.getByRole("radio", { name: /^Other$/i }));
    fireEvent.change(reasonBox(), { target: { value: "valid reason here" } });
    fireEvent.click(submitButton());
    expect(await screen.findByText("This project has already been removed.")).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("other error: shows the generic message and the form stays open", async () => {
    vi.mocked(removeProject).mockRejectedValue(new ApiError(500, "boom"));
    renderDialog();
    await ready();
    fireEvent.click(screen.getByRole("radio", { name: /^Other$/i }));
    fireEvent.change(reasonBox(), { target: { value: "valid reason here" } });
    fireEvent.click(submitButton());
    expect(await screen.findByText("Could not remove the project. It still shows.")).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("while submitting the button is disabled and a second click does not resend", async () => {
    let resolve: (value: unknown) => void = () => {};
    vi.mocked(removeProject).mockReturnValue(new Promise((r) => (resolve = r)));
    renderDialog();
    await ready();
    fireEvent.click(screen.getByRole("radio", { name: /^Other$/i }));
    fireEvent.change(reasonBox(), { target: { value: "valid reason here" } });
    fireEvent.click(submitButton());
    const sending = await screen.findByRole("button", { name: "Removing…" });
    expect((sending as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(sending);
    fireEvent.click(sending);
    expect(removeProject).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ closedReports: 0, soundResults: [] }));
  });

  it("unmount while the impact load is in flight: no errors", async () => {
    vi.mocked(getRemovalImpact).mockReturnValue(new Promise(() => {}));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const view = renderDialog();
    view.unmount();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
