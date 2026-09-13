// Fake `agy` for full-server e2e tests. Honors the two capability probes
// the antigravity runtime def may issue, then behaves like print mode:
// it records the `-p <prompt>` value and writes a fixed plain-text answer
// to stdout (the runtime's `streamFormat: 'plain'` treats stdout as the
// model text stream).
//
// Any arg before `-p` (--log-file, skip-permissions, ...) is tolerated.

import { appendFileSync } from 'node:fs';

const argv = process.argv.slice(2);

if (argv.includes('--version')) {
  process.stdout.write('1.1.13\n');
  process.exit(0);
}
if (argv.includes('--help')) {
  process.stdout.write('Usage: agy [options]\n');
  process.exit(0);
}

const flagIndex = argv.indexOf('-p');
const prompt = flagIndex !== -1 ? (argv[flagIndex + 1] ?? '') : '';
const logPath = process.env.FAKE_AGY_INVOCATION_LOG;
if (logPath) {
  try {
    appendFileSync(logPath, `${JSON.stringify({ prompt })}\n`, 'utf8');
  } catch {
    // best-effort observation only
  }
}

process.stdout.write('## Compacted summary\n\nEverything is done.\n');
process.exit(0);