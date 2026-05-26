import type { PluginUseAction } from '../plugins-home/useActions';

export type HomePromptHandoff =
  | {
    id: number;
    prompt: string;
    focus: boolean;
    source: 'plugin-authoring';
    goal: string;
    inputs: Record<string, unknown>;
    queryTemplate: string;
  }
  | {
    id: number;
    pluginId: string;
    focus: boolean;
    source: 'plugin-use';
    action: PluginUseAction;
    inputs?: Record<string, unknown>;
  };

export const PLUGIN_AUTHORING_GOAL_INPUT = 'pluginGoal';
export const PLUGIN_AUTHORING_DEFAULT_GOAL = "a reusable workflow described by the user's prompt";

export const PLUGIN_AUTHORING_PROMPT_TEMPLATE = [
  `Create an Open Design plugin for: {{${PLUGIN_AUTHORING_GOAL_INPUT}}}.`,
  '',
  'Run the agent-assisted plugin authoring flow end to end. Follow docs/plugins-spec.md and produce a folder named generated-plugin with:',
  '- SKILL.md describing the agent behavior and workflow',
  '- open-design.json with valid metadata: specVersion, name, version, description, mode, task kind, inputs, plus any pipeline / context references the workflow needs',
  '- plugin.repo is optional during scaffolding, but do not silently omit it: check `gh --version` and `gh auth status`, then prefer the local account login printed by auth status. Only use `gh api user --jq .login` as a fallback when auth status does not expose a login. If `gh` is missing, not logged in, rate-limited, or cannot resolve a real owner, omit plugin.repo instead of inventing an owner and explicitly report the auth problem with `gh auth refresh -h github.com -s repo,workflow`, `gh auth login -h github.com -s repo,workflow`, or `od plugin publish-repo generated-plugin --owner <github-login-or-org>` as recovery commands. Never write placeholder owners such as `open-design-user`, `<vendor>`, `example-user`, `your-org`, or `your-username` into the final manifest.',
  '- optional examples/ and assets/ when useful',
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

export const PLUGIN_AUTHORING_PROMPT = buildPluginAuthoringPrompt(PLUGIN_AUTHORING_DEFAULT_GOAL);

export function buildPluginAuthoringPrompt(goal: string | undefined): string {
  const normalizedGoal = normalizePluginAuthoringGoal(goal);
  return PLUGIN_AUTHORING_PROMPT_TEMPLATE.replace(
    `{{${PLUGIN_AUTHORING_GOAL_INPUT}}}`,
    normalizedGoal,
  );
}

export function normalizePluginAuthoringGoal(goal: string | undefined): string {
  const trimmed = goal?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : PLUGIN_AUTHORING_DEFAULT_GOAL;
}

export function buildPluginAuthoringInputs(goal: string | undefined): Record<string, unknown> {
  return { [PLUGIN_AUTHORING_GOAL_INPUT]: normalizePluginAuthoringGoal(goal) };
}

export function buildPluginAuthoringPromptForInputs(inputs: Record<string, unknown>): string {
  const value = inputs[PLUGIN_AUTHORING_GOAL_INPUT];
  return buildPluginAuthoringPrompt(typeof value === 'string' ? value : undefined);
}

function createPluginAuthoringPayload(goal: string | undefined) {
  const normalizedGoal = normalizePluginAuthoringGoal(goal);
  const inputs = buildPluginAuthoringInputs(normalizedGoal);
  return [
    normalizedGoal,
    inputs,
    buildPluginAuthoringPromptForInputs(inputs),
  ] as const;
}

export function createPluginAuthoringHandoff(
  id: number,
  goal?: string,
): HomePromptHandoff {
  const [normalizedGoal, inputs, prompt] = createPluginAuthoringPayload(goal);
  return {
    id,
    prompt,
    focus: true,
    source: 'plugin-authoring',
    goal: normalizedGoal,
    inputs,
    queryTemplate: PLUGIN_AUTHORING_PROMPT_TEMPLATE,
  };
}

export function createPluginUseHandoff(
  id: number,
  pluginId: string,
  options: {
    action?: PluginUseAction;
    inputs?: Record<string, unknown>;
  } = {},
): HomePromptHandoff {
  return {
    id,
    pluginId,
    action: options.action ?? 'use',
    ...(options.inputs ? { inputs: options.inputs } : {}),
    focus: true,
    source: 'plugin-use',
  };
}
