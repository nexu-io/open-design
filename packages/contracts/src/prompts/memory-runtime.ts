import type { ChatSessionMode } from '../api/chat.js';
import type { MediaSurface } from '../api/media.js';

export interface PromptMemoryHooks {
  rewrite?: boolean | undefined;
  verify?: boolean | undefined;
}

function memorySectionFacts(memoryBody: string): {
  hasIntentContext: boolean;
  hasVerifiedRules: boolean;
} {
  const lines = memoryBody.trim().split(/\r?\n/);
  let currentHeading: string | undefined;
  let looseContent = '';
  const sections = new Map<string, string[]>();

  for (const line of lines) {
    const heading = /^###\s+(.+?)\s*$/.exec(line)?.[1]?.trim().toLowerCase();
    if (heading) {
      currentHeading = heading;
      if (!sections.has(heading)) sections.set(heading, []);
      continue;
    }
    if (currentHeading) {
      sections.get(currentHeading)?.push(line);
    } else {
      looseContent += `${line}\n`;
    }
  }

  const sectionHasContent = (heading: string): boolean =>
    (sections.get(heading) ?? []).join('\n').trim().length > 0;
  const hasVerifiedRules = sectionHasContent('verified rules');
  const hasIntentContext =
    looseContent.trim().length > 0
    || Array.from(sections.entries()).some(
      ([heading, content]) =>
        heading !== 'verified rules' && content.join('\n').trim().length > 0,
    );
  return { hasIntentContext, hasVerifiedRules };
}

/**
 * Compact memory workflow for the slim prompt family. The card shapes are
 * host contracts; the surrounding rationale stays short and execution-profile
 * neutral so daemon and BYOK paths cannot contradict their handoff rules.
 */
export function renderSlimMemoryBlocks(
  memoryBody: string,
  memoryHooks: PromptMemoryHooks | undefined,
  sessionMode: ChatSessionMode | undefined = 'design',
  mediaSurface?: MediaSurface | null | undefined,
): string[] {
  const trimmedMemory = memoryBody.trim();
  if (!trimmedMemory) return [];
  const isDesignMode = sessionMode !== 'chat' && sessionMode !== 'plan';
  const isMediaSurface = mediaSurface !== undefined && mediaSurface !== null;
  const canEmitArtifactMemoryCards = isDesignMode && !isMediaSurface;
  const canProposeRules = sessionMode !== 'plan' && !isMediaSurface;
  const { hasIntentContext, hasVerifiedRules } = memorySectionFacts(trimmedMemory);

  const parts = [
    `\n\n## Personal memory (auto-extracted from past chats)\n\nUse memory for the user's established facts, tone, and terminology. The current turn and locked conversation decisions override it. Memory may fill gaps but cannot broaden the task, revive an old choice, reinterpret a correction, or activate workflow the session mode disables. Do not re-ask a captured fact unless current context conflicts; ask only when a critical target, permission, or conflict remains unresolved.\n\n${trimmedMemory}`,
  ];

  if (canEmitArtifactMemoryCards && hasIntentContext && (memoryHooks?.rewrite ?? true)) {
    parts.push(
      `\n\n## Intent gateway — turn short asks into a brief\n\nEmit this card only when the request would otherwise need material clarification, memory resolves every gap, and nothing conflicts with the current turn or locked decisions. Otherwise proceed without it or use the query-derived <question-form>. Skip it for [form answers — …], a clear edit/correction, or memory that affects only tone or presentation.\n\n<od-card type="task-brief">\n{ "summary": "<expanded intent in one line>", "fields": [ {"label": "Audience", "value": "…"}, {"label": "Deliverable", "value": "…"}, {"label": "Done means", "value": "…"} ] }\n</od-card>\n\nEmit at most one and continue without waiting. It replaces only fully resolved clarification, never workflow, verification, or handoff; do not restate it as prose.`,
    );
  }

  if (canEmitArtifactMemoryCards && hasVerifiedRules && (memoryHooks?.verify ?? true)) {
    parts.push(
      `\n\n## Self-verify against your verified rules\n\nAfter producing or editing an artifact, check every active **Verified rule**, fix failures, then emit:\n\n<od-card type="verify-scorecard">\n{ "status": "pass|partial|fail", "summary": "<result>", "rows": [ {"rule": "<check>", "status": "pass|fail|fixed", "note": "<result or fix>"} ] }\n</od-card>\n\nThe host validates rule coverage. Leave \`fail\` only when resolution needs an unavailable decision. Order: workflow self-check → scorecard → handoff. Skip only when no artifact changed.`,
    );
  }

  if (canProposeRules) {
    parts.push(
      `\n\n## Propose new verified rules from corrections\n\nWhen a correction clearly generalizes beyond this artifact and is objectively checkable, propose at most one; skip first-turn instructions, one-off content, local edits, and project/brand choices. Never save it silently:\n\n<od-card type="rule-proposal">\n{ "name": "<short name>", "description": "<one line>", "assertion": "<what must hold>", "check": "<how to verify it>", "rationale": "<why it generalizes>" }\n</od-card>`,
    );
  }

  return parts;
}
