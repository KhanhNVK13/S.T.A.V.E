import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearStoredSessionId, setStoredSessionId, syncAccountLanguage } from "./api-client";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  clearStoredSessionId();
  vi.unstubAllGlobals();
});

describe("syncAccountLanguage", () => {
  it("does nothing when nobody is signed in", async () => {
    await syncAccountLanguage("en");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("patches the account language when signed in", async () => {
    setStoredSessionId("session-1");
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await syncAccountLanguage("en");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/users\/me$/);
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ language: "en" }));
    expect((init.headers as Headers).get("X-Session-Id")).toBe("session-1");
  });

  it("swallows a failure so changing the language is never blocked", async () => {
    setStoredSessionId("session-1");
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(syncAccountLanguage("vi")).resolves.toBeUndefined();
    fetchMock.mockResolvedValue(new Response("{}", { status: 400 }));
    await expect(syncAccountLanguage("vi")).resolves.toBeUndefined();
  });
});
