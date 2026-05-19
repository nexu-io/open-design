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
  '- open-design.json with valid metadata, vendor/plugin-name naming when publishing, plugin.repo, mode, task kind, inputs, and any pipeline/context references',
  '- optional examples/ and assets/ when useful',
  '',
  'Then run or prepare the CLI path: od plugin validate, od plugin pack, local install/run validation, od plugin whoami/login through gh, and od plugin publish when the user is ready to open a registry PR.',
  '',
  'When finished, summarize files created, validation status, local install/run status, pack output, and the exact publish command or PR next step. End by clearly offering the next actions: Add to My plugins, Publish repo, or Open Design PR.',
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
