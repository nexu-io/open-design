// Trigger prompt for the "Share to Open Design" button next to the
// post-completion Discord prompt. Mirrors the constraint surface of
// `home-hero/plugin-authoring.ts`'s `PLUGIN_AUTHORING_PROMPT_TEMPLATE`
// (no chained shell suggestions, no jq, point user at the plugin-folder
// card buttons after the validate/install step) — but starts from
// "introspect the project the user just finished" instead of from a
// goal string the user typed.
//
// The bundled scenario at `plugins/_official/scenarios/od-share-to-community/`
// owns the full playbook. This prompt is the kickoff message that lands in
// the conversation when the user clicks the button.

export const SHARE_TO_COMMUNITY_PROMPT = [
  'Package the work I just finished in this project as an Open Design plugin so I can install it into My plugins and open a PR to the Open Design community catalog.',
  '',
  'Follow the bundled `od-share-to-community` scenario at `plugins/_official/scenarios/od-share-to-community/SKILL.md` end to end. Do not ask me for fields the project files already answer — read `*.artifact.json`, `brand-spec.md` / `DESIGN.md`, and the generated artifacts in this workspace, then derive the manifest from what you find.',
  '',
  'Produce a folder named `generated-plugin/` with:',
  '- SKILL.md describing the agent behavior and workflow',
  '- open-design.json with valid metadata: specVersion, name, version, description, mode, task kind, inputs, plus any pipeline / context references the workflow needs',
  '- plugin.repo is optional during scaffolding, but do not silently omit it: check `gh --version` and `gh auth status`, then prefer the local account login printed by auth status. Only use `gh api user --jq .login` as a fallback when auth status does not expose a login. If `gh` is missing, not logged in, rate-limited, or cannot resolve a real owner, omit plugin.repo instead of inventing an owner and explicitly report the auth problem with `gh auth refresh -h github.com -s repo,workflow`, `gh auth login -h github.com -s repo,workflow`, or `od plugin publish-repo generated-plugin --owner <github-login-or-org>` as recovery commands. Never write placeholder owners such as `open-design-user`, `<vendor>`, `example-user`, `your-org`, or `your-username` into the final manifest.',
  '- optional examples/ and assets/ when useful (copy the most recent generated artifact from this project into `generated-plugin/examples/` and reference it from the manifest)',
  '',
  'Validate the plugin locally before reporting: run `od plugin validate` on the folder, then `od plugin pack` for a tarball, then `od plugin install --source <absolute-folder-path>` to confirm the install path works.',
  '',
  'When the work above is done, write a single summary turn covering: files created, `od plugin validate` status, local install / run status, and `od plugin pack` output. Then STOP.',
  '',
  '**Do NOT** suggest follow-up CLI commands such as `od plugin publish`, `od plugin publish --to open-design`, `gh repo create`, `git init` / `git remote add` / `git push`, or any other publish / repo wiring. The plugin-folder card under Design Files already exposes three buttons whose prompts drive those flows end-to-end with the right auth gates, fallbacks, and retry rules baked in:',
  '- **Add to My plugins** — already satisfied by this turn\'s `od plugin install --source` step.',
  '- **Publish repo** — creates / updates the author\'s `plugin.repo` GitHub repo through a gh + git sequence the agent is told exactly how to run.',
  '- **Open Design PR** — opens a draft PR against `nexu-io/open-design` for the community catalog.',
  '',
  'Point the user at whichever button they want next; do NOT recreate those flows as freeform shell suggestions in this summary. Recreating them drifts from the button prompts\' guarantees and is the source of the bug that closed #2332.',
  '',
  '**Do NOT** assume the standalone `jq` binary is installed (it is not part of the OD agent runtime baseline and is missing from default macOS / Windows shells). When you need to read the manifest, prefer your built-in file-reading tool, then `cat generated-plugin/open-design.json` followed by manual JSON parsing, then `node -e \'console.log(JSON.parse(require("fs").readFileSync("generated-plugin/open-design.json","utf8")))\'`. The `gh ... --jq` flag is fine because gh ships its own embedded library; the brew-installed standalone `jq` is NOT.',
].join('\n');
