// @ts-nocheck
/**
 * @module cli/share/share
 */
import { cliDaemonUrl, parseFlags, positionalArgs, structuredHttpFailure } from '../core/index.js';

const SHARE_STRING_FLAGS = new Set([
  'daemon-url', 'url', 'title', 'text', 'copy-text', 'locale', 'platform',
]);

const SHARE_BOOLEAN_FLAGS = new Set([
  'help', 'h', 'json',
]);

function printShareUsage() {
  console.log(`Usage:
  od share open-design [--locale <locale>] [--platform <id>] [--json]
  od share url --url <https-url> [--title <title>] [--text <text>]
               [--copy-text <text>] [--locale <locale>] [--platform <id>] [--json]

Platforms:
  x, linkedin, facebook, reddit, telegram, whatsapp, weibo, line, instagram, xiaohongshu

Common options:
  --daemon-url <url>   Open Design daemon HTTP base.
  --json               Emit raw JSON.`);
}

export async function runShare(args) {
  const wantsHelp = args.length === 0
    || args[0] === 'help'
    || args.includes('--help')
    || args.includes('-h');
  if (wantsHelp) {
    printShareUsage();
    process.exit(args.length === 0 ? 2 : 0);
  }

  const sub = args[0] && !args[0].startsWith('-') ? args[0] : 'open-design';
  const rest = sub === args[0] ? args.slice(1) : args;
  const flags = parseFlags(rest, {
    string: SHARE_STRING_FLAGS,
    boolean: SHARE_BOOLEAN_FLAGS,
  });
  const base = (await cliDaemonUrl(flags)).replace(/\/$/, '');
  const positional = positionalArgs(rest, SHARE_STRING_FLAGS);
  const url = flags.url ?? positional[0];
  const body = sub === 'url'
    ? {
        kind: 'project-html',
        url,
        title: flags.title,
        text: flags.text,
        copyText: flags['copy-text'],
        locale: flags.locale,
      }
    : {
        kind: 'open-design-repo',
        title: flags.title,
        text: flags.text,
        copyText: flags['copy-text'],
        locale: flags.locale,
      };

  if (sub !== 'open-design' && sub !== 'url') {
    console.error(`unknown share target: ${sub}`);
    printShareUsage();
    process.exit(2);
  }
  if (body.kind === 'project-html' && !body.url) {
    console.error('Usage: od share url --url <https-url>');
    process.exit(2);
  }

  const resp = await fetch(`${base}/api/social-share`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  if (flags.platform) {
    const target = (data.platforms ?? []).find((item) => item.platform === flags.platform);
    if (!target) {
      console.error(`unknown platform: ${flags.platform}`);
      process.exit(2);
    }
    if (flags.json) return process.stdout.write(JSON.stringify(target, null, 2) + '\n');
    if (target.shareUrl) {
      console.log(target.shareUrl);
      return;
    }
    console.log(data.copyText);
    if (target.entryUrl) console.log(target.entryUrl);
    return;
  }
  if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  console.log(data.copyText);
  for (const target of data.platforms ?? []) {
    console.log(`${target.platform}\t${target.shareUrl ?? target.entryUrl ?? '-'}`);
  }
}
