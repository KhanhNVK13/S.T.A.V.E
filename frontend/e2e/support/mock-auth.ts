import type { Page } from "@playwright/test";

export interface MockUserOptions {
  id?: string;
  email?: string;
  username?: string;
  displayName?: string;
  role?: "user" | "admin";
}

/**
 * Mocks the Supabase client and STAVE session state in the browser.
 * Ensures the app immediately sees an authenticated user without touching the DB.
 */
export async function mockUserSession(
  page: Page,
  options: MockUserOptions = {},
): Promise<{ id: string; email: string; username: string; displayName: string; role: string }> {
  const user = {
    id: options.id ?? "00000000-0000-4000-a000-000000000001",
    email: options.email ?? "duc@stave.test",
    username: options.username ?? "ductester",
    displayName: options.displayName ?? "Đức Tester",
    role: options.role ?? "user",
  };

  await page.addInitScript((u) => {
    window.localStorage.setItem("stave_session_id", "mock-session-id");
    const supabaseKey = "sb-gwbiwweeznbuqfgawywv-auth-token";
    window.localStorage.setItem(
      supabaseKey,
      JSON.stringify({
        access_token: "mock-jwt-token",
        refresh_token: "mock-refresh-token",
        expires_at: Math.floor(Date.now() / 1000) + 7200,
        expires_in: 7200,
        token_type: "bearer",
        user: {
          id: u.id,
          aud: "authenticated",
          role: "authenticated",
          email: u.email,
          email_confirmed_at: "2026-10-31T00:00:00.000Z",
          user_metadata: {
            display_name: u.displayName,
            username: u.username,
          },
          app_metadata: {
            provider: "email",
            providers: ["email"],
          },
          created_at: "2026-10-31T00:00:00.000Z",
          updated_at: "2026-10-31T00:00:00.000Z",
        },
      }),
    );
  }, user);

  await page.route("**/users/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: user.id,
        email: user.email,
        username: user.username,
        display_name: user.displayName,
        bio: null,
        avatar_url: null,
        role: user.role,
        status: "active",
        created_at: "2026-10-31T00:00:00.000Z",
        updated_at: "2026-10-31T00:00:00.000Z",
      }),
    });
  });

  await page.route("**/auth/v1/user", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: user.id,
        aud: "authenticated",
        role: "authenticated",
        email: user.email,
        email_confirmed_at: "2026-10-31T00:00:00.000Z",
        user_metadata: {
          display_name: user.displayName,
          username: user.username,
        },
        created_at: "2026-10-31T00:00:00.000Z",
        updated_at: "2026-10-31T00:00:00.000Z",
      }),
    });
  });

  await page.route("**/auth/sessions", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ sessionId: "mock-session-id" }),
      });
    } else {
      await route.continue();
    }
  });

  await page.route("**/auth/sync-profile", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  return user;
}
