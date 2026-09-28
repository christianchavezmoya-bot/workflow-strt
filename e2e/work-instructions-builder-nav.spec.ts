import { test, expect, type Page } from "@playwright/test";

const EMAIL = "admin.dev@stratango.local";
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

  // Regression: New Workflow → Continue used to leave the dialog's Dialog/Modal/Backdrop
  // mounted (invisible, mid MUI exit-transition) directly over the freshly-opened Builder.
  // It absorbed pointer events for the length of the transition, so the first real click
  // on a Builder control was silently swallowed. Fixed by conditionally MOUNTING the
  // dialog on configDialogOpen rather than only toggling `open`. This must be proven in a
  // real browser — jsdom (the Vitest component tests) has no hit-testing, so it cannot
  // detect an invisible element intercepting a click the way a real browser does.
  test("Builder responds on the very first real click after New Workflow → Continue, with no stale modal left behind", async ({ page }) => {
    test.setTimeout(90_000);

    await login(page);
    await page.goto("http://127.0.0.1:5173/work-instructions", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Workflows", { exact: true }).first()).toBeVisible({ timeout: 30_000 });

    const newWorkflowButton = page.getByRole("button", { name: /\+ new workflow/i });
    await expect(newWorkflowButton).toBeVisible({ timeout: 30_000 });
    await newWorkflowButton.click();

    await expect(page.getByLabel(/select product/i)).toBeVisible({ timeout: 15_000 });

    // The regression window is ~195ms (MUI's default dialog exit-transition duration).
    // Playwright locators (toBeVisible/click) each poll on their own ~100ms+ cadence, so
    // chaining ordinary awaits after Continue reliably lets the real transition finish
    // before any check runs — masking the bug entirely (confirmed empirically: an earlier,
    // naive version of this test passed even against the unfixed component). Instead,
    // install an in-page sampler BEFORE clicking Continue that polls every 5ms via the
    // browser's own setInterval — fine-grained and independent of Playwright's IPC/polling
    // latency — and records whether the Builder and any leftover New Workflow modal
    // infrastructure were EVER both present at the same instant.
    await page.evaluate(() => {
      const w = window as unknown as { __overlapDetected?: boolean; __overlapSamples?: number; __overlapTimer?: number };
      w.__overlapDetected = false;
      w.__overlapSamples = 0;
      w.__overlapTimer = window.setInterval(() => {
        w.__overlapSamples = (w.__overlapSamples ?? 0) + 1;
        const builderActive = Array.from(document.querySelectorAll("button"))
          .some((b) => /back to instructions/i.test(b.textContent ?? ""));
        const staleModalLayer = document.querySelector(".MuiDialog-root, .MuiModal-root, .MuiBackdrop-root") !== null;
        if (builderActive && staleModalLayer) w.__overlapDetected = true;
      }, 5);
    });

    await page.getByRole("button", { name: /^continue$/i }).click();
    await expect(page.getByRole("button", { name: /back to instructions/i })).toBeVisible({ timeout: 30_000 });
    // Keep sampling a little past the point the Builder becomes visible, so the sampler
    // covers the full length of any exit transition that started just before/at that point.
    await page.waitForTimeout(500);

    const overlap = await page.evaluate(() => {
      const w = window as unknown as { __overlapDetected?: boolean; __overlapSamples?: number; __overlapTimer?: number };
      window.clearInterval(w.__overlapTimer);
      return { detected: w.__overlapDetected, samples: w.__overlapSamples };
    });
    expect(overlap.samples ?? 0).toBeGreaterThan(5); // sanity: the sampler actually ran
    expect(overlap.detected).toBe(false);

    // The New Workflow dialog's modal infrastructure must be gone by now — not merely
    // invisible — confirmed via the normal (slower) locator API too.
    await expect(page.locator(".MuiDialog-root, .MuiModal-root, .MuiBackdrop-root")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^continue$/i })).toHaveCount(0);

    // CRITICAL ACCEPTANCE TEST: a real, un-forced click on a Builder control must work on
    // the very first attempt. No { force: true } — a forced click bypasses the exact
    // pointer-interception hit-test this regression is about, and would pass even on the
    // broken build.
    const workflowActions = page.getByRole("button", { name: /workflow actions/i });
    await expect(workflowActions).toBeVisible({ timeout: 30_000 });
    await workflowActions.click();
    await expect(page.getByRole("menu")).toBeVisible({ timeout: 5_000 });
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
