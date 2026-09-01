import { timingSafeEqual } from 'node:crypto';

export const API_TOKEN_BASIC_USERNAME = 'open-design';
export const API_TOKEN_BASIC_CHALLENGE = 'Basic realm="OpenDesign", charset="UTF-8"';

export function isTruthyEnvFlag(value: unknown): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function isApiAuthDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isTruthyEnvFlag(env.OD_DISABLE_API_AUTH);
}

export function apiTokenFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return (env.OD_API_TOKEN ?? '').trim();
}

export function isApiTokenMiddlewareEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return apiTokenFromEnv(env).length > 0 && !isApiAuthDisabled(env);
}

function secretsMatch(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function decodeBasicCredentials(value: string): { username: string; password: string } | null {
  const match =
    /^Basic[\t ]+((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)[\t ]*$/i.exec(
      value,
    );
  if (!match?.[1]) return null;

  const encoded = match[1];
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) return null;

  const decoded = bytes.toString('utf8');
  if (!Buffer.from(decoded, 'utf8').equals(bytes)) return null;

  const separator = decoded.indexOf(':');
  if (separator < 0) return null;
  return {
    username: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  };
}

export function apiTokenAuthorizationMatches(value: unknown, apiToken: string): boolean {
  if (typeof value !== 'string' || apiToken.length === 0) return false;

  const bearer = /^Bearer[\t ]+(\S+)[\t ]*$/i.exec(value);
  if (bearer?.[1]) return secretsMatch(bearer[1], apiToken);

  const basic = decodeBasicCredentials(value);
  return basic !== null
    && basic.username === API_TOKEN_BASIC_USERNAME
    && secretsMatch(basic.password, apiToken);
}
