// One-shot OAuth derisk test — validates that:
//   1. credentials.json at ~/.open-design/google-credentials.json is readable
//   2. OAuth consent flow completes (browser opens, user clicks through)
//   3. Wix Workspace policy does NOT block third-party uncertified app
//   4. Slides API call returns the JP template metadata using the token
//
// Run: pnpm tsx apps/daemon/scripts/test-google-auth.ts
//
// Token is cached at ~/.open-design/google-token.json — second run skips
// the browser step entirely. Delete that file to force re-auth.

import http from 'node:http';
import { URL } from 'node:url';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { exec } from 'node:child_process';
import { google } from 'googleapis';

const HOME = homedir();
const CONFIG_DIR = path.join(HOME, '.open-design');
const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'google-credentials.json');
const TOKEN_PATH = path.join(CONFIG_DIR, 'google-token.json');
const JP_TEMPLATE_ID = '1ENwLW7nzIqR8U_KjzchUh4Uxscd89LfHSuq8E5JOb1w';

const SCOPES = [
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/drive.file',
];

async function loadCredentials() {
  if (!existsSync(CREDENTIALS_PATH)) {
    throw new Error(`Credentials missing at ${CREDENTIALS_PATH} — run Phase 0 setup first.`);
  }
  const raw = await readFile(CREDENTIALS_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const installed = parsed.installed || parsed.web;
  if (!installed?.client_id || !installed?.client_secret) {
    throw new Error('credentials.json does not contain client_id / client_secret');
  }
  return installed;
}

async function loadCachedToken() {
  if (!existsSync(TOKEN_PATH)) return null;
  try {
    return JSON.parse(await readFile(TOKEN_PATH, 'utf8'));
  } catch {
    return null;
  }
}

async function saveToken(token: any) {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(TOKEN_PATH, JSON.stringify(token, null, 2), { mode: 0o600 });
}

function openBrowser(url: string) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} "${url}"`);
}

async function runAuthFlow(creds: { client_id: string; client_secret: string }): Promise<any> {
  return new Promise((resolve, reject) => {
    const port = 8765;
    const redirectUri = `http://localhost:${port}/callback`;
    const oauth = new google.auth.OAuth2(creds.client_id, creds.client_secret, redirectUri);
    const authUrl = oauth.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });

    const server = http.createServer(async (req, res) => {
      try {
        if (!req.url) return;
        const url = new URL(req.url, `http://localhost:${port}`);
        if (url.pathname !== '/callback') {
          res.writeHead(404);
          res.end();
          return;
        }
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<h1>OAuth error</h1><p>${error}</p>`);
          server.close();
          reject(new Error(`OAuth returned error: ${error}`));
          return;
        }
        if (!code) {
          res.writeHead(400);
          res.end('Missing code');
          return;
        }
        const { tokens } = await oauth.getToken(code);
        oauth.setCredentials(tokens);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>OK</h1><p>You can close this tab and return to the terminal.</p>');
        server.close();
        resolve(tokens);
      } catch (err) {
        res.writeHead(500);
        res.end((err as Error).message);
        server.close();
        reject(err);
      }
    });
    server.listen(port, () => {
      console.log(`\n  Opening browser for Google OAuth consent…`);
      console.log(`  If it doesn't open, paste this URL manually:\n  ${authUrl}\n`);
      openBrowser(authUrl);
    });
  });
}

async function main() {
  console.log('=== Phase 0 derisk test ===\n');

  console.log('Step 1: read credentials');
  const creds = await loadCredentials();
  console.log(`  ✓ project: ${(JSON.parse(await readFile(CREDENTIALS_PATH, 'utf8')).installed || {}).project_id}`);
  console.log(`  ✓ client_id: ${creds.client_id.slice(0, 30)}…\n`);

  console.log('Step 2: OAuth flow');
  let token = await loadCachedToken();
  if (token) {
    console.log('  ✓ token cached, reusing');
  } else {
    token = await runAuthFlow(creds);
    await saveToken(token);
    console.log('  ✓ new token issued and cached');
  }

  const oauth = new google.auth.OAuth2(creds.client_id, creds.client_secret);
  oauth.setCredentials(token);

  console.log('\nStep 3: call Slides API to read JP template');
  const slides = google.slides({ version: 'v1', auth: oauth });
  const presentation = await slides.presentations.get({ presentationId: JP_TEMPLATE_ID });
  console.log(`  ✓ title: ${presentation.data.title}`);
  console.log(`  ✓ slide count: ${presentation.data.slides?.length}`);
  const firstSlide = presentation.data.slides?.[0];
  console.log(`  ✓ first slide ID: ${firstSlide?.objectId}`);
  console.log(`  ✓ first slide elements: ${firstSlide?.pageElements?.length}`);

  console.log('\nStep 4: call Drive API (list 1 file to confirm Drive scope)');
  const drive = google.drive({ version: 'v3', auth: oauth });
  const list = await drive.files.list({ pageSize: 1, fields: 'files(id, name)' });
  console.log(`  ✓ Drive accessible, sample: ${list.data.files?.[0]?.name ?? '(empty)'}\n`);

  console.log('=== ALL CHECKS PASSED ===');
  console.log('Phase 0 OK. Wix Workspace did not block the OAuth flow.');
  console.log('You can now proceed with Phase 1 (daemon Slides client).');
}

main().catch((err) => {
  console.error('\n=== FAILED ===');
  console.error((err as Error).message);
  if ((err as Error).message.includes('admin') || (err as Error).message.includes('blocked') || (err as Error).message.includes('policy')) {
    console.error('\n→ Wix Workspace likely blocks third-party uncertified OAuth apps.');
    console.error('→ Fall back to Path C: skill stays on `gog`, image-into-placeholder shipped in v2 after Wix IT ticket.');
  }
  process.exit(1);
});
