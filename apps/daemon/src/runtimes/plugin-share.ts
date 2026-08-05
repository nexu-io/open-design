import { PLUGIN_SHARE_ACTION_PLUGIN_IDS } from '@open-design/contracts';

export type PluginShareAction = keyof typeof PLUGIN_SHARE_ACTION_PLUGIN_IDS;

export const PLUGIN_SHARE_ACTION_LABELS: Record<PluginShareAction, string> = {
  'publish-github': 'Publish to GitHub',
  'contribute-open-design': 'Contribute to Open Design',
};

export interface PluginShareSource {
  id: string;
  title?: string | null;
}

export function githubRepoNameFromPluginName(name: unknown): string {
  const slug = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/(^[-._]+|[-._]+$)/g, '');
  return slug || 'open-design-plugin';
}

export function normalizePluginShareAction(input: unknown): PluginShareAction | null {
  const value = typeof input === 'string' ? input.trim() : '';
  return Object.prototype.hasOwnProperty.call(PLUGIN_SHARE_ACTION_PLUGIN_IDS, value)
    ? (value as PluginShareAction)
    : null;
}

export function renderPluginSharePrompt({
  action,
  sourcePlugin,
  stagedPath,
}: {
  action: PluginShareAction;
  sourcePlugin: PluginShareSource;
  stagedPath: string;
}): string {
  const title = sourcePlugin.title || sourcePlugin.id;
  if (action === 'publish-github') {
    return [
      `Publish the local Open Design plugin "${title}" as a new public GitHub repository.`,
      '',
      `The plugin source files have been copied into this project at \`${stagedPath}\`.`,
      'Use the local daemon share endpoint so the publish flow runs through Open Design\'s validated GitHub path:',
      '',
      '```bash',
      `curl -sS -X POST "$OD_DAEMON_URL/api/projects/$OD_PROJECT_ID/plugins/publish-github" \\`,
      `  -H 'content-type: application/json' \\`,
      `  -d '${JSON.stringify({ path: stagedPath })}'`,
      '```',
      '',
      'Read the JSON response. If `ok` is true, report the final repository URL and any validation/log summary. If it fails, report the `message`, `code`, and the useful log lines. The endpoint checks `gh` auth and performs the repository creation; do not hand-roll a second GitHub flow unless you are explaining a daemon endpoint failure.',
      '',
      'Do not rewrite the plugin unless publishing requires a small metadata fix. If you make any fix, explain it before publishing.',
    ].join('\n');
  }
  return [
    `Open a pull request to add the local Open Design plugin "${title}" to the Open Design repository.`,
    '',
    `The plugin source files have been copied into this project at \`${stagedPath}\`.`,
    'Use the local daemon share endpoint so the contribution flow runs through Open Design\'s validated GitHub path:',
    '',
    '```bash',
    `curl -sS -X POST "$OD_DAEMON_URL/api/projects/$OD_PROJECT_ID/plugins/contribute-open-design" \\`,
    `  -H 'content-type: application/json' \\`,
    `  -d '${JSON.stringify({ path: stagedPath })}'`,
    '```',
    '',
    'Read the JSON response. If `ok` is true, report the PR URL, branch, and any validation/log summary. If it fails, report the `message`, `code`, and the useful log lines. The endpoint checks `gh` auth, forks/clones, pushes, and opens the PR; do not hand-roll a second GitHub flow unless you are explaining a daemon endpoint failure.',
    '',
    'Keep the PR focused on this plugin. Report the PR URL and any validation you ran.',
  ].join('\n');
}
