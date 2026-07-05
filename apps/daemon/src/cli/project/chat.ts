// @ts-nocheck
/** @module cli/project/chat
 * Implements conversation and chat dispatchers for creating/listing conversations.
 * Supports conversation forking (--seed-from + --fork-after) for Side Chat workflow.
 * Collaborators: PROJECT_*_FLAGS, projectDaemonUrl from project.ts; positionalArgs from core.
 */
import { parseFlags, positionalArgs, structuredHttpFailure } from '../core/index.js';
import { PROJECT_BOOLEAN_FLAGS, PROJECT_STRING_FLAGS, projectDaemonUrl } from './project.js';

/**
 * Validates --mode flag to one of: design|chat|plan. Returns undefined if null/missing.
 * Exits 2 if mode is unrecognized.
 * @param {any} value - Raw flag value.
 * @returns {string|undefined} Normalized mode or undefined.
 */
export function normalizeChatSessionModeFlag(value) {
  if (value == null) return undefined;
  const mode = String(value).trim().toLowerCase();
  if (mode === 'design' || mode === 'chat' || mode === 'plan') return mode;
  console.error('--mode must be one of: design, chat, plan');
  process.exit(2);
}

/**
 * Main dispatcher for `od conversation` subcommands (new, list, info).
 * New supports --seed-from (copy conversation) and --fork-after (stop copy at message).
 */
export async function runConversation(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od conversation new  <projectId> [--title "<title>"] [--seed-from <cid>] [--fork-after <mid>] [--mode design|chat|plan]
                                           Create a conversation in a project.
                                           --seed-from copies another
                                           conversation's messages in (Side Chat).
                                           --fork-after stops the copy at one
                                           source message.
  od conversation list <projectId>           List conversations in a project.
  od conversation info <conversationId>      Print one conversation.

Common options:
  --daemon-url <url>   Open Design daemon HTTP base.
  --json               Emit raw JSON.`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  const flags = parseFlags(rest, { string: PROJECT_STRING_FLAGS, boolean: PROJECT_BOOLEAN_FLAGS });
  const base = (await projectDaemonUrl(flags)).replace(/\/$/, '');
  switch (sub) {
    case 'new': {
      const [id] = positionalArgs(rest, PROJECT_STRING_FLAGS);
      if (!id) {
        console.error('Usage: od conversation new <projectId> [--title "<title>"] [--seed-from <cid>] [--fork-after <mid>]');
        process.exit(2);
      }
      const body = {};
      if (typeof flags.title === 'string') body.title = flags.title;
      const sessionMode = normalizeChatSessionModeFlag(flags.mode);
      if (sessionMode) body.sessionMode = sessionMode;
      if (typeof flags['seed-from'] === 'string' && flags['seed-from']) {
        body.seedFromConversationId = flags['seed-from'];
      }
      if (typeof flags['fork-after'] === 'string' && flags['fork-after']) {
        if (!body.seedFromConversationId) {
          console.error('--fork-after requires --seed-from');
          process.exit(2);
        }
        body.forkAfterMessageId = flags['fork-after'];
      }
      const resp = await fetch(`${base}/api/projects/${encodeURIComponent(id)}/conversations`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (!resp.ok) return structuredHttpFailure(resp, 'project-not-found');
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      const conv = data.conversation;
      console.log(`[conversation] created ${conv?.id ?? '-'} (mode ${conv?.sessionMode ?? sessionMode ?? 'design'})`);
      return;
    }
    case 'list': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error('Usage: od conversation list <projectId>');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/projects/${encodeURIComponent(id)}/conversations`);
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      return;
    }
    case 'info': {
      const id = rest.find((a) => !a.startsWith('-'));
      if (!id) {
        console.error('Usage: od conversation info <conversationId>');
        process.exit(2);
      }
      const resp = await fetch(`${base}/api/conversations/${encodeURIComponent(id)}`);
      if (!resp.ok) return structuredHttpFailure(resp);
      const data = await resp.json();
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      return;
    }
    default:
      console.error(`unknown subcommand: od conversation ${sub}`);
      process.exit(2);
  }
}

/**
 * Main dispatcher for `od chat new` — Side Chat convenience wrapper around conversation new.
 * Accepts --project as flag or positional; requires exactly one of the two forms.
 * @async
 * @param {Array<string>} args - Subcommand and arguments.
 * @returns {Promise<void>} Outputs to stdout/stderr; exits on error.
 */
export async function runChat(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  od chat new --project <id> [--seed-from <cid>] [--fork-after <mid>] [--title "<title>"] [--mode design|chat|plan] [--json]
                                           Create a Side Chat — a new conversation
                                           that copies in another conversation's
                                           context (--seed-from). Use
                                           --fork-after to stop at one source
                                           message.

Common options:
  --daemon-url <url>   Open Design daemon HTTP base.
  --json               Emit raw JSON.`);
    process.exit(args.length === 0 ? 2 : 0);
  }
  const sub = args[0];
  const rest = args.slice(1);
  const flags = parseFlags(rest, { string: PROJECT_STRING_FLAGS, boolean: PROJECT_BOOLEAN_FLAGS });
  const base = (await projectDaemonUrl(flags)).replace(/\/$/, '');
  switch (sub) {
    case 'new': {
      // Accept --project for parity with the rest of the project-scoped CLI,
      // or a bare positional id for convenience.
      const id = typeof flags.project === 'string' && flags.project
        ? flags.project
        : positionalArgs(rest, PROJECT_STRING_FLAGS)[0];
      if (!id) {
        console.error('Usage: od chat new --project <id> [--seed-from <cid>] [--fork-after <mid>] [--title "<title>"]');
        process.exit(2);
      }
      const body = {};
      if (typeof flags.title === 'string') body.title = flags.title;
      const sessionMode = normalizeChatSessionModeFlag(flags.mode);
      if (sessionMode) body.sessionMode = sessionMode;
      if (typeof flags['seed-from'] === 'string' && flags['seed-from']) {
        body.seedFromConversationId = flags['seed-from'];
      }
      if (typeof flags['fork-after'] === 'string' && flags['fork-after']) {
        if (!body.seedFromConversationId) {
          console.error('--fork-after requires --seed-from');
          process.exit(2);
        }
        body.forkAfterMessageId = flags['fork-after'];
      }
      const resp = await fetch(`${base}/api/projects/${encodeURIComponent(id)}/conversations`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (!resp.ok) return structuredHttpFailure(resp, 'project-not-found');
      const data = await resp.json();
      if (flags.json) return process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      const conv = data.conversation;
      const seeded = body.seedFromConversationId
        ? ` (seeded from ${body.seedFromConversationId})`
        : '';
      const forked = body.forkAfterMessageId
        ? ` through ${body.forkAfterMessageId}`
        : '';
      console.log(`[chat] created ${conv?.id ?? '-'}${conv?.title ? ` "${conv.title}"` : ''}${seeded}${forked} (mode ${conv?.sessionMode ?? sessionMode ?? 'design'})`);
      return;
    }
    default:
      console.error(`unknown subcommand: od chat ${sub}`);
      process.exit(2);
  }
}
