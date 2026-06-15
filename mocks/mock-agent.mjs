#!/usr/bin/env node
/**
 * mock-agent.mjs — pretends to be one of OD's supported agent CLIs
 * (claude / opencode / codex / deepseek / qwen / grok) by streaming a
 * pre-recorded session in that CLI's native stdout protocol. Zero LLM
 * tokens.
 *
 * Usage (driven by the wrappers in bin/, not directly):
 *   ./mock-agent.mjs --as opencode [--no-delay] [--report-file <path>]
 *
 * Recording selection — see lib/recording-picker.mjs. The wrappers
 * announce the picked trace id on stderr.
 *
 * Trace data: ./recordings/<trace-id>.jsonl (anonymized exports from
 * Langfuse). Index: ./recordings/index.json.
 */

import { pickRecording, readRecording } from './lib/recording-picker.mjs';
import { renderAsOpencode }    from './lib/format-opencode.mjs';
import { renderAsCodex }       from './lib/format-codex.mjs';
import { renderAsClaude }      from './lib/format-claude.mjs';
import { renderAsGemini }      from './lib/format-gemini.mjs';
import { renderAsCursorAgent } from './lib/format-cursor-agent.mjs';
import { renderAsKimi }        from './lib/format-kimi.mjs';
import { renderAsPlain }       from './lib/format-plain.mjs';
import { runAcpServer }        from './lib/format-acp.mjs';
import { runVelaAcpServer }    from './lib/format-vela.mjs';
import { runVelaLogin, runVelaModels } from './lib/vela-subcommands.mjs';

function parseArgs(argv) {
  const opts = { as: null, noDelay: false, reportFile: null, positionals: [] };
  const flagsWithValue = new Set(['--as', '--agent', '--report-file', '-p', '--output-format', '--model', '-r']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--as' || a === '--agent') { opts.as = argv[++i]; continue; }
    if (a === '--no-delay')              { opts.noDelay = true; continue; }
    if (a === '--report-file')           { opts.reportFile = argv[++i]; continue; }
    if (flagsWithValue.has(a))           { i++; continue; }
    if (a.startsWith('-')) continue;     // Unknown flag — silently skip (model/permission flags etc.)
    // Anything left is a positional — used by vela subcommand dispatch.
    opts.positionals.push(a);
  }
  if (process.env.OD_MOCKS_NO_DELAY === '1') opts.noDelay = true;
  // Fall through to REPORT_FILE env when --report-file wasn't supplied.
  // Some harnesses (e.g. the agent-pr-explore orchestrator) set
  // REPORT_FILE as env but expect the agent to write there
  // autonomously — real opencode/claude do via their Write tool, but
  // the mock needs to project the recording's final assistant text to
  // that path so the harness sees a report.
  if (!opts.reportFile && process.env.REPORT_FILE) {
    opts.reportFile = process.env.REPORT_FILE;
  }
  return opts;
}

function failUsage(message) {
  process.stderr.write(`mock-agent: ${message}\n`);
  process.exit(2);
}

async function readStdinIfPiped() {
  if (process.stdin.isTTY) return '';
  return new Promise(resolve => {
    let acc = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', c => { acc += c; });
    process.stdin.on('end',  () => resolve(acc));
    process.stdin.on('error', () => resolve(acc));
    // Safety timeout in case the parent never closes stdin (PTY).
    setTimeout(() => resolve(acc), 1500);
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.as) {
    failUsage(
      '--as <agent> required\n' +
      '  supported: opencode | claude | amp | codex | gemini | cursor-agent |\n' +
      '             deepseek | qwen | grok | plain |\n' +
      '             kimi                                         (stream-json)\n' +
      '             devin | hermes | kilo | kiro | vibe          (ACP)\n' +
      '             vela                                          (AMR — vela CLI)\n',
    );
  }

  // `vela` dispatches by the first positional arg passed by OD (login /
  // models / agent). Subcommands run BEFORE recording selection because
  // they don't use trace data at all.
  if (opts.as === 'vela') {
    const cmd = (opts.positionals[0] || '').trim();
    if (cmd === 'login')  return runVelaLogin();
    if (cmd === 'models') return runVelaModels();
    // Default: `agent run --runtime opencode` — fall through to the ACP
    // server below with the vela-flavored protocol.
  }

  // Modern Kimi rejects the old `kimi acp ...` launch shape; keep the
  // shared mock aligned so adapter regressions fail fast in tests.
  if (opts.as === 'kimi' && opts.positionals.length > 0) {
    failUsage(`too many arguments: ${opts.positionals.join(' ')}`);
  }

  // ACP agents read JSON-RPC messages off stdin one line at a time, so the
  // bulk-prompt buffering logic below doesn't apply — pickRecording sees no
  // prompt for hash-mode (use OD_MOCKS_TRACE or _POOL instead).
  const ACP_AGENTS = new Set(['devin', 'hermes', 'kilo', 'kiro', 'vibe', 'vela']);
  const isAcp = ACP_AGENTS.has(opts.as);
  const prompt = isAcp ? '' : await readStdinIfPiped();
  const picked = await pickRecording({ prompt });
  if (!picked) {
    process.stderr.write(
      'mock-agent: no recordings on disk yet.\n' +
      'The recording corpus is hosted on Cloudflare R2 (see mocks/manifest.json)\n' +
      'and is fetched on demand. Run:\n' +
      '\n' +
      '  bash mocks/scripts/fetch-recordings.sh             # all 179 (~30s, 4.5MB)\n' +
      '  bash mocks/scripts/fetch-recordings.sh --agent claude   # subset\n' +
      '\n' +
      'Or set OD_MOCKS_RECORDINGS_DIR if you stashed them elsewhere.\n',
    );
    process.exit(3);
  }

  process.stderr.write(
    `[mock-${opts.as}] picked ${picked.traceId.slice(0, 8)}… via ${picked.method}` +
    (picked.pool ? ` (pool="${picked.pool}")` : '') +
    '\n',
  );

  const events = await readRecording(picked.path);
  const renderOpts = { noDelay: opts.noDelay, reportFile: opts.reportFile };

  switch (opts.as) {
    case 'opencode':     await renderAsOpencode(events, renderOpts);    break;
    case 'codex':        await renderAsCodex(events, renderOpts);       break;
    case 'claude':
    case 'amp':          await renderAsClaude(events, renderOpts);      break;
    case 'gemini':       await renderAsGemini(events, renderOpts);      break;
    case 'cursor-agent': await renderAsCursorAgent(events, renderOpts); break;
    case 'deepseek':
    case 'qwen':
    case 'grok':
    case 'plain':        await renderAsPlain(events, renderOpts);       break;
    case 'kimi':         await renderAsKimi(events, renderOpts);        break;
    // ACP family — JSON-RPC server over stdio.
    case 'devin':
    case 'hermes':
    case 'kilo':
    case 'kiro':
    case 'vibe':         await runAcpServer(events, renderOpts);        break;
    // AMR (vela CLI) — ACP with vela-specific protocol extensions
    // (agentCapabilities + models block + strict set_model gate).
    case 'vela':         await runVelaAcpServer(events, renderOpts);    break;
    default:
      failUsage(`unknown agent "${opts.as}"`);
  }
}

main().catch(err => {
  process.stderr.write(`mock-agent: ${err.message}\n`);
  process.exit(1);
});
