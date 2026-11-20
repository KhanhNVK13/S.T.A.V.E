import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import { RequireAuth } from "./require-auth";
import { useAuth } from "../context/auth-context";
import { setLang } from "../lib/i18n";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("../context/auth-context", () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

function authValue(user: User | null, loading: boolean) {
  return {
    session: null,
    user,
    profile: null,
    loading,
    refreshProfile: vi.fn(),
    signOut: vi.fn(),
  };
}

beforeEach(() => {
  setLang("vi");
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RequireAuth", () => {
  it("preserves current path in ?next= for guest visiting /projects", () => {
    window.history.replaceState({}, "", "/projects");
    mockedUseAuth.mockReturnValue(authValue(null, false));
    render(
      <RequireAuth>
        <div>protected</div>
      </RequireAuth>,
    );
    expect(replaceMock).toHaveBeenCalledWith("/login?next=%2Fprojects");
    expect(screen.queryByText("protected")).toBeNull();
  });

  it("preserves query string in ?next= for guest visiting /plans?tab=pro", () => {
    window.history.replaceState({}, "", "/plans?tab=pro");
    mockedUseAuth.mockReturnValue(authValue(null, false));
    render(
      <RequireAuth>
        <div>protected</div>
      </RequireAuth>,
    );
    expect(replaceMock).toHaveBeenCalledWith("/login?next=%2Fplans%3Ftab%3Dpro");
  });

  it("redirects to plain /login when guest path is /", () => {
    window.history.replaceState({}, "", "/");
    mockedUseAuth.mockReturnValue(authValue(null, false));
    render(
      <RequireAuth>
        <div>protected</div>
      </RequireAuth>,
    );
    expect(replaceMock).toHaveBeenCalledWith("/login");
  });

  it("redirects to plain /login when an authenticated user signs out", () => {
    window.history.replaceState({}, "", "/projects");
    mockedUseAuth.mockReturnValue(authValue({ id: "u1" } as User, false));
    const { rerender } = render(
      <RequireAuth>
        <div>protected</div>
      </RequireAuth>,
    );
    expect(screen.getByText("protected")).toBeTruthy();

    mockedUseAuth.mockReturnValue(authValue(null, false));
    rerender(
      <RequireAuth>
        <div>protected</div>
      </RequireAuth>,
    );
    expect(replaceMock).toHaveBeenCalledWith("/login");
  });
});
