import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { setLang } from "../lib/i18n";
import { I18nProvider } from "../context/i18n-context";
import * as api from "../lib/api-client";
import { AccountLanguageSync, pushLanguageWithRetry } from "./account-language-sync";

let authUser: { id: string } | null = null;
let authProfile: { language?: "en" | "vi" } | null = null;
let ready = false;
let hasSession = true;

vi.mock("../context/auth-context", () => ({
  useAuth: () => ({ user: authUser, profile: authProfile }),
}));
vi.mock("../lib/use-session-ready", () => ({ useSessionReady: () => ready }));
vi.mock("../lib/api-client", () => ({
  pushAccountLanguage: vi.fn(),
  getStoredSessionId: () => (hasSession ? "sid" : null),
}));

const push = vi.mocked(api.pushAccountLanguage);

function tree() {
  return (
    <I18nProvider>
      <AccountLanguageSync />
    </I18nProvider>
  );
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  authUser = null;
  authProfile = null;
  ready = false;
  hasSession = true;
  push.mockReset().mockResolvedValue(undefined);
  setLang("en");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AccountLanguageSync", () => {
  it("ALS-01: signing in with English UI sends en once", async () => {
    authUser = { id: "u1" };
    authProfile = { language: "vi" };
    ready = true;
    const view = render(tree());
    await flush();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("en");
    view.rerender(tree());
    await flush();
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("ALS-02: a UI language equal to the account value sends nothing", async () => {
    setLang("vi");
    authUser = { id: "u1" };
    authProfile = { language: "vi" };
    ready = true;
    render(tree());
    await flush();
    expect(push).not.toHaveBeenCalled();
  });

  it("ALS-03: changing language later still syncs", async () => {
    authUser = { id: "u1" };
    authProfile = { language: "en" };
    ready = true;
    render(tree());
    await flush();
    expect(push).not.toHaveBeenCalled();
    act(() => setLang("vi"));
    await flush();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("vi");
  });

  it("ALS-04: nothing is sent before the business session is ready, then it is sent", async () => {
    authUser = { id: "u1" };
    authProfile = null;
    ready = false;
    const view = render(tree());
    await flush();
    expect(push).not.toHaveBeenCalled();
    ready = true;
    view.rerender(tree());
    await flush();
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("ALS-05: nothing is sent when signed out", async () => {
    ready = true;
    render(tree());
    await flush();
    expect(push).not.toHaveBeenCalled();
  });

  it("ALS-06: a network failure is retried then abandoned without throwing", async () => {
    vi.useFakeTimers();
    push.mockRejectedValue(new Error("offline"));
    const result = pushLanguageWithRetry("en", () => false, [10, 20]);
    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toBe(false);
    expect(push).toHaveBeenCalledTimes(3);
  });

  it("ALS-07: a retry that succeeds stops retrying", async () => {
    vi.useFakeTimers();
    push.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const result = pushLanguageWithRetry("vi", () => false, [10, 20]);
    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toBe(true);
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("ALS-08: signing out or cancelling stops further attempts", async () => {
    hasSession = false;
    await expect(pushLanguageWithRetry("en", () => false, [])).resolves.toBe(false);
    hasSession = true;
    await expect(pushLanguageWithRetry("en", () => true, [])).resolves.toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("ALS-09: after every attempt fails, the next language change syncs again", async () => {
    vi.useFakeTimers();
    authUser = { id: "u1" };
    authProfile = { language: "vi" };
    ready = true;
    push.mockRejectedValue(new Error("offline"));
    render(tree());
    await vi.advanceTimersByTimeAsync(10000);
    expect(push).toHaveBeenCalledTimes(3);
    push.mockReset().mockResolvedValue(undefined);
    act(() => setLang("vi"));
    await vi.advanceTimersByTimeAsync(10);
    act(() => setLang("en"));
    await vi.advanceTimersByTimeAsync(10);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("en");
  });

  it("ALS-10: a late-loading profile with the same language does not cause a second PATCH", async () => {
    authUser = { id: "u1" };
    authProfile = null;
    ready = true;
    const view = render(tree());
    await flush();
    expect(push).toHaveBeenCalledTimes(1);
    authProfile = { language: "en" };
    view.rerender(tree());
    await flush();
    expect(push).toHaveBeenCalledTimes(1);
  });
});
