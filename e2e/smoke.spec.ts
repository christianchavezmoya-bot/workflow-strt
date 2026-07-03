import { test, expect } from "@playwright/test";

// Smoke: the SPA boots and mounts React into #root WITHOUT a white-screen/crash.
// Deliberately backend-independent — it must pass whether or not the API on
// :4000 is up, so it's reliable in CI (which starts only the dev server). The
// login-flow e2e (which needs the API) lives separately; see references/testing.md.
test("app shell mounts and renders", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto("/");

  // The app sets <title> dynamically at runtime — assert it resolved to a
  // non-empty document title (proves the JS bundle loaded and executed).
  await expect
    .poll(async () => (await page.title()).length, { timeout: 15_000 })
    .toBeGreaterThan(0);

  // React mounted real UI into #root (catches a broken build / crash-on-load).
  await expect(page.locator("#root > *").first()).toBeVisible({ timeout: 15_000 });

  // No uncaught exception tore the app down during boot.
  expect(pageErrors, `uncaught page errors: ${pageErrors.join("; ")}`).toHaveLength(0);
});
