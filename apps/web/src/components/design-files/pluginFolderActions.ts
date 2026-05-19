export type PluginFolderAgentAction = 'install' | 'publish' | 'contribute';

const ACTION_TITLES: Record<Exclude<PluginFolderAgentAction, 'contribute'>, string> = {
  install: 'Install this generated plugin into My plugins.',
  publish: 'Publish this generated plugin to a public repository.',
};

const ACTION_NOTES: Record<Exclude<PluginFolderAgentAction, 'contribute'>, string> = {
  install:
    'Prefer the supported `od plugin install --source` flow after confirming the manifest.',
  publish:
    'Use the supported `od plugin publish` or repository-publish flow after confirming the manifest.',
};

export function buildPluginFolderAgentActionPrompt(
  relativePath: string,
  action: PluginFolderAgentAction,
): string {
  const folderPath = normalizePluginFolderPath(relativePath);
  if (action === 'contribute') {
    return buildContributePrompt(folderPath);
  }
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

// `contribute` opens a draft PR against the `nexu-io/open-design` community
// catalog. The agent drives the whole git/gh sequence — fork, branch, copy
// the plugin into `plugins/community/<name>/`, commit, push, then hand the
// `gh pr create --web` URL back so the author reviews and clicks Create in
// their browser. Two design constraints encoded in the prompt:
//   - `--web` flag preserves the author's final review window (see
//     `apps/daemon/src/plugins/publish.ts` "We never POST anywhere" — the
//     author always sees the PR form before it lands).
//   - Hard ban on `AskUserQuestion`: a previous run stalled for 600s when
//     the agent paused mid-turn waiting for a host answer card that the
//     user expected the plugin-folder buttons to satisfy.
function buildContributePrompt(folderPath: string): string {
  return [
    'Open a draft Pull Request that adds this generated plugin to the Open Design community catalog at `nexu-io/open-design`.',
    'The goal is to end this turn with a single PR URL the user can click in their browser to review the pre-filled form and press Create.',
    '',
    `Plugin folder: \`${folderPath}\``,
    `Manifest: \`${folderPath}/open-design.json\``,
    '',
    'Run the steps below in order. Report each command and its result. Stop on the first hard failure — do not retry blindly.',
    '',
    '1. **Pre-flight.** Check `gh --version` and `gh auth status`. If `gh` is missing or not logged in, print the exact install/login command for the user\'s platform and STOP — do not try to install anything yourself.',
    '',
    `2. **Read manifest.** Load \`${folderPath}/open-design.json\` and capture \`name\`, \`title\`, \`description\`, and \`version\`. These drive the PR title, body, and target path.`,
    '',
    '3. **Resolve author identity.** Run `gh api user --jq .login` to get the author\'s GitHub login.',
    '',
    '4. **Fork the registry repo.** Run `gh repo fork nexu-io/open-design --remote=false`. Tolerate "already exists" / "existing fork" — it is idempotent.',
    '',
    '5. **Prepare contribution branch.** In a fresh temp directory:',
    '   - `gh repo clone <login>/open-design <tmp>` (clone the author\'s fork)',
    '   - `cd <tmp>` and `git checkout -b plugin/<name>-<unix-timestamp>`',
    '   - `mkdir -p plugins/community/<name>/`',
    `   - Copy the plugin folder contents from \`${folderPath}\` into \`plugins/community/<name>/\` (use \`cp -R\` or equivalent; preserve the directory layout).`,
    '   - `git add plugins/community/<name>`',
    '   - `git commit -m "Add <title> plugin"` (use the author\'s configured git identity from `gh auth setup-git`; do not override `user.name`/`user.email`).',
    '   - `git push -u origin plugin/<name>-<unix-timestamp>`',
    '',
    '6. **Open the PR in the browser.** Run:',
    '   ```',
    '   gh pr create \\',
    '     --repo nexu-io/open-design \\',
    '     --head <login>:plugin/<name>-<unix-timestamp> \\',
    '     --base main \\',
    '     --title "Add <title> plugin" \\',
    '     --body "<short summary citing manifest name, version, and description>" \\',
    '     --web',
    '   ```',
    '   The `--web` flag opens GitHub\'s PR-create form in the user\'s browser with the title and body pre-filled. **Do not omit `--web`. Do not auto-submit. Do not call `gh issue create`.** The author reviews the diff and clicks Create themselves.',
    '',
    '7. **Hand off.** Capture the URL `gh pr create --web` opened (the `https://github.com/<login>/open-design/pull/new/plugin/<name>-...` URL printed to stdout) and paste it into chat with a one-line instruction: "Open this URL and click Create to file the PR." Then end the turn.',
    '',
    '**Hard constraints.** Treat these as inviolable:',
    '- Do NOT call the `AskUserQuestion` tool at any point in this turn. This flow is fire-and-forget; no mid-turn questions.',
    '- Do NOT try to install `gh`, `git`, or any other binary. Detect-and-instruct only.',
    '- Do NOT auto-submit the PR. The final Create click is the author\'s.',
    '- Do NOT retry a failed step. Report the error and stop.',
    '- Do NOT call the legacy `od plugin publish --to open-design` CLI — that flow produces an issue URL, which is the old path we are replacing.',
  ].join('\n');
}

function normalizePluginFolderPath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}
