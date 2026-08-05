import { parseFlags, positionalArgs, type CliFlags } from '../cli-args.js';

const SHARE_STRING_FLAGS = new Set([
  'daemon-url', 'url', 'title', 'text', 'copy-text', 'locale', 'platform',
]);
const SHARE_BOOLEAN_FLAGS = new Set(['help', 'h', 'json']);

interface ShareTarget {
  platform: string;
  shareUrl?: string;
  entryUrl?: string;
  [key: string]: unknown;
}

interface ShareResponse {
  copyText?: string;
  platforms?: ShareTarget[];
  [key: string]: unknown;
}

export interface ShareCliDeps {
  resolveDaemonBaseUrl: (flags: CliFlags) => Promise<string>;
  fetch: typeof globalThis.fetch;
  structuredHttpFailure: (response: Response) => Promise<never>;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  log: (text: string) => void;
  printHelp: () => void;
  exit: (code: number) => never;
}

export function runShare(args: readonly string[], deps: ShareCliDeps): Promise<void> {
  return runShareAsync(args, deps);
}

async function runShareAsync(args: readonly string[], deps: ShareCliDeps): Promise<void> {
  const wantsHelp = args.length === 0
    || args[0] === 'help'
    || args.includes('--help')
    || args.includes('-h');
  if (wantsHelp) {
    deps.printHelp();
    deps.exit(args.length === 0 ? 2 : 0);
  }

  const sub = args[0] && !args[0].startsWith('-') ? args[0] : 'open-design';
  const rest = sub === args[0] ? args.slice(1) : args;
  const flags = parseFlags([...rest], {
    string: SHARE_STRING_FLAGS,
    boolean: SHARE_BOOLEAN_FLAGS,
  });
  const base = (await deps.resolveDaemonBaseUrl(flags)).replace(/\/$/, '');
  const positional = positionalArgs([...rest], SHARE_STRING_FLAGS);
  const url = flags.url ?? positional[0];
  const body = sub === 'url'
    ? {
        kind: 'project-html' as const,
        url,
        title: flags.title,
        text: flags.text,
        copyText: flags['copy-text'],
        locale: flags.locale,
      }
    : {
        kind: 'open-design-repo' as const,
        title: flags.title,
        text: flags.text,
        copyText: flags['copy-text'],
        locale: flags.locale,
      };

  if (sub !== 'open-design' && sub !== 'url') {
    deps.writeStderr(`unknown share target: ${sub}\n`);
    deps.printHelp();
    deps.exit(2);
  }
  if (body.kind === 'project-html' && !body.url) {
    deps.writeStderr('Usage: od share url --url <https-url>\n');
    deps.exit(2);
  }

  const response = await deps.fetch(`${base}/api/social-share`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) return deps.structuredHttpFailure(response);
  const data = await response.json() as ShareResponse;
  if (flags.platform) {
    const target = (data.platforms ?? []).find((item) => item.platform === flags.platform);
    if (!target) {
      deps.writeStderr(`unknown platform: ${flags.platform}\n`);
      deps.exit(2);
    }
    if (flags.json === true) {
      deps.writeStdout(`${JSON.stringify(target, null, 2)}\n`);
      return;
    }
    if (target.shareUrl) {
      deps.log(target.shareUrl);
      return;
    }
    deps.log(data.copyText ?? '');
    if (target.entryUrl) deps.log(target.entryUrl);
    return;
  }
  if (flags.json === true) {
    deps.writeStdout(`${JSON.stringify(data, null, 2)}\n`);
    return;
  }
  deps.log(data.copyText ?? '');
  for (const target of data.platforms ?? []) {
    deps.log(`${target.platform}\t${target.shareUrl ?? target.entryUrl ?? '-'}`);
  }
}
