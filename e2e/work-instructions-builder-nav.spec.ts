import { test, expect, type Page } from "@playwright/test";

const EMAIL = "admin@commtrac.local";
const PASSWORD = "Admin123!";

async function dismissVisibleOnboarding(page: Page) {
  for (let i = 0; i < 4; i += 1) {
    const skip = page.getByRole("button", { name: /skip for now/i }).first();
    if (!(await skip.isVisible().catch(() => false))) return;
    await skip.click();
    await page.waitForTimeout(400);
  }
}

async function login(page: Page) {
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Email")).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.locator(".app-shell")).toBeVisible({ timeout: 30_000 });
  await dismissVisibleOnboarding(page);
}

test.describe("work instructions builder navigation", () => {
  test("builder route defers onboarding overlays and preserves sidebar navigation", async ({ page }) => {
    test.setTimeout(90_000);

    await login(page);

    await page.goto("http://127.0.0.1:5173/work-instructions", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Workflows", { exact: true }).first()).toBeVisible({ timeout: 30_000 });

    const authUser = await page.evaluate(() => localStorage.getItem("auth_user"));
    expect(authUser).toBeTruthy();
    const user = JSON.parse(authUser ?? "{}");
    const onboardingKey = `onboarding_state_v1_${user.id}`;
    await page.evaluate((key) => {
      localStorage.setItem(key, JSON.stringify({
        userId: JSON.parse(localStorage.getItem("auth_user") || "{}").id,
        role: "Admin",
        selectedFocusArea: null,
        firstLoginCompleted: false,
        quickTourCompleted: false,
        quickTourSkipped: false,
        completedTourIds: [],
        dismissedHintIds: [],
        watchedVideoIds: [],
        pageVisitCounts: {},
        lastSeenAppVersion: "",
        whatsNewSeenVersions: [],
        doNotShowAgainHints: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
    }, onboardingKey);

    const builderButtons = page.getByRole("button", { name: /^builder$/i });
    await expect(builderButtons.first()).toBeVisible({ timeout: 30_000 });
    await builderButtons.first().click();

    await expect(page.getByRole("button", { name: /back to instructions/i })).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/work-instructions\?[^\n]*view=builder/i);
    await expect(page.locator(".MuiDialog-root, .MuiModal-root")).toHaveCount(0);

    await page.getByText("Projects", { exact: true }).first().click();
    await expect(page).toHaveURL(/\/projects$/i, { timeout: 15_000 });

    // The URL alone proves nothing: history.pushState happens inside the NavLink
    // handler, so it lands even when React never commits the navigation. When a
    // render loop in the builder starved React Router's startTransition-wrapped
    // location update, the address bar read /projects while the Builder stayed on
    // screen. Assert the rendered tree actually swapped.
    await expect(page.getByRole("button", { name: /back to instructions/i })).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator("a.MuiListItemButton-root.active").filter({ hasText: "Projects" })).toHaveCount(1, {
      timeout: 15_000,
    });
  });

  // Guards the root cause directly: an effect in the builder's StepEditorPanel
  // depended on an array rebuilt every render and stored a fresh Set each time,
  // re-rendering ~180x/sec forever. Any equivalent loop starves navigation again.
  test("builder view does not re-render in a loop", async ({ page }) => {
    test.setTimeout(90_000);

    await login(page);
    await page.goto("http://127.0.0.1:5173/work-instructions", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Workflows", { exact: true }).first()).toBeVisible({ timeout: 30_000 });

    const builderButtons = page.getByRole("button", { name: /^builder$/i });
    await expect(builderButtons.first()).toBeVisible({ timeout: 30_000 });
    await builderButtons.first().click();
    await expect(page.getByRole("button", { name: /back to instructions/i })).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(3_000);

    await page.evaluate(() => {
      const w = window as unknown as { __commits: number; __REACT_DEVTOOLS_GLOBAL_HOOK__?: Record<string, unknown> };
      const hook = w.__REACT_DEVTOOLS_GLOBAL_HOOK__;
      if (!hook) return;
      w.__commits = 0;
      const original = hook.onCommitFiberRoot as ((...args: unknown[]) => unknown) | undefined;
      hook.onCommitFiberRoot = function (...args: unknown[]) {
        w.__commits += 1;
        return original ? original.apply(this, args) : undefined;
      };
    });

    await page.waitForTimeout(5_000);
    const commits = await page.evaluate(() => (window as unknown as { __commits: number }).__commits);

    // Idle builder should only see the 1Hz diagnostic clock (~5 commits in 5s).
    // The bug produced ~900. 60 is a wide margin that still fails loudly on a loop.
    expect(commits).toBeLessThan(60);
  });
});
