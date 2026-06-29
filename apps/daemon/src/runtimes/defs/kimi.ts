import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const KIMI_ISOLATED_SKILLS_DIR = '.od/kimi-skills';

export const kimiAgentDef = {
    id: 'kimi',
    name: 'Kimi CLI',
    bin: 'kimi',
    versionArgs: ['--version'],
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'kimi-k2-turbo-preview', label: 'kimi-k2-turbo-preview' },
      { id: 'moonshot-v1-8k', label: 'moonshot-v1-8k' },
      { id: 'moonshot-v1-32k', label: 'moonshot-v1-32k' },
    ],
    buildArgs: (prompt, _imagePaths, _extraAllowedDirs = [], options = {}, runtimeContext = {}) => {
      const args = ['-p', prompt, '--output-format', 'stream-json'];
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      // Isolate Kimi's skill discovery to a daemon-controlled directory so Kimi
      // cannot auto-inject random skills from ~/.kimi/skills, ~/.claude/skills,
      // ~/.codex/skills, or project-level skill dirs. Open Design composes the
      // selected skills into the system prompt itself, so Kimi auto-discovery is
      // not needed and is actively harmful: it can inject irrelevant or
      // competing skills (e.g. 'impeccable') and push the argv prompt past
      // Kimi's argv budget. See nexu-io/open-design#4796.
      if (runtimeContext.cwd) {
        const skillsDir = join(runtimeContext.cwd, KIMI_ISOLATED_SKILLS_DIR);
        if (!existsSync(skillsDir)) {
          mkdirSync(skillsDir, { recursive: true });
        }
        args.push('--skills-dir', skillsDir);
      }
      return args;
    },
    // Kimi's prompt mode requires the full composed prompt as `-p <prompt>`
    // and does not accept a stdin sentinel or prompt-file flag, so the prompt
    // has to travel as a single argv argument. Keep the Windows budget under
    // CreateProcess' ~32 KB ceiling; on POSIX the per-arg ceiling is far higher
    // (Linux MAX_ARG_STRLEN ~128 KB; macOS ARG_MAX ≥ 256 KB), so allow larger
    // composed prompts there (issue: default design router exceeds 100 KB).
    maxPromptArgBytes: 30_000,
    maxPromptArgBytesPosix: 120_000,
    streamFormat: 'json-event-stream',
    eventParser: 'kimi',
} satisfies RuntimeAgentDef;
