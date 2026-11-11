import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RestoreDialog } from "./restore-dialog";
import { restoreProject } from "../../../lib/admin-reports-api";
import { ApiError } from "../../../lib/api-client";
import { setLang } from "../../../lib/i18n";

vi.mock("../../../lib/admin-reports-api", () => ({
  restoreProject: vi.fn(),
}));

const P1 = "33333333-3333-4333-8333-333333333333";

const reasonBox = () => screen.getByRole("textbox") as HTMLTextAreaElement;
const submitButton = () => screen.getByRole("button", { name: /^Restore$/ }) as HTMLButtonElement;

function renderDialog(onRestored?: () => void) {
  return render(<RestoreDialog projectId={P1} onClose={vi.fn()} onRestored={onRestored ?? vi.fn()} />);
}

async function ready() {
  await screen.findByText("Restore this project");
}

beforeEach(() => {
  setLang("en");
  vi.mocked(restoreProject).mockResolvedValue({ restored: true });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("RestoreDialog", () => {
  it("empty / whitespace-only reason disables the button and never calls the API", async () => {
    renderDialog();
    await ready();
    fireEvent.change(reasonBox(), { target: { value: "   " } });
    expect(submitButton().disabled).toBe(true);
    expect(screen.getByText("Enter a reason to restore.")).toBeTruthy();
    fireEvent.click(submitButton());
    expect(restoreProject).not.toHaveBeenCalled();
  });

  it("sends the trimmed reason", async () => {
    const onRestored = vi.fn();
    renderDialog(onRestored);
    await ready();
    fireEvent.change(reasonBox(), { target: { value: "  restored by mistake  " } });
    fireEvent.click(submitButton());
    await waitFor(() => expect(restoreProject).toHaveBeenCalledTimes(1));
    expect(restoreProject).toHaveBeenCalledWith(P1, "restored by mistake");
    expect(onRestored).toHaveBeenCalledTimes(1);
  });

  it("410: shows the failure message and the form stays open", async () => {
    vi.mocked(restoreProject).mockRejectedValue(new ApiError(410, "Gone"));
    renderDialog();
    await ready();
    fireEvent.change(reasonBox(), { target: { value: "try again" } });
    fireEvent.click(submitButton());
    expect(await screen.findByText("Could not restore the project. It stays removed.")).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("other error: shows the failure message and the form stays open", async () => {
    vi.mocked(restoreProject).mockRejectedValue(new ApiError(500, "boom"));
    renderDialog();
    await ready();
    fireEvent.change(reasonBox(), { target: { value: "try again" } });
    fireEvent.click(submitButton());
    expect(await screen.findByText("Could not restore the project. It stays removed.")).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("while submitting the button is disabled and a second click does not resend", async () => {
    let resolve: (value: unknown) => void = () => {};
    vi.mocked(restoreProject).mockReturnValue(new Promise((r) => (resolve = r)));
    renderDialog();
    await ready();
    fireEvent.change(reasonBox(), { target: { value: "try again" } });
    fireEvent.click(submitButton());
    const sending = await screen.findByRole("button", { name: "Restoring…" });
    expect((sending as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(sending);
    fireEvent.click(sending);
    expect(restoreProject).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ restored: true }));
  });
});
