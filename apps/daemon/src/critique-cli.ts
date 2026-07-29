import { resolveDaemonUrl } from './daemon-url.js';

const CRITIQUE_USAGE = `Usage:
  od critique conformance [--daemon-url <url>] [--window-days <n>] [--limit <n>]
      List recent conformance run history.
  od critique --help, -h
      Show this help.`;

// ---------------------------------------------------------------------------
// Public CLI entry point
// ---------------------------------------------------------------------------
export async function runCritiqueCli(args: string[]): Promise<{ exitCode: number }> {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(CRITIQUE_USAGE);
    return { exitCode: 0 };
  }

  const sub = args[0];
  const rest = args.slice(1);

  switch (sub) {
    case 'conformance':
      return handleConformance(rest);
    default:
      console.error(`Unknown critique subcommand: ${sub}`);
      console.error(CRITIQUE_USAGE);
      return { exitCode: 1 };
  }
}

// ---------------------------------------------------------------------------
// Subcommand handlers
// ---------------------------------------------------------------------------

async function handleConformance(args: string[]): Promise<{ exitCode: number }> {
  try {
    const base = await resolveDaemonUrl({ flagUrl: extractFlag(args, '--daemon-url') });
    const params = new URLSearchParams();
    const windowDays = extractFlag(args, '--window-days');
    const limit = extractFlag(args, '--limit');
    if (windowDays) params.set('windowDays', windowDays);
    if (limit) params.set('limit', limit);
    const qs = params.toString() ? `?${params.toString()}` : '';

    const resp = await fetch(`${base}/api/critique/conformance${qs}`);
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error(`critique: GET conformance failed (${resp.status}): ${text}`);
      return { exitCode: 1 };
    }
    const text = await resp.text();
    process.stdout.write(`${text}\n`);
    return { exitCode: 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`critique: ${msg}`);
    return { exitCode: 1 };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}
