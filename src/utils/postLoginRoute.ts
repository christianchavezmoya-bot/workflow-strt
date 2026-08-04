type AuthUserLike = { role?: string | null } | null | undefined;

const ASSETS_LANDING_ROLES = new Set([
  "Project Manager",
  "Installer",
  "Technician",
  "QA Inspector",
]);

/**
 * Where to send the user immediately after a successful login.
 * PM and field roles skip the Dashboard boot (dashboard-workspace, inspection
 * imports, open-issues scans) and land on Assets instead.
 */
export function resolvePostLoginRoute(
  user: AuthUserLike,
  options: { isFirstLogin?: boolean; passwordExpired?: boolean },
): string {
  if (options.isFirstLogin || options.passwordExpired) return "/profile";
  const role = user?.role ?? "";
  if (ASSETS_LANDING_ROLES.has(role)) return "/installations/assets";
  return "/";
}

export function isDashboardRoute(pathname: string): boolean {
  return pathname === "/" || pathname === "";
}

/** Routes where background open-issues cache refresh is useful. */
export function isOpenIssuesRefreshRoute(pathname: string): boolean {
  return isDashboardRoute(pathname) || pathname === "/issues" || pathname.startsWith("/issues/");
}
