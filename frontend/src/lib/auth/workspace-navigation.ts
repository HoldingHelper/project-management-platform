const DEFAULT_WORKSPACE = "/h/holding";
const WORKSPACE_ROUTES = [
  "/my-work", "/h", "/v", "/portfolio", "/projects", "/tasks", "/timeline",
  "/notifications", "/activity", "/organization", "/performance", "/automations",
  "/settings", "/profile", "/admin", "/dashboards/executive", "/app/docs",
];

function workspacePath(value: string | null): string | null {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  try {
    const url = new URL(value, "https://workspace.invalid");
    if (url.origin !== "https://workspace.invalid") return null;
    if (!WORKSPACE_ROUTES.some((route) => url.pathname === route || url.pathname.startsWith(`${route}/`))) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function resolveWorkspaceDestination(requested: string | null, previous: string | null): string {
  return workspacePath(requested) ?? workspacePath(previous) ?? DEFAULT_WORKSPACE;
}

export function getWorkspaceDestination(userId: string, requested: string | null = null): string {
  let previous: string | null = null;
  try {
    previous = window.localStorage.getItem(`workspace.last-path:${userId}`);
  } catch { /* Storage can be unavailable; Holding remains the default. */ }
  return resolveWorkspaceDestination(requested, previous);
}

export function rememberWorkspaceLocation(userId: string, path: string): void {
  const destination = workspacePath(path);
  if (!destination) return;
  try {
    window.localStorage.setItem(`workspace.last-path:${userId}`, destination);
    if (!destination.split(/[?#]/)[0].startsWith("/app/docs")) {
      window.sessionStorage.setItem(`workspace.docs-return:${userId}`, destination);
    }
  } catch { /* Navigation should still work without browser storage. */ }
}

export function resolveDocsReturnDestination(previous: string | null): string {
  const destination = workspacePath(previous);
  return destination && !destination.split(/[?#]/)[0].startsWith("/app/docs")
    ? destination
    : DEFAULT_WORKSPACE;
}

export function getDocsReturnDestination(userId: string): string {
  try {
    return resolveDocsReturnDestination(window.sessionStorage.getItem(`workspace.docs-return:${userId}`));
  } catch {
    return DEFAULT_WORKSPACE;
  }
}