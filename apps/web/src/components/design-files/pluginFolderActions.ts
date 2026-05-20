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
    `2. **Read manifest.** Load \`${folderPath}/open-design.json\` and capture \`name\`, \`title\`, \`description\`, and \`version\`. These drive the PR title, body, and target path. Use your built-in file-reading tool when available, or \`cat ${folderPath}/open-design.json\` followed by manual JSON parsing, or \`node -e 'console.log(JSON.parse(require("fs").readFileSync("${folderPath}/open-design.json","utf8")).name)'\` for shell-only environments. **Do not assume the standalone \`jq\` binary is installed** (this is the CLI from \`brew install jq\`, not the \`--jq\` flag bundled with gh — \`gh ... --jq\` is fine because gh ships its own embedded library; \`jq\` as a free-standing command is NOT) — \`jq\` is not part of the OD agent runtime baseline and is missing from default macOS / Windows shells; reaching for it first will hard-fail and end the turn before the PR is ever opened.`,
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
    'Run the steps below in order. Report each command and its result. Stop on the first hard failure — do not retry blindly.',
    '',
    '1. **Pre-flight.** Check `gh --version` and `gh auth status`. If `gh` is missing, not logged in, or reports an invalid/expired token, print the exact install/login command for the user\'s platform and STOP — do not try to install anything yourself, and do not work around an auth failure (e.g. do not push to a different account as a fallback).',
    '',
    `2. **Read manifest.** Load \`${folderPath}/open-design.json\` and capture \`name\`, \`version\`, \`description\`, and \`plugin.repo\`. \`plugin.repo\` (a \`https://github.com/<owner>/<name>\` URL) names the target. Use your built-in file-reading tool when available, or \`cat ${folderPath}/open-design.json\` followed by manual JSON parsing, or \`node -e 'console.log(JSON.parse(require("fs").readFileSync("${folderPath}/open-design.json","utf8")).plugin.repo)'\` for shell-only environments. **Do not assume the standalone \`jq\` binary is installed** (this is the CLI from \`brew install jq\`, not the \`--jq\` flag bundled with gh — \`gh ... --jq\` is fine because gh ships its own embedded library; \`jq\` as a free-standing command is NOT) — \`jq\` is missing from default macOS / Windows shells and reaching for it first will hard-fail the turn before any publish work happens. If \`plugin.repo\` is missing, build it as \`https://github.com/<gh-login>/<plugin-name>\` from \`gh api user --jq .login\` plus the manifest \`name\`, write that URL back into the manifest, and re-run \`od plugin validate ${folderPath}\` before continuing.`,
    '',
    '3. **Check target repo state.** Parse `<owner>/<name>` from `plugin.repo`. Run `gh repo view <owner>/<name>`:',
    '   - HTTP 404 / "Could not resolve to a Repository" → repo does not exist; go to step 4a.',
    '   - HTTP 200 → repo exists; go to step 4b.',
    '   - Any other error (401, 403, network) → STOP and report; do not guess.',
    '',
    '4a. **Create + push (repo does not exist).**',
    `   - \`cd ${folderPath}\``,
    '   - `git init`',
    '   - `git add -A`',
    '   - `git commit -m "Initial commit: <name> v<version>"` using the author\'s configured git identity from `gh auth setup-git`. Do NOT override `user.name`/`user.email`.',
    '   - `git tag v<version>`',
    '   - `gh repo create <owner>/<name> --public --source . --push --description "<from manifest description>"`',
    '   - `git push --tags`',
    '',
    '4b. **Push to existing repo.**',
    `   - \`cd ${folderPath}\``,
    '   - If `.git` is not present, `git init` then `git remote add origin https://github.com/<owner>/<name>.git`. Otherwise reuse the existing remote.',
    '   - `git add -A`',
    '   - `git commit -m "Update: <name> v<version>"` — if `git status --porcelain` is empty, skip the commit instead of forcing an empty one.',
    '   - `git tag v<version>` — if the tag already exists locally OR on origin, skip; do NOT force-overwrite a published tag.',
    '   - `git push origin HEAD`',
    '   - `git push --tags`',
    '',
    '5. **Verify.** Run `gh repo view <owner>/<name> --json url,nameWithOwner` and confirm the `url` field comes back. This is the proof the repo is reachable post-publish.',
    '',
    '6. **Hand off.** Paste the resolved `https://github.com/<owner>/<name>` URL into chat with one short sentence — e.g. "Plugin published — open this URL to verify the published code." Then end the turn.',
    '',
    '**Hard constraints.** Treat these as inviolable:',
    '- Do NOT call `od plugin publish --to open-design` (or any `--to <catalog>` variant). That is the registry-submission flow, not the repository-publish flow.',
    '- Do NOT call the `AskUserQuestion` tool at any point in this turn. Fire-and-forget.',
    '- Do NOT try to install `gh`, `git`, or any other binary. Detect-and-instruct only.',
    '- Do NOT force-push (`--force` / `--force-with-lease`) and do NOT overwrite an existing tag. Fail and report instead.',
    '- Do NOT retry a failed step. Report the error and stop.',
  ].join('\n');
}

function normalizePluginFolderPath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}
