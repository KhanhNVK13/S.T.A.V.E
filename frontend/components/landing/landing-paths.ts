const LANDING_PATHS = new Set(["/", "/welcome"]);

export function isLandingPath(pathname: string): boolean {
  return LANDING_PATHS.has(pathname);
}
