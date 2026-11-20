import { describe, expect, it } from "vitest";
import {
  DEFAULT_AFTER_LOGIN_PATH,
  readNextParam,
  safeRedirectPath,
  sanitizeNextPath,
  withNextParam,
} from "./safe-redirect";

describe("safe-redirect helpers", () => {
  it("safeRedirectPath accepts relative paths and rejects external or malformed URLs", () => {
    expect(safeRedirectPath("/projects")).toBe("/projects");
    expect(safeRedirectPath("/plans?feature=theme")).toBe("/plans?feature=theme");
    expect(safeRedirectPath(null)).toBe(DEFAULT_AFTER_LOGIN_PATH);
    expect(safeRedirectPath("https://evil.com")).toBe(DEFAULT_AFTER_LOGIN_PATH);
    expect(safeRedirectPath("//evil.com")).toBe(DEFAULT_AFTER_LOGIN_PATH);
    expect(safeRedirectPath("/\\evil.com")).toBe(DEFAULT_AFTER_LOGIN_PATH);
    expect(safeRedirectPath("/projects\u0000")).toBe(DEFAULT_AFTER_LOGIN_PATH);
  });

  it("sanitizeNextPath blocks root, auth loop routes, and unsafe paths", () => {
    expect(sanitizeNextPath("/projects")).toBe("/projects");
    expect(sanitizeNextPath("/plans?tab=pro")).toBe("/plans?tab=pro");
    expect(sanitizeNextPath("/")).toBeNull();
    expect(sanitizeNextPath("/login")).toBeNull();
    expect(sanitizeNextPath("/login?next=/projects")).toBeNull();
    expect(sanitizeNextPath("/register")).toBeNull();
    expect(sanitizeNextPath("/forgot-password")).toBeNull();
    expect(sanitizeNextPath("/reset-password#access_token=1")).toBeNull();
    expect(sanitizeNextPath("/auth/callback?next=/projects")).toBeNull();
    expect(sanitizeNextPath("//evil.com")).toBeNull();
  });

  it("readNextParam reads ?next= then ?redirect= and sanitizes", () => {
    expect(readNextParam("?next=%2Fprojects%2Fnew")).toBe("/projects/new");
    expect(readNextParam("?redirect=%2Fplans%3Ffeature%3Dtheme")).toBe("/plans?feature=theme");
    expect(readNextParam("?next=%2Fadmin%2Fdashboard&redirect=%2Fprojects")).toBe("/admin/dashboard");
    expect(readNextParam("?next=%2Flogin")).toBeNull();
    expect(readNextParam("?next=https%3A%2F%2Fevil.com")).toBeNull();
    expect(readNextParam("")).toBeNull();
  });

  it("withNextParam appends encoded next query only when valid", () => {
    expect(withNextParam("/login", "/projects")).toBe("/login?next=%2Fprojects");
    expect(withNextParam("/login", "/plans?feature=theme")).toBe(
      "/login?next=%2Fplans%3Ffeature%3Dtheme",
    );
    expect(withNextParam("https://stave.io.vn/auth/callback?source=oauth", "/invitations")).toBe(
      "https://stave.io.vn/auth/callback?source=oauth&next=%2Finvitations",
    );
    expect(withNextParam("/login", "/")).toBe("/login");
    expect(withNextParam("/login", "/login")).toBe("/login");
    expect(withNextParam("/register", null)).toBe("/register");
  });
});
