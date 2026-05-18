export type PluginFolderAgentAction = 'install' | 'publish' | 'contribute';

const ACTION_TITLES: Record<PluginFolderAgentAction, string> = {
  install: 'Install this generated plugin into My plugins.',
  publish: 'Publish this generated plugin to a public repository.',
  contribute: 'Prepare an Open Design registry PR for this generated plugin.',
};

const ACTION_NOTES: Record<PluginFolderAgentAction, string> = {
  install:
    'Prefer the supported `od plugin install --source` flow after confirming the manifest.',
  publish:
    'Use the supported `od plugin publish` or repository-publish flow after confirming the manifest.',
  contribute:
    'Use the supported `od plugin publish` Open Design registry flow after confirming the manifest.',
};

export function buildPluginFolderAgentActionPrompt(
  relativePath: string,
  action: PluginFolderAgentAction,
): string {
  const folderPath = normalizePluginFolderPath(relativePath);
  return [
    ACTION_TITLES[action],
    '',
    `Plugin folder: \`${folderPath}\``,
    `Manifest: \`${folderPath}/open-design.json\``,
    '',
    'Please do this through the `od` CLI from the current project workspace, not through hidden UI APIs.',
    ACTION_NOTES[action],
    'Read the manifest first to confirm the plugin name/version, run validation or doctor commands when relevant, then run the exact CLI command needed for this action.',
    'Report the commands you ran, the resulting URL/path if any, and any CLI, auth, or `gh` errors so I can ask follow-up questions in chat.',
  ].join('\n');
}

function normalizePluginFolderPath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}
