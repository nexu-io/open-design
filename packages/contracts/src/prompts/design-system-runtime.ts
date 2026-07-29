import type { ChatSessionMode } from '../api/chat.js';
import type { MediaSurface } from '../api/media.js';
import type { ExecutionProfile } from '../execution-profile.js';
import {
  renderActiveDesignSystemIntro,
  renderCompactDesignSystemContext,
  renderPlanDesignSystemContext,
  renderVisualMediaDesignSystemContext,
} from './host-runtime.js';

export type DesignSystemImportMode = 'normalized' | 'hybrid' | 'verbatim';

export interface DesignSystemPromptBlocksOptions {
  title?: string | undefined;
  body: string;
  usageMd?: string | undefined;
  tokensCss?: string | undefined;
  componentsManifest?: string | undefined;
  fixtureHtml?: string | undefined;
  pullIndex?: string | undefined;
  corePullIndex?: string | undefined;
  importMode?: DesignSystemImportMode | undefined;
  sessionMode?: ChatSessionMode | undefined;
  mediaSurface?: MediaSurface | null | undefined;
  executionProfile?: ExecutionProfile | undefined;
}

const DEFAULT_DESIGN_SYSTEM_USAGE = `Read DESIGN.md for visual principles, paste the provided tokens.css declarations into the first <style>, and match component shapes from the reference component manifest or fixture when available. Treat any pull-layer index as optional context for deeper inspection; do not assume those files have already been loaded.`;

/**
 * Removes CSS comments without changing declarations or comment-like text
 * inside quoted strings. Replacing comments with whitespace preserves
 * boundaries between otherwise-adjacent CSS tokens.
 */
export function stripCssCommentsForPrompt(source: string): string {
  let output = '';
  let quote: '"' | "'" | undefined;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? '';
    const next = source[index + 1] ?? '';

    if (quote) {
      output += char;
      if (char === '\\' && index + 1 < source.length) {
        output += source[index + 1] ?? '';
        index += 1;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      output += char;
      continue;
    }

    if (char === '/' && next === '*') {
      const commentEnd = source.indexOf('*/', index + 2);
      if (commentEnd < 0) {
        // Preserve malformed input instead of silently discarding the rest of
        // a user-installed token file.
        output += char;
        continue;
      }
      let sawNewline = false;
      for (let cursor = index + 2; cursor < commentEnd; cursor += 1) {
        if (source[cursor] === '\n') sawNewline = true;
      }
      index = commentEnd + 1;
      output += sawNewline ? '\n' : ' ';
      continue;
    }

    output += char;
  }

  return output
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n')
    .trim();
}

export function renderDesignSystemImportModeGuidance(
  importMode: DesignSystemImportMode | undefined,
): string | undefined {
  if (importMode === 'normalized') {
    return 'This package is normalized. Treat tokens.css and DESIGN.md as the contract, and prefer OD token names over source-project names. Use pull-layer source evidence only as optional background.';
  }
  if (importMode === 'hybrid') {
    return 'This package is hybrid. Build with OD-normalized tokens first, then inspect pull-layer source evidence or snippets only when original component behavior, density, or naming would materially improve fidelity.';
  }
  if (importMode === 'verbatim') {
    return 'This package is verbatim-oriented. Preserve source semantics and source naming as much as possible. Before translating component behavior, inspect the relevant pull-layer source evidence or snippets when the runtime tool is available.';
  }
  return undefined;
}

function combinePullIndexes(indexes: Array<string | undefined>): string | undefined {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const index of indexes) {
    for (const rawLine of index?.trim().split(/\r?\n/) ?? []) {
      const line = rawLine.trim();
      if (!line || seen.has(line)) continue;
      seen.add(line);
      lines.push(line);
    }
  }
  return lines.length > 0 ? lines.join('\n') : undefined;
}

function selectPullIndexEntries(
  index: string | undefined,
  labelPattern: RegExp,
): string | undefined {
  if (!index?.trim()) return undefined;
  const lines = index.trim().split(/\r?\n/);
  const entries = lines.filter((line) => line.trim().startsWith('- ') && labelPattern.test(line));
  if (entries.length === 0) return undefined;
  const heading = lines.find((line) => !line.trim().startsWith('- '));
  return [heading, ...entries].filter(Boolean).join('\n');
}

/**
 * Shared portable renderer for the design-system part of the system prompt.
 * Daemon-only file access is represented only by optional pull indexes; every
 * other block is identical across daemon and API-fallback composition.
 */
