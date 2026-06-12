export type PluginFolderAgentAction = 'install' | 'publish' | 'contribute';

const INSTALL_TITLE = 'Install this generated plugin into My plugins.';
const INSTALL_NOTE =
  'Prefer the supported `od plugin install --source` flow after confirming the manifest.';

export function buildPluginFolderAgentActionPrompt(
  relativePath: string,
  action: PluginFolderAgentAction,
): string {
  const folderPath = normalizePluginFolderPath(relativePath);
  if (action === 'contribute') return buildContributePrompt(folderPath);
  if (action === 'publish') return buildPublishPrompt(folderPath);
  return [
    INSTALL_TITLE,
    '',
    `Plugin folder: \`${folderPath}\``,
    `Manifest: \`${folderPath}/open-design.json\``,
    '',
    'Please do this through the `od` CLI from the current project workspace, not through hidden UI APIs.',
    INSTALL_NOTE,
    'Read the manifest first to confirm the plugin name/version, run validation or doctor commands when relevant, then run the exact CLI command needed for this action.',
    'Report the commands you ran, the resulting URL/path if any, and any CLI, auth, or `gh` errors so I can ask follow-up questions in chat.',
  ].join('\n');
}

// `contribute` opens a draft PR against the `nexu-io/open-design` community
// catalog. The agent drives the whole git/gh sequence — fork, branch, copy
// the plugin into `plugins/community/<name>/`, commit, push, then hand the
// `gh pr create --web` URL back so the author reviews and clicks Create in
// their browser. Two design constraints encoded in the prompt:
//   - `--web` flag preserves the author's final review window (see
//     `apps/daemon/src/plugins/publish.ts` "We never POST anywhere" — the
//     author always sees the PR form before it lands).
//   - Hard ban on mid-turn clarification forms: a previous run stalled for
//     600s when the agent paused waiting for an answer the user expected the
//     plugin-folder buttons to satisfy.
function buildContributePrompt(folderPath: string): string {
  return [
    'Open a draft Pull Request that adds this generated plugin to the Open Design community catalog at `nexu-io/open-design`.',
    'The goal is to end this turn with a single PR URL the user can click in their browser to review the pre-filled form and press Create.',
    '',
    `Plugin folder: \`${folderPath}\``,
    `Manifest: \`${folderPath}/open-design.json\``,
    '',
    'Run this deterministic Open Design CLI workflow from the current project workspace:',
    '',
    `\`"$OD_NODE_BIN" "$OD_BIN" plugin open-design-pr ${folderPath}\``,
    '',
    'The CLI owns the GitHub auth gate and owner resolution: `--owner` if supplied, otherwise local `gh auth status`, with `gh api user --jq .login` only as a last-resort fallback. It then runs fork/clone/copy/branch/push and `gh pr create --web`. It must open the GitHub PR-create form in the browser; the author reviews and clicks Create themselves.',
    'Report the exact command, any structured CLI error, and the final PR URL printed by the CLI. Stop on failure; do not recreate the git/gh workflow manually.',
    '',
    '**Hard constraints.** Treat these as inviolable:',
    '- Do NOT emit a `<question-form>` or any clarification UI that waits for the user. This flow is fire-and-forget; no mid-turn questions.',
    '- Do NOT try to install `gh`, `git`, or any other binary. Detect-and-instruct only.',
    '- Do NOT auto-submit the PR. The final Create click is the author\'s.',
    '- Do NOT retry a failed step. Report the error and stop.',
    '- Do NOT call the legacy `od plugin publish --to open-design` CLI — that flow produces an issue URL, which is the old path we are replacing.',
  ].join('\n');
}

// `publish` pushes the generated plugin to the author's own public GitHub
// repository named by manifest `plugin.repo`. It is NOT the registry
// submission path — `od plugin publish --to open-design` produces an
// Open Design issue URL and belongs to the "Open Design PR" button. Before
// this rewrite the prompt said "Use the supported `od plugin publish` or
// repository-publish flow", which let the agent route through the legacy
// registry-link builder and never actually create the author's repo (see
// issue #2332). The new prompt enumerates the exact gh + git sequence and
// hard-bans the registry-submission CLI.
function buildPublishPrompt(folderPath: string): string {
  return [
    'Publish this generated plugin to a public GitHub repository owned by the author.',
    'The goal is to end this turn with a single repo URL the user can open in their browser to verify the published plugin code.',
    '',
    `Plugin folder: \`${folderPath}\``,
    `Manifest: \`${folderPath}/open-design.json\``,
    '',
    'This is the **repository publish** action, NOT the registry-submission action — do NOT route through `od plugin publish --to open-design`. That command emits an Open Design issue URL and belongs to the "Open Design PR" button.',
    '',
    'Run this deterministic Open Design CLI workflow from the current project workspace:',
    '',
    `\`"$OD_NODE_BIN" "$OD_BIN" plugin publish-repo ${folderPath}\``,
    '',
    'The CLI owns the GitHub auth gate and owner resolution: `--owner` if supplied, otherwise a trusted non-placeholder `plugin.repo` owner or local `gh auth status`, with `gh api user --jq .login` only as a last-resort fallback. It then handles manifest repo normalization, repo existence check, git commit/tag, repo create/update, push, and final verification. It publishes to the author\'s own repo; the target is not hard-coded and placeholder owners are rejected.',
    'Report the exact command, any structured CLI error, and the final repo URL printed by the CLI. Stop on failure; do not recreate the git/gh workflow manually.',
    '',
    '**Hard constraints.** Treat these as inviolable:',
    '- Do NOT call `od plugin publish --to open-design` (or any `--to <catalog>` variant). That is the registry-submission flow, not the repository-publish flow.',
    '- Do NOT emit a `<question-form>` or any clarification UI that waits for the user. Fire-and-forget.',
    '- Do NOT try to install `gh`, `git`, or any other binary. Detect-and-instruct only.',
    '- Do NOT force-push (`--force` / `--force-with-lease`) and do NOT overwrite an existing tag. Fail and report instead.',
    '- Do NOT retry a failed step. Report the error and stop.',
  ].join('\n');
}

function normalizePluginFolderPath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}
