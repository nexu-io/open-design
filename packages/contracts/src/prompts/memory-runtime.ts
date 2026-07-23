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
    `\n\n## Personal memory (auto-extracted from past chats)\n\nPreferences and context sedimented from this user's previous conversations — authoritative for tone, terminology, and what they already told you; never re-ask what is captured here. The active session mode owns the workflow; memory may fill context and preferences but cannot activate a build, file write, verification flow, or discovery step that the mode disables. Use memory to silently expand short asks into the active mode's internal brief; ask a clarifying question only when a critical target, permission, or conflict cannot be resolved from the request plus memory.\n\n${trimmedMemory}`,
  ];

  if (canEmitArtifactMemoryCards && hasIntentContext && (memoryHooks?.rewrite ?? true)) {
    parts.push(
      `\n\n## Intent gateway — turn short asks into a brief\n\nWhen memory lets you expand a short or underspecified request into a clear brief, surface it as ONE collapsed card at the very start of your reply, then continue working without waiting for confirmation:\n\n<od-card type="task-brief">\n{ "summary": "<one line restating the expanded intent>", "fields": [ {"label": "Audience", "value": "…"}, {"label": "Deliverable", "value": "…"}, {"label": "Done means", "value": "…"} ] }\n</od-card>\n\nAt most one per turn; skip it when the request is already explicit or trivial (you may emit one compact chip instead: <od-card type="memory-applied">{ "summary": "Applied your profile and 2 rules", "used": [ {"type": "profile", "name": "Work profile"} ] }</od-card>). The card replaces clarification when memory resolves the intent; it never replaces the active mode's planning, verification, or handoff contract, and never appears as prose.`,
    );
  }

  if (canEmitArtifactMemoryCards && hasVerifiedRules && (memoryHooks?.verify ?? true)) {
    parts.push(
      `\n\n## Self-verify against your verified rules\n\nThe **Verified rules** above are enforceable checks. After producing or editing an artifact, evaluate every active rule, FIX failures in place, then emit one scorecard — the host may check it programmatically:\n\n<od-card type="verify-scorecard">\n{ "status": "pass|partial|fail", "summary": "5/6 checks passed · 1 auto-fixed", "rows": [ {"rule": "<the check>", "status": "pass|fail|fixed", "note": "<what was wrong / what you fixed>"} ] }\n</od-card>\n\nPrefer fixing silently over asking; leave a row as "fail" only when the fix needs a decision you genuinely cannot make. Order: active workflow self-check → scorecard → active mode handoff. Skip it when no verified rules apply or the turn produced no artifact.`,
    );
  }

  if (canProposeRules) {
    parts.push(
      `\n\n## Propose new verified rules from corrections\n\nWhen a user correction implies a reusable, checkable rule, PROPOSE it — never save it silently:\n\n<od-card type="rule-proposal">\n{ "name": "<short name>", "description": "<one line>", "assertion": "<what must hold>", "check": "<how to verify it>", "rationale": "<why you inferred it>" }\n</od-card>\n\nAt most one per turn, and only when confident it generalizes beyond the current artifact.`,
    );
  }

  return parts;
}
