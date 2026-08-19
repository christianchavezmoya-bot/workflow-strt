type AuthUserLike = { role?: string | null } | null | undefined;

/**
 * Where to send the user immediately after a successful login.
 * Always opens on the Dashboard unless password/profile setup is required.
 */
export function resolvePostLoginRoute(
  _user: AuthUserLike,
  options: { isFirstLogin?: boolean; passwordExpired?: boolean; nativeApp?: boolean },
): string {
  if (options.isFirstLogin || options.passwordExpired) return "/profile";
  return "/";
}

export function isDashboardRoute(pathname: string): boolean {
  return pathname === "/" || pathname === "";
}

/** Routes where background open-issues cache refresh is useful. */
export function isOpenIssuesRefreshRoute(pathname: string): boolean {
  return isDashboardRoute(pathname) || pathname === "/issues" || pathname.startsWith("/issues/");
}
