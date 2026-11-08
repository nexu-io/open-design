/** Portable, non-secret identity of a packaged integration environment. */
export interface AmrEndpointBinding {
  profile: 'test';
  apiUrl: string;
  linkUrl: string;
  webUrl: string;
  credentialScope: string;
}

function parseHttpsOrigin(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`AMR endpoint binding requires ${field}`);
  }
  // Origins only: no userinfo, paths, query, fragment or backslash normalization.
  const match = /^https:\/\/([a-z0-9.-]+)(?::([0-9]{1,5}))?\/?$/i.exec(value);
  const hostname = match?.[1]?.toLowerCase();
  if (!hostname || hostname.length > 253 || hostname.split('.').some(
    (label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
  )) {
    throw new Error(`AMR endpoint binding ${field} must be an HTTPS origin`);
  }
  const port = match?.[2] ? Number(match[2]) : undefined;
  if (port !== undefined && (port < 1 || port > 65535)) {
    throw new Error(`AMR endpoint binding ${field} has an invalid port`);
  }
  return `https://${hostname}${port !== undefined && port !== 443 ? `:${port}` : ''}`;
}

/** Missing binding preserves legacy configuration; an explicit invalid one fails closed. */
export function parseAmrEndpointBinding(value: unknown): AmrEndpointBinding | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string') {
    if (!value.trim()) return undefined;
    try {
      value = JSON.parse(value);
    } catch {
      throw new Error('AMR endpoint binding must be valid JSON');
    }
    // A JSON null/empty string is an explicit malformed binding, not absence.
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AMR endpoint binding must be an object');
  }
  const binding = value as Record<string, unknown>;
  const fields = ['profile', 'apiUrl', 'linkUrl', 'webUrl', 'credentialScope'];
  if (Object.keys(binding).some((field) => !fields.includes(field))) {
    throw new Error('AMR endpoint binding contains an unsupported field');
  }
  if (binding.profile !== 'test') {
    throw new Error('AMR endpoint binding requires the test CLI profile');
  }
  if (typeof binding.credentialScope !== 'string'
    || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(binding.credentialScope)) {
    throw new Error('AMR endpoint binding requires a safe credentialScope');
  }
  return {
    profile: 'test',
    apiUrl: parseHttpsOrigin(binding.apiUrl, 'apiUrl'),
    linkUrl: parseHttpsOrigin(binding.linkUrl, 'linkUrl'),
    webUrl: parseHttpsOrigin(binding.webUrl, 'webUrl'),
    credentialScope: binding.credentialScope,
  };
}
