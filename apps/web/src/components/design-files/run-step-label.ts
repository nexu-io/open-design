import type { useT } from '../../i18n';
import type { Dict } from '../../i18n/types';
import type { RunFailure, RunPhase, RunProgressStep } from '../../runtime/run-progress';

/**
 * The title Chat's own card for this tool family already carries (`op-title`
 * in ToolCard) — the same i18n key, not a paraphrase of it. Both surfaces are
 * describing one tool call, so a step must not read "运行 pnpm build" out here
 * while the card beside it in Chat is headed "Bash".
 *
 * A family Chat has no card title for — a skill, an MCP tool, anything this
 * build has never seen — is headed by its RAW tool name there (GenericCard),
 * so it is headed by the raw name here too.
 */
const TITLE_KEY: Partial<Record<RunProgressStep['category'], keyof Dict>> = {
  write: 'tool.write',
  edit: 'tool.edit',
  read: 'tool.read',
  run: 'tool.bash',
  search: 'tool.search',
  fetch: 'tool.fetch',
};

/** One run step, titled the way Chat titles it, followed by what it acted on
 *  (Chat puts that in the card's `op-meta`, right of the same title). Shared by
 *  the empty state's feed and the building preview's caption, so the two
 *  surfaces can never word the same step differently. */
export function stepLabel(step: RunProgressStep, t: ReturnType<typeof useT>): string {
  if (step.title) return step.title;
  const titleKey = TITLE_KEY[step.category];
  const title = titleKey ? t(titleKey) : step.toolName;
  return step.target ? `${title} ${step.target}` : title;
}

/** Match the current chat execution header across all running phases.
 * Detailed tool activity remains in stepLabel rather than changing the run status. */
export function phaseLabel(_phase: RunPhase, t: ReturnType<typeof useT>): string {
  return t('chat.record.running');
}

/** The two terminal headings, taken from the keys the chat's task card uses so
 *  a dead run is worded identically on both sides of the split. */
const FAILURE_KEY: Record<RunFailure, keyof Dict> = {
  failed: 'critiqueTheater.failedHeading',
  canceled: 'assistant.canceledLabel',
};

/** How a run that did not finish is named in the ring. */
export function failureLabel(failure: RunFailure, t: ReturnType<typeof useT>): string {
  return t(FAILURE_KEY[failure]);
}
