import { detectAcpModels, DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

// Design instructions injected into Reasonix's ACP system prompt via
// REASONIX_ACP_SYSTEM_APPEND. This ensures the model follows Open Design's
// design workflow (artifact output, design system, skill instructions)
// instead of treating every request as a pure coding task.
const DESIGN_INSTRUCTIONS = `# Open Design integration — MUST follow

You are running inside Open Design, a design tool. The user message contains
design context (system prompt, skill instructions, design system tokens).
Follow these rules:

1. **Output format**: Wrap your HTML output in <artifact> tags:
   <artifact>
   <!DOCTYPE html>
   <html>...</html>
   </artifact>

2. **Design system**: The user message includes a design system with colors,
   typography, spacing, and component patterns. Apply them consistently.

3. **Skill workflow**: The user message includes a skill (SKILL.md) with
   specific workflow instructions. Follow the skill's steps in order.

4. **No code fences**: Do NOT wrap HTML in \`\`\`html code fences.
   Output raw HTML inside <artifact> tags only.

5. **Single file**: Output a complete, self-contained HTML file with all
   CSS and JS inline. No external dependencies.

6. **Language**: Match the language of the user's prompt.`;

export const reasonixAgentDef = {
    id: 'reasonix',
    name: 'DeepSeek Reasonix',
    bin: 'reasonix',
    fallbackBins: ['dsnix'],
    versionArgs: ['--version'],
    fetchModels: async (resolvedBin, env) =>
      detectAcpModels({
        bin: resolvedBin,
        args: ['acp'],
        env,
        timeoutMs: 15_000,
        defaultModelOption: DEFAULT_MODEL_OPTION,
      }),
    // Reasonix ships an ACP (Agent Client Protocol) mode via `reasonix acp`
    // that speaks NDJSON JSON-RPC over stdio — the same wire format Hermes,
    // Kimi, Kilo, Kiro, and Vibe use. This avoids the Windows CreateProcess
    // ~32 KB command-line limit entirely: the prompt travels as a JSON-RPC
    // message body through stdin, not as a positional argv entry.
    buildArgs: () => ['acp'],
    streamFormat: 'acp-json-rpc',
    mcpDiscovery: 'mature-acp',
    externalMcpInjection: 'acp-merge',
    // reasonix 1.x (Go rewrite) expects MCP env as `{"KEY":"val"}` map,
    // not the `[{name, value}]` array shape that Hermes/Kimi/Vibe use.
    // The 0.x TypeScript releases accepted the array form; ≥1.0 needs map.
    acpMcpEnvFormat: 'map',
    // Inject design instructions into Reasonix's system prompt via env var.
    // Reasonix's ACP code reads REASONIX_ACP_SYSTEM_APPEND and appends it
    // to the code system prompt, so the model sees both coding + design rules.
    env: {
      REASONIX_ACP_SYSTEM_APPEND: DESIGN_INSTRUCTIONS,
    },
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro' },
      { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
    ],
    installUrl: 'https://github.com/esengine/DeepSeek-Reasonix',
    docsUrl: 'https://esengine.github.io/DeepSeek-Reasonix/',
} satisfies RuntimeAgentDef;
