export type ProjectPreviewOriginProfile = 'normal' | 'powered';

export interface ProjectPreviewOriginAuthority {
  profile: ProjectPreviewOriginProfile;
  scope: string;
  port: string;
}

const PREVIEW_SCOPE_PATTERN = '[A-Za-z0-9_-]{8,128}';
const PROJECT_PREVIEW_HOST_RE = new RegExp(
  `^(n|p)-(${PREVIEW_SCOPE_PATTERN})\\.localhost\\.?$`,
  'u',
);

function normalizedExpectedPort(port: number | string): string | null {
  const value = String(port).trim();
  if (!/^\d{1,5}$/u.test(value)) return null;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= 65_535 ? String(parsed) : null;
}

/**
 * Parse the dedicated project-preview authority carried by the request Host
 * header. The bearer scope lives in the hostname so root-relative artifact
 * resources stay inside the same authorized project without putting project
 * identity in every authored URL.
 */
export function parseProjectPreviewOriginAuthority(
  hostHeader: unknown,
  daemonPort: number | string,
): ProjectPreviewOriginAuthority | null {
  if (typeof hostHeader !== 'string') return null;
  const raw = hostHeader.trim();
  if (!raw || /[\s/@,]/u.test(raw)) return null;

  const expectedPort = normalizedExpectedPort(daemonPort);
  if (!expectedPort) return null;

  let parsed: URL;
  try {
    parsed = new URL(`http://${raw}`);
  } catch {
    return null;
  }
  if (parsed.username || parsed.password || parsed.pathname !== '/') return null;
  if (parsed.port !== expectedPort) return null;

  const match = PROJECT_PREVIEW_HOST_RE.exec(parsed.hostname.toLowerCase());
  if (!match) return null;
  return {
    profile: match[1] === 'p' ? 'powered' : 'normal',
    scope: match[2]!,
    port: expectedPort,
  };
}

export function buildProjectPreviewOrigin(
  scope: string,
  profile: ProjectPreviewOriginProfile,
  daemonPort: number | string,
): string | null {
  const expectedPort = normalizedExpectedPort(daemonPort);
  if (!expectedPort || !new RegExp(`^${PREVIEW_SCOPE_PATTERN}$`, 'u').test(scope)) {
    return null;
  }
  const prefix = profile === 'powered' ? 'p' : 'n';
  return `http://${prefix}-${scope}.localhost:${expectedPort}`;
}
