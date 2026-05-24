import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

// Google Antigravity CLI (`agy`). Successor to the Gemini CLI for
// individual / Google AI Pro / Google AI Ultra users after the June 18
// 2026 Gemini-CLI sunset (issue #2571).
//
// Surface notes (from `agy --help` on 1.0.0):
//   - `--print` / `-p` / `--prompt` runs a single non-interactive prompt
//     and prints the response to stdout. Reads the user prompt from
//     stdin when no positional prompt is supplied, which avoids the
//     Windows `spawn ENAMETOOLONG` failure mode for large composed
//     prompts (same reason gemini.ts and qwen.ts use stdin).
//   - `--dangerously-skip-permissions` auto-approves tool permission
//     requests so the web UI's no-TTY child doesn't block forever on a
//     hidden y/n prompt (mirrors gemini's `--yolo`).
//   - No `--model` flag is exposed on 1.0.0; model selection happens
//     against the user's signed-in Google AI plan. We still keep a
//     fallback model list so the picker shows reasonable Gemini choices
//     for cases where Antigravity does add a flag later.
export const antigravityAgentDef = {
    id: 'antigravity',
    name: 'Antigravity CLI',
    bin: 'agy',
    versionArgs: ['--version'],
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'gemini-3-pro-preview', label: 'gemini-3-pro-preview' },
      { id: 'gemini-3-flash-preview', label: 'gemini-3-flash-preview' },
      { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
      { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
    ],
    buildArgs: () => ['--print', '--dangerously-skip-permissions'],
    promptViaStdin: true,
    streamFormat: 'plain',
    // SettingsDialog's unavailable-agent row renders an "Install" /
    // "Docs" affordance only when these are set. Without them users
    // who don't have agy installed see a dead "Not detected" row.
    installUrl: 'https://antigravity.google/download',
    docsUrl: 'https://antigravity.google/docs',
} satisfies RuntimeAgentDef;
