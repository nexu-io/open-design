import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type FakeAgyOptions = {
  mode?: 'auth-required' | 'rate-limited';
};

export async function writeFakeAgyBin(
  root: string,
  options: FakeAgyOptions = {},
): Promise<string> {
  await mkdir(root, { recursive: true });
  const bin = join(root, 'agy');
  await writeFile(bin, renderFakeAgyScript(options), 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

function renderFakeAgyScript(options: FakeAgyOptions): string {
  const mode = options.mode ?? 'auth-required';
  return `#!/usr/bin/env node
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import process from 'node:process';

const mode = ${JSON.stringify(mode)};
const args = process.argv.slice(2);

function readFlag(name) {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
}

function appendLog(file, lines) {
  if (!file) return;
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, lines.join('\\n') + '\\n', 'utf8');
}

if (args.includes('--version')) {
  process.stdout.write('1.107.0-e2e\\n');
  process.exit(0);
}

const logFile = readFlag('--log-file');

if (mode === 'auth-required') {
  process.stdout.write('Authentication required. Please visit the URL to log in: https://accounts.google.com/o/oauth2/auth?client_id=fake-client&redirect_uri=antigravity-redirect\\n');
  process.stdout.write('Waiting for authentication (timeout 30s)...\\n');
  process.stdout.write('Error: authentication timed out.\\n');
  process.exit(0);
}

appendLog(logFile, [
  'INFO booting agy print mode',
  'ERROR upstream returned RESOURCE_EXHAUSTED (code 429): Individual quota reached. Contact your administrator to enable overages.',
]);
process.exit(0);
`;
}
