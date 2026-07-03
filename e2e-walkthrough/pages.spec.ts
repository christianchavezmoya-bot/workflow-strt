import { test, expect } from "@playwright/test";
import { API, apiLogin, uiLogin, trackErrors } from "./helpers";

/**
 * Visual walkthrough: log in through the UI, then visit every authenticated
 * route, screenshot each, and assert it renders without an uncaught exception
 * or a React error boundary. One test = one continuous video per viewport
 * (desktop + mobile projects).
 */
test("walkthrough: all pages render", async ({ page, request }, testInfo) => {
  const { pageErrors } = trackErrors(page);

  // A seeded project id makes the /projects/:id detail route real.
  const token = await apiLogin(request);
  let projectId = "";
  try {
    const res = await request.get(`${API}/projects`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    projectId = (Array.isArray(body) ? body[0]?.id : body.items?.[0]?.id) ?? "";
  } catch { /* detail route skipped if none */ }

  await uiLogin(page);

  const routes: Array<{ path: string; label: string }> = [
    { path: "/", label: "dashboard" },
    { path: "/projects", label: "projects" },
    ...(projectId ? [{ path: `/projects/${projectId}`, label: "project-detail" }] : []),
    { path: "/installations/assets", label: "assets" },
    { path: "/work-instructions", label: "work-instructions" },
    { path: "/issues", label: "issues" },
    { path: "/documents", label: "documents" },
    { path: "/tips", label: "tips" },
    { path: "/admin", label: "admin-users" },
    { path: "/settings", label: "settings" },
    { path: "/profile", label: "profile" },
  ];

  const failures: string[] = [];

  for (const route of routes) {
    await page.goto(route.path, { waitUntil: "domcontentloaded" });
    // Give lazy chunks + first data fetch a moment to paint. (networkidle is
    // unusable here — the app holds an open SSE connection.)
    await page.waitForTimeout(1800);

    // React mounted *something* into #root.
    const rootChildren = await page.locator("#root > *").count();
    if (rootChildren === 0) failures.push(`${route.label}: #root empty`);

    // No visible error boundary / crash text.
    const crashText = page.getByText(/something went wrong|application error|unexpected error/i);
    if (await crashText.count()) failures.push(`${route.label}: error boundary visible`);

    const shot = await page.screenshot({ fullPage: true });
    await testInfo.attach(`${testInfo.project.name}-${route.label}`, { body: shot, contentType: "image/png" });
  }

  expect(pageErrors, `uncaught exceptions: ${pageErrors.join(" | ")}`).toHaveLength(0);
  expect(failures, `page render failures: ${failures.join(" | ")}`).toHaveLength(0);
});
