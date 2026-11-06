/**
 * Pure renderer for the `## Active plugin` / `## Plugin inputs` / `## Plugin atoms`
 * blocks injected into `composeSystemPrompt()` (spec §11.8 PB1).
 *
 * Lives in contracts so the daemon and the contracts-side composer share
 * one definition; spec §11.8 byte-equality CI fixture is replaced by a
 * single-import compile-time guarantee. This file MUST stay free of
 * runtime dependencies — it only consumes `AppliedPluginSnapshot`.
 */
import type { AppliedPluginSnapshot } from '../plugins/apply.js';

export function renderPluginBlock(snapshot: AppliedPluginSnapshot): string {
  const lines: string[] = [];
  lines.push('\n\n## Active plugin');
  lines.push('');
  lines.push(
    `The user applied plugin **${snapshot.pluginTitle ?? snapshot.pluginId}** (\`${snapshot.pluginId}@${snapshot.pluginVersion}\`).`,
  );
  if (snapshot.pluginDescription) {
    lines.push('');
    lines.push(snapshot.pluginDescription.trim());
  }
  if (snapshot.query) {
    lines.push('');
    lines.push(`The plugin's example brief is: _${snapshot.query.trim()}_`);
  }

  const inputs = snapshot.inputs ?? {};
  const inputKeys = Object.keys(inputs).sort();
  if (inputKeys.length > 0) {
    lines.push('');
    lines.push('## Plugin inputs');
    lines.push('');
    lines.push(
      'Treat these as authoritative answers to questions the plugin author baked into the brief — do not re-ask the user about them.',
    );
    lines.push('');
    for (const key of inputKeys) {
      lines.push(`- **${key}**: ${formatInput(inputs[key])}`);
    }
  }

  const atomIds = snapshot.resolvedContext?.atoms ?? [];
  if (atomIds.length > 0) {
    lines.push('');
    lines.push('## Plugin atoms');
    lines.push('');
    lines.push(
      'The plugin opted into these workflow atoms; prefer them over ad-hoc shortcuts:',
    );
    lines.push('');
    for (const id of atomIds) lines.push(`- \`${id}\``);
  }

  return lines.join('\n');
}

function formatInput(value: string | number | boolean | undefined): string {
  if (value === undefined || value === null) return '(empty)';
  if (typeof value === 'string') return value.length > 0 ? value : '(empty)';
  return String(value);
}