export function renderDesignSystemPromptBlocks({
  title,
  body,
  usageMd,
  tokensCss,
  componentsManifest,
  fixtureHtml,
  pullIndex,
  corePullIndex,
  importMode,
  sessionMode,
  mediaSurface,
  executionProfile = 'filesystem',
}: DesignSystemPromptBlocksOptions): string[] {
  const designSystemBody = body.trim();
  if (!designSystemBody || mediaSurface === 'audio') return [];

  const isAskMode = sessionMode === 'chat';
  const isPlanMode = sessionMode === 'plan';
  const isMediaSurface = mediaSurface !== undefined && mediaSurface !== null;
  const isVisualMediaSurface = mediaSurface === 'image' || mediaSurface === 'video';
  const suffix = title ? ` — ${title}` : '';
  const planGuidancePullIndex = selectPullIndexEntries(
    corePullIndex,
    /\bfull design-system guidance\b/i,
  );
  const availablePullIndex = executionProfile === 'filesystem'
    ? combinePullIndexes(
        isAskMode
          ? [corePullIndex, pullIndex]
          : isPlanMode
            ? [planGuidancePullIndex, pullIndex]
            : [pullIndex],
      )
    : undefined;
  const usage = isVisualMediaSurface
    ? `Use this design system only as visual brand context for the ${mediaSurface} brief and generation prompt. Extract applicable palette, typography, mood, composition, and identity cues; ignore HTML, CSS, component implementation, seed-copy, and file-layout instructions.`
    : isAskMode
      ? availablePullIndex
        ? 'Use the compact context below to understand the active visual system for explanation or review. Treat it as evidence, not as an instruction to build. When the question requires exact implementation details, read only the relevant file declared in the pull-layer index.'
        : 'Use the compact context below to understand the active visual system for explanation or review. Treat it as evidence, not as an instruction to build.'
      : isPlanMode
        ? availablePullIndex
          ? 'Use the curated design-system context, compiled token declarations, and component inventory below to capture visual and implementation requirements in the plan. Read the full design guidance on demand only when an exact rule is material to the plan. Do not execute build steps in Plan mode.'
          : 'Use the curated design-system context, compiled token declarations, and component inventory below to capture visual and implementation requirements in the plan. Do not execute their build steps in Plan mode.'
        : usageMd?.trim() || DEFAULT_DESIGN_SYSTEM_USAGE;
  const context = isAskMode
    ? renderCompactDesignSystemContext(designSystemBody, usageMd)
    : isVisualMediaSurface
      ? renderVisualMediaDesignSystemContext(designSystemBody, usageMd)
      : isPlanMode
        ? renderPlanDesignSystemContext(designSystemBody, usageMd)
        : designSystemBody;
  const parts = [
    `\n\n## How to use this design system${suffix}\n\n${usage}`,
    `\n\n## Active design system${suffix}\n\n${renderActiveDesignSystemIntro(sessionMode, mediaSurface)}\n\n${context}`,
  ];

  const importModeGuidance = isMediaSurface || isAskMode
    ? undefined
    : renderDesignSystemImportModeGuidance(importMode);
  if (importModeGuidance) {
    parts.push(`\n\n## Design system import mode${suffix}\n\n${importModeGuidance}`);
  }

  const promptTokensCss = tokensCss ? stripCssCommentsForPrompt(tokensCss) : '';
  if (!isMediaSurface && !isAskMode && promptTokensCss) {
    const tokenUsage = isPlanMode
      ? 'Use these exact names and values as requirements for the plan. Record necessary token bindings and constraints without creating the final artifact in Plan mode.'
      : 'The block below is this brand\'s tokens.css contract — every `:root` custom property and any scoped override (e.g. `:root[lang=...]`) the brand defines. **Paste the unscoped `:root { ... }` block verbatim into the artifact\'s first `<style>`** so every `var(--*)` reference resolves at runtime.\n\nDo not invent new tokens. Do not redefine these values unless the user explicitly designated another provided source as the replacement brand or visual authority; in that case, replace the token set coherently instead of mixing visual authorities. Do not write raw hex outside the active `:root` token block. The DESIGN.md above is prose; this is the binding contract.';
    parts.push(
      `\n\n## Active design system tokens${suffix}\n\n${tokenUsage}\n\n\`\`\`css\n${promptTokensCss}\n\`\`\``,
    );
  }

  const manifest = componentsManifest?.trim();
  if (!isMediaSurface && !isAskMode && manifest) {
    const manifestUsage = isPlanMode
      ? 'Use this compact component inventory to specify component, state, token, focus, and spacing requirements in the plan. Do not generate the final components in Plan mode.'
      : 'A compact structured summary derived from this brand\'s components.html fixture. Use it as the component inventory for generated artifacts: match the listed selectors, component groups, class names, token references, focus behavior, and spacing cadence. Prefer these manifest entries over inventing new component shapes.';
    parts.push(
      `\n\n## Reference component manifest${suffix}\n\n${manifestUsage}\n\n\`\`\`text\n${manifest}\n\`\`\``,
    );
  } else if (!isAskMode && !isPlanMode && !isMediaSurface && fixtureHtml?.trim()) {
    parts.push(
      `\n\n## Reference fixture${suffix}\n\nA self-contained worked artifact in this design system. Match its component shapes (button structure, card structure, type-scale rhythm, focus ring, spacing cadence) when generating new artifacts. Copying fragments is encouraged as long as you keep the \`var(--*)\` references intact — they are already wired to the tokens above.\n\n\`\`\`html\n${fixtureHtml.trim()}\n\`\`\``,
    );
  }

  if (!isMediaSurface && availablePullIndex) {
    parts.push(
      `\n\n## Pull-layer files available on demand${suffix}\n\nThis design-system package declares files for optional inspection, source evidence, or human preview. The files below are not already present in this prompt. Read one only when its exact detail is material to the current task, using \`\"$OD_NODE_BIN\" \"$OD_BIN\" tools design-systems read --path <path>\`; the daemon will reject paths outside this manifest allowlist.\n\n\`\`\`text\n${availablePullIndex}\n\`\`\``,
    );
  }

  return parts;
}
