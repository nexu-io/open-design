// Pure logic for the hand-off slice: no React, no transport, no DOM. Tests
// with zero doubles.
import type { AgentInfo, HostEditorsResponse } from '@open-design/contracts';
import { useT } from '../../i18n';
import { CLI_ORDER, FALLBACK_CLI_TARGETS } from './constants';
import type { CliHandoffLabels, CliTarget, FallbackEditorTarget, FrameworkId } from './types';

type Translate = ReturnType<typeof useT>;

/** `'amr'` renders under the product's own name rather than its internal
 * catalogue label. */
export function cliDisplayName(agent: Pick<CliTarget, 'id' | 'name'>): string {
  return agent.id === 'amr' ? 'Open Design' : agent.name;
}

/** Merge the daemon's `/api/agents` probe onto the fallback catalogue (so the
 * CLI tab is never blank while the probe is in flight) and sort by the
 * curated `CLI_ORDER`, falling back to alphabetical display name for anything
 * not listed there. */
export function mergeCliTargets(agents: AgentInfo[] | undefined): CliTarget[] {
  const byId = new Map<string, CliTarget>();
  for (const target of FALLBACK_CLI_TARGETS) {
    byId.set(target.id, target);
  }
  for (const agent of agents ?? []) {
    byId.set(agent.id, {
      id: agent.id,
      name: cliDisplayName(agent),
      bin: agent.bin,
      available: agent.available,
      version: agent.version,
    });
  }
  return [...byId.values()].sort((a, b) => {
    const ai = CLI_ORDER.indexOf(a.id);
    const bi = CLI_ORDER.indexOf(b.id);
    const ao = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
    const bo = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
    if (ao !== bo) return ao - bo;
    return cliDisplayName(a).localeCompare(cliDisplayName(b));
  });
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function frameworkLabel(id: FrameworkId, t: Translate): string {
  switch (id) {
    case 'vue':
      return t('handoff.framework.vue');
    case 'svelte':
      return t('handoff.framework.svelte');
    case 'solid':
      return t('handoff.framework.solid');
    case 'next':
      return t('handoff.framework.next');
    case 'vanilla':
      return t('handoff.framework.vanilla');
    case 'react':
    default:
      return t('handoff.framework.react');
  }
}

export function frameworkPromptLabel(id: FrameworkId, t: Translate): string {
  switch (id) {
    case 'vue':
      return t('handoff.frameworkPrompt.vue');
    case 'svelte':
      return t('handoff.frameworkPrompt.svelte');
    case 'solid':
      return t('handoff.frameworkPrompt.solid');
    case 'next':
      return t('handoff.frameworkPrompt.next');
    case 'vanilla':
      return t('handoff.frameworkPrompt.vanilla');
    case 'react':
    default:
      return t('handoff.frameworkPrompt.react');
  }
}

export function buildCliHandoffPrompt({
  cli,
  frameworkPrompt,
  labels,
  projectDir,
  projectId,
  projectName,
}: {
  cli: CliTarget;
  frameworkPrompt: string;
  labels: CliHandoffLabels;
  projectDir: string;
  projectId: string;
  projectName?: string;
}): string {
  const name = projectName?.trim() || projectId;
  return `${labels.promptIntro}

\`\`\`
${projectDir}
\`\`\`

${labels.target}: ${frameworkPrompt}
${labels.cli}: ${cliDisplayName(cli)}${cli.bin ? ` (${cli.bin})` : ''}

${labels.stepsLead}
1. ${labels.readFiles}
2. ${labels.keepDesign}
3. ${labels.produceCode}
4. ${labels.verify}

${labels.commandHint}

\`\`\`bash
cd ${shellQuote(projectDir)}
\`\`\`

${labels.project}: ${name}
${labels.projectId}: ${projectId}
`;
}

/** The zero-editors fallback single button: which catalogue id to launch and
 * what to label it, derived from the daemon's reported platform. */
export function fallbackEditorFor(platform: HostEditorsResponse['platform']): FallbackEditorTarget {
  if (platform === 'win32') return { id: 'explorer', label: 'Explorer' };
  if (platform === 'linux') return { id: 'file-manager', label: 'File Manager' };
  return { id: 'finder', label: 'Finder' };
}
