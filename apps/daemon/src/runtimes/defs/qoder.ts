import path from 'node:path';
import { DEFAULT_MODEL_OPTION, parseLineSeparatedModels } from './shared.js';
import type { RuntimeAgentDef, RuntimeModelOption } from '../types.js';

const LIST_MODELS_HEADER = /^model$/i;

// Qoder CLI exposes the catalog of models available to the signed-in account
// through `--list-models`: a `MODEL` header followed by one model id per line
// (verified against qodercli 1.1.64). Every id is accepted verbatim by
// `--model`, so the picker can surface exactly what this install can run
// instead of a static tier list that drifts with each release.
export function parseQoderModelList(stdout: string): RuntimeModelOption[] | null {
  // The `MODEL` header is required: a headerless success (status or usage text
  // from an older or changed CLI) must not be reported as a live catalog, or
  // the picker offers ids that `--model` then rejects. Fail closed instead, and
  // let the adapter's default-only fallback take over.
  const lines = String(stdout ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim());
  const headerIndex = lines.findIndex((line) => line.length > 0);
  if (headerIndex === -1 || !LIST_MODELS_HEADER.test(lines[headerIndex] ?? '')) return null;
  const ids = lines.slice(headerIndex + 1).filter((line) => line.length > 0);
  if (ids.length === 0) return null;
  // Reuse the shared one-id-per-line parser, which prepends the synthetic
  // `default` option and de-dupes while preserving CLI order.
  return parseLineSeparatedModels(ids.join('\n'));
}

export const qoderAgentDef = {
    id: 'qoder',
    name: 'Qoder CLI',
    bin: 'qodercli',
    versionArgs: ['--version'],
    // Live discovery replaces the old static tier hints (`lite`, `efficient`,
    // `auto`, `performance`, `ultimate`): those are not ids Qoder accepts, so
    // selecting one made `buildArgs` pass an invalid `--model` value and the
    // run failed. When the probe cannot run, fail closed to the model the CLI
    // itself is configured with rather than offer unverified ids.
    fallbackModels: [DEFAULT_MODEL_OPTION],
    listModels: {
      args: ['--list-models'],
      parse: parseQoderModelList,
      timeoutMs: 15_000,
    },
    // Qoder print mode exits after the turn. Deliver the composed prompt via
    // stdin to avoid argv length limits, while using stream-json so the daemon
    // can surface text and usage incrementally. `--yolo` is Qoder's documented
    // non-interactive approval flag, and `-w` selects the workspace.
    // Authentication remains Qoder CLI-owned: users can rely on persisted
    // `qodercli login` state, or launch the daemon with
    // QODER_PERSONAL_ACCESS_TOKEN for automation. Do not add that token to
    // static adapter env; unlike Gemini's workspace trust flag it is a user
    // secret and already flows through the inherited process environment.
    buildArgs: (
      _prompt,
      imagePaths,
      extraAllowedDirs = [],
      options = {},
      runtimeContext = {},
    ) => {
      const args = [
        '-p',
        '--output-format',
        'stream-json',
        '--yolo',
      ];
      if (runtimeContext.cwd) {
        args.push('-w', runtimeContext.cwd);
      }
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      const dirs = (extraAllowedDirs || []).filter(
        (d) => typeof d === 'string' && path.isAbsolute(d),
      );
      const attachments = (imagePaths || []).filter(
        (p) => typeof p === 'string' && path.isAbsolute(p),
      );
      for (const d of dirs) args.push('--add-dir', d);
      for (const p of attachments) args.push('--attachment', p);
      return args;
    },
    promptViaStdin: true,
    streamFormat: 'qoder-stream-json',
} satisfies RuntimeAgentDef;
