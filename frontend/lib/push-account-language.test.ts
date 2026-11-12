import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearStoredSessionId, pushAccountLanguage, setStoredSessionId } from "./api-client";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  clearStoredSessionId();
  vi.unstubAllGlobals();
});

describe("pushAccountLanguage", () => {
  it("patches only the language with the business session header", async () => {
    setStoredSessionId("session-1");
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await pushAccountLanguage("en");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/users\/me$/);
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ language: "en" }));
    expect((init.headers as Headers).get("X-Session-Id")).toBe("session-1");
  });

  it("rejects on a network or HTTP failure so the caller can retry", async () => {
    setStoredSessionId("session-1");
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(pushAccountLanguage("vi")).rejects.toThrow();
    fetchMock.mockResolvedValue(new Response("{}", { status: 400 }));
    await expect(pushAccountLanguage("vi")).rejects.toThrow();
  });
});
