import type { useT } from '../../i18n';
import type { Dict } from '../../i18n/types';
import type { RunProgressStep } from '../../runtime/run-progress';

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
 *  the building preview's step feed and its cursor caption, so the two
 *  surfaces can never word the same step differently. */
export function stepLabel(step: RunProgressStep, t: ReturnType<typeof useT>): string {
  const titleKey = TITLE_KEY[step.category];
  const title = titleKey ? t(titleKey) : step.toolName;
  return step.target ? `${title} ${step.target}` : title;
}
