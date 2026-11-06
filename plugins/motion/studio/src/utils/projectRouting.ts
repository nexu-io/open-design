const PROJECT_HASH_PREFIX = "#project/";

export interface ProjectHashRoute {
  projectId: string;
  params: URLSearchParams;
}

const WINDOWS_DRIVE_PREFIX = /^[a-z]:/i;

/** Project names are single path segments, including when received from a hash or server. */
export function isValidProjectId(value: string): boolean {
  return (
    value.length > 0 &&
    value !== "." &&
    value !== ".." &&
    !WINDOWS_DRIVE_PREFIX.test(value) &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !Array.from(value).some((char) => char.charCodeAt(0) < 32)
  );
}

function decodeHashProjectId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeHashParams(
  params?: URLSearchParams | Record<string, string | null | undefined>,
): URLSearchParams {
  if (!params) return new URLSearchParams();
  if (params instanceof URLSearchParams) return params;

  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!key || value == null || value === "") continue;
    next.set(key, value);
  }
  return next;
}

export function encodeProjectId(projectId: string): string {
  if (!isValidProjectId(projectId)) throw new Error("Invalid project ID");
  return encodeURIComponent(projectId);
}

export function buildProjectHash(
  projectId: string,
  params?: URLSearchParams | Record<string, string | null | undefined>,
): string {
  const search = normalizeHashParams(params).toString();
  return `${PROJECT_HASH_PREFIX}${encodeProjectId(projectId)}${search ? `?${search}` : ""}`;
}

export function parseProjectHashRoute(hash: string): ProjectHashRoute | null {
  if (!hash.startsWith(PROJECT_HASH_PREFIX)) return null;

  const route = hash.slice(PROJECT_HASH_PREFIX.length);
  const queryIndex = route.indexOf("?");
  const encodedProjectId = queryIndex >= 0 ? route.slice(0, queryIndex) : route;
  if (!encodedProjectId || encodedProjectId.includes("/")) return null;

  const projectId = decodeHashProjectId(encodedProjectId);
  if (!isValidProjectId(projectId)) return null;

  const rawParams = queryIndex >= 0 ? route.slice(queryIndex + 1) : "";
  return {
    projectId,
    params: new URLSearchParams(rawParams),
  };
}

export function parseProjectIdFromHash(hash: string): string | null {
  return parseProjectHashRoute(hash)?.projectId ?? null;
}

export function buildProjectApiPath(projectId: string, suffix = ""): string {
  const normalizedSuffix = suffix && !suffix.startsWith("/") ? `/${suffix}` : suffix;
  return `/api/projects/${encodeProjectId(projectId)}${normalizedSuffix}`;
}
