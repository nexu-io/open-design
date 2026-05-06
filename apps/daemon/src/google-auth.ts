// @ts-nocheck
//
// Google OAuth 2.0 helper for the daemon. Reads credentials from
// `~/.open-design/google-credentials.json` (downloaded from Google Cloud
// Console — Desktop client type), caches the access/refresh token at
// `~/.open-design/google-token.json` (mode 0600), and exposes:
//
//   - getAuthClient()       — returns an authenticated OAuth2 client, or null
//                              when not yet authorized; auto-refreshes a
//                              cached token.
//   - hasCredentials()      — boolean: is the credentials.json file there
//   - hasToken()            — boolean: is the token cache populated
//   - generateAuthUrl()     — produce the consent URL the browser opens
//   - exchangeCode(code)    — finish the OAuth flow with the redirected code
//                              and persist the token
//   - clearToken()          — delete the cached token (forces re-auth)
//
// Token persistence is a plain JSON file, mode 0600. We deliberately do
// not store anything in the OS keyring here — daemon already lives under
// the user's profile and we want the token reviewable for support.

import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { google } from 'googleapis';

const HOME = homedir();
const CONFIG_DIR = path.join(HOME, '.open-design');
const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'google-credentials.json');
const TOKEN_PATH = path.join(CONFIG_DIR, 'google-token.json');

// Scopes match the skill's needs:
//   - presentations: read + write Slides via Slides API
//   - drive:         full Drive access. Wider than drive.file because the
//                    skill copies templates the user authored *outside*
//                    this OAuth project (e.g. via gog). drive.file only
//                    sees files this client created or the user picked
//                    via Drive Picker, which would force a separate UI
//                    step before every copy. The user owns the OAuth
//                    project and uses this on their own machine, so the
//                    broader scope is acceptable.
export const SCOPES = [
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/drive',
];

// Desktop OAuth clients accept any localhost port and any path. The
// daemon serves the redirect at /api/google/auth/callback on its own
// dynamic port — we accept a `redirectUri` argument from the route
// handler instead of hardcoding it. Default kept for the standalone
// derisk script (apps/daemon/scripts/test-google-auth.ts) which runs
// its own tiny http server.
const DEFAULT_REDIRECT_URI = 'http://localhost:8765/callback';

let cachedClient = null;

export function hasCredentials() {
  return existsSync(CREDENTIALS_PATH);
}

export function hasToken() {
  return existsSync(TOKEN_PATH);
}

async function loadCredentials() {
  if (!hasCredentials()) {
    const err = new Error(
      `Google credentials missing at ${CREDENTIALS_PATH}. ` +
        'Place a Desktop OAuth client JSON there before authorizing.',
    );
    err.code = 'GOOGLE_CREDENTIALS_MISSING';
    throw err;
  }
  const raw = await readFile(CREDENTIALS_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const installed = parsed.installed || parsed.web;
  if (!installed?.client_id || !installed?.client_secret) {
    const err = new Error('credentials.json missing client_id / client_secret');
    err.code = 'GOOGLE_CREDENTIALS_MALFORMED';
    throw err;
  }
  return { clientId: installed.client_id, clientSecret: installed.client_secret };
}

async function loadToken() {
  if (!hasToken()) return null;
  try {
    return JSON.parse(await readFile(TOKEN_PATH, 'utf8'));
  } catch {
    return null;
  }
}

async function saveToken(token) {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(TOKEN_PATH, JSON.stringify(token, null, 2), { mode: 0o600 });
}

async function buildOAuthClient(redirectUri = DEFAULT_REDIRECT_URI) {
  const { clientId, clientSecret } = await loadCredentials();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// Returns an authenticated OAuth2 client whose token is fresh, or null when
// the user has never gone through the consent flow on this machine.
//
// On token expiry the googleapis library auto-refreshes using the stored
// refresh_token. We wire `tokens` event so the refreshed token gets
// persisted back to disk; without this the next daemon restart would
// reuse the stale access_token and invoke a refresh on every call.
export async function getAuthClient() {
  if (cachedClient) return cachedClient;
  const token = await loadToken();
  if (!token) return null;
  const client = await buildOAuthClient();
  client.setCredentials(token);
  client.on('tokens', (newTokens) => {
    // Google sends only the changed fields on refresh — merge instead of
    // overwriting so we don't drop the long-lived refresh_token.
    // Use the client's CURRENT credentials as the merge base (not the
    // initial-load snapshot) so a later token rotation isn't clobbered
    // by stale fields from the boot-time snapshot.
    const merged = { ...client.credentials, ...newTokens };
    void saveToken(merged).catch(() => {});
  });
  cachedClient = client;
  return client;
}

export async function generateAuthUrl(redirectUri = DEFAULT_REDIRECT_URI) {
  const client = await buildOAuthClient(redirectUri);
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

// Exchanges the OAuth code from the redirect for tokens, persists them,
// and primes the cached client so subsequent getAuthClient() calls reuse
// the same instance.
export async function exchangeCode(code, redirectUri = DEFAULT_REDIRECT_URI): Promise<any> {
  const client = await buildOAuthClient(redirectUri);
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  client.on('tokens', (newTokens) => {
    // Same merge-base concern as getAuthClient(): if the token gets
    // rotated after this listener is attached, the next refresh
    // should fold newTokens into the latest credentials, not into
    // the initial snapshot.
    const merged = { ...client.credentials, ...newTokens };
    void saveToken(merged).catch(() => {});
  });
  await saveToken(tokens);
  cachedClient = client;
  return tokens;
}

export async function clearToken() {
  cachedClient = null;
  if (existsSync(TOKEN_PATH)) {
    await rm(TOKEN_PATH);
  }
}

// Status snapshot for the web "Google connection" UI. Never exposes
// the actual token or client secret.
export async function authStatus() {
  const credsPresent = hasCredentials();
  const tokenPresent = hasToken();
  let scopes = null;
  let projectId = null;
  if (credsPresent) {
    try {
      const raw = await readFile(CREDENTIALS_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      const installed = parsed.installed || parsed.web || {};
      projectId = installed.project_id || null;
    } catch {
      // ignore
    }
  }
  if (tokenPresent) {
    const token = await loadToken();
    scopes = typeof token?.scope === 'string' ? token.scope.split(' ') : null;
  }
  return {
    credentialsPresent: credsPresent,
    tokenPresent,
    projectId,
    scopes,
    redirectUri: DEFAULT_REDIRECT_URI,
  };
}
