import { Page, expect, APIRequestContext } from "@playwright/test";

export const API = "http://localhost:4000/api";
export const EMAIL = process.env.E2E_EMAIL || "admin@commtrac.local";
export const PASSWORD = process.env.E2E_PASSWORD || "Admin123!";

/** Log in through the real UI (nice for the video walkthrough). */
export async function uiLogin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").first().fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  // Login navigates to "/" or "/profile"; either way we leave /login.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  // NOTE: the app keeps an open SSE stream, so "networkidle" never fires — use a
  // fixed settle instead throughout this suite.
  await page.waitForTimeout(1500);
}

/** Get a bearer token straight from the API (for fixture setup / fast auth). */
export async function apiLogin(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API}/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(res.ok(), `login failed: ${res.status()}`).toBeTruthy();
  return (await res.json()).token as string;
}

/**
 * Seed auth directly into the web app's storage (secureStorage uses localStorage
 * on web) so a spec can start already-authenticated without the UI.
 */
export async function seedAuth(page: Page, token: string, user: unknown): Promise<void> {
  // Runs on every load/reload. `just_authenticated=true` makes App.tsx skip the
  // native biometric/PIN launch gate (which can't complete in a browser) once we
  // dispatch the auth-change event — see enterApp().
  await page.addInitScript(
    ([t, u]) => {
      localStorage.setItem("auth_token", t as string);
      localStorage.setItem("auth_user", u as string);
      localStorage.setItem("last_online_login", String(Date.now()));
      localStorage.setItem("just_authenticated", "true");
    },
    [token, JSON.stringify(user)],
  );
}

/**
 * After a load with forced-native + seeded auth, nudge App.tsx past its launch
 * auth gate and wait for the authenticated shell (sidebar or bottom tab bar).
 */
export async function enterApp(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.setItem("just_authenticated", "true");
    window.dispatchEvent(new Event("auth-change"));
  });
  await page.waitForTimeout(2500);
}

/** Dismiss first-login onboarding + "What's new" changelog modals if present. */
export async function dismissModals(page: Page): Promise<void> {
  for (let i = 0; i < 4; i++) {
    // Be specific — a loose /close/ would match the "Closed" status filter chip.
    const btn = page.getByRole("button", { name: /^(skip for now|got it|maybe later|dismiss)$/i }).first();
    if (await btn.count().catch(() => 0)) {
      await btn.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(600);
    } else {
      break;
    }
  }
  await page.keyboard.press("Escape").catch(() => {});
}

/** Collect uncaught page errors for assertions. */
export function trackErrors(page: Page): { pageErrors: string[]; consoleErrors: string[] } {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  return { pageErrors, consoleErrors };
}
