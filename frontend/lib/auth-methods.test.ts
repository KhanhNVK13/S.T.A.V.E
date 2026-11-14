import { describe, expect, it } from "vitest";
import { hasPasswordProvider, hasRecentOAuthLogin, isLastSignInMethod } from "./auth-methods";

function token(amr: unknown): string {
  const body = btoa(JSON.stringify({ amr })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `h.${body}.s`;
}
const NOW = 1_800_000_000_000;
const at = (secondsAgo: number) => token([{ method: "oauth", timestamp: NOW / 1000 - secondsAgo }]);

describe("FE-ATH-01 auth-methods (hasPasswordProvider, hasRecentOAuthLogin, isLastSignInMethod)", () => {
  it("UTCID01 an account linked to email and Google has a password provider", () => {
    expect(hasPasswordProvider(["email", "google"])).toBe(true);
  });

  it("UTCID02 a Google-only account has no password provider", () => {
    expect(hasPasswordProvider(["google"])).toBe(false);
  });

  it("UTCID03 unknown provider data is treated as having a password", () => {
    expect(hasPasswordProvider(undefined)).toBe(true);
  });

  it("UTCID04 an OAuth login one minute ago counts as a recent re-authentication", () => {
    expect(hasRecentOAuthLogin(at(60), NOW)).toBe(true);
  });

  it("UTCID05 an OAuth login exactly 5 minutes ago still counts", () => {
    expect(hasRecentOAuthLogin(at(300), NOW)).toBe(true);
  });

  it("UTCID06 an OAuth login more than 5 minutes ago does not count", () => {
    expect(hasRecentOAuthLogin(at(301), NOW)).toBe(false);
  });

  it("UTCID07 a password login is not an OAuth re-authentication", () => {
    expect(hasRecentOAuthLogin(token([{ method: "password", timestamp: NOW / 1000 }]), NOW)).toBe(false);
  });

  it("UTCID08 an OAuth timestamp in the future does not count", () => {
    expect(hasRecentOAuthLogin(at(-60), NOW)).toBe(false);
  });

  it("UTCID09 a malformed or missing token is not a recent login", () => {
    expect(hasRecentOAuthLogin("garbage", NOW)).toBe(false);
    expect(hasRecentOAuthLogin(null, NOW)).toBe(false);
    expect(hasRecentOAuthLogin(undefined, NOW)).toBe(false);
  });

  it("UTCID10 Google is the last sign-in method when it is the only one", () => {
    expect(isLastSignInMethod(["google"], "google")).toBe(true);
  });

  it("UTCID11 Google is not the last method when a password exists", () => {
    expect(isLastSignInMethod(["email", "google"], "google")).toBe(false);
  });

  it("UTCID12 a method the account does not have is never the last one", () => {
    expect(isLastSignInMethod(["email"], "google")).toBe(false);
    expect(isLastSignInMethod([], "google")).toBe(false);
  });
});
