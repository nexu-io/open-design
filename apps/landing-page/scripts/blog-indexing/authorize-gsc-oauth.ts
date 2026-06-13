/*
 * authorize-gsc-oauth — one-time local helper to create a Google OAuth
 * refresh token for Search Console automation.
 *
 * Usage:
 *   GSC_OAUTH_CLIENT_ID=... GSC_OAUTH_CLIENT_SECRET=... \
 *     tsx scripts/blog-indexing/authorize-gsc-oauth.ts --out /tmp/gsc-refresh-token.txt
 *
 * The script starts a loopback server, prints an authorization URL,
 * exchanges the callback code, and writes ONLY the refresh token to
 * `--out`. Do not commit the output file.
 */
import http from 'node:http';
import { writeFileSync } from 'node:fs';
import { fetchWithRetry } from './lib.ts';

const SCOPE = 'https://www.googleapis.com/auth/webmasters';
const REDIRECT_URI = 'http://127.0.0.1:17666/oauth2callback';

interface Args {
  out: string;
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = argv[++i];
  }
  if (!args.out) throw new Error('--out is required');
  return args as Args;
}

function waitForCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url ?? '/', REDIRECT_URI);
        if (url.pathname !== '/oauth2callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const error = url.searchParams.get('error');
        if (error) throw new Error(error);
        const code = url.searchParams.get('code');
        if (!code) throw new Error('No authorization code in callback.');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<h1>Open Design GSC authorization complete</h1><p>You can close this tab and return to Cursor.</p>');
        server.close();
        resolve(code);
      } catch (err) {
        server.close();
        reject(err);
      }
    });
    server.listen(17666, '127.0.0.1');
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const clientId = process.env.GSC_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GSC_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GSC_OAUTH_CLIENT_ID and GSC_OAUTH_CLIENT_SECRET are required.');
  }

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  console.log('Open this URL in your browser and approve access:');
  console.log(authUrl.toString());
  const code = await waitForCode();

  const res = await fetchWithRetry('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    }),
  });
  if (!res.ok) {
    throw new Error(`OAuth code exchange failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { refresh_token?: string };
  if (!body.refresh_token) {
    throw new Error('Google did not return a refresh_token. Re-run with prompt=consent and ensure the app is in Testing with your email as a test user.');
  }
  writeFileSync(args.out, body.refresh_token);
  console.log(`Refresh token written to ${args.out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
