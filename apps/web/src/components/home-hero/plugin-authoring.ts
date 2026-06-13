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
export const PLUGIN_AUTHORING_DEFAULT_GOAL_ZH_CN = '用户在提示词中描述的可复用工作流';

// Locales the Create-plugin prompt is authored for. Anything outside this set
// — including Traditional Chinese — falls back to English instead of shipping a
// half-translated prompt. Mirrors normalizeOrbitOutputLocale in
// apps/daemon/src/orbit.ts.
export type PluginAuthoringLocale = 'en' | 'zh-CN';

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

// Simplified-Chinese counterpart of PLUGIN_AUTHORING_PROMPT_TEMPLATE. The prose
// is translated, but every literal the agent must reproduce stays verbatim:
// command names, file paths, JSON keys, the `{{pluginGoal}}` placeholder, the
// banned placeholder owners, issue #2332, and the hardcoded-English button
// labels (Add to My plugins / Publish repo / Open Design PR) so a Chinese user
// is pointed at the buttons the UI actually renders.
export const PLUGIN_AUTHORING_PROMPT_TEMPLATE_ZH_CN = [
  `为以下目标创建一个 Open Design 插件：{{${PLUGIN_AUTHORING_GOAL_INPUT}}}。`,
  '',
  '端到端地走完 agent 辅助的插件创作流程。遵循 docs/plugins-spec.md，生成一个名为 generated-plugin 的文件夹，其中包含：',
  '- SKILL.md：描述 agent 的行为与工作流',
  '- open-design.json：包含合法的元数据：specVersion、name、version、description、mode、task kind、inputs，以及该工作流所需的任何 pipeline / context 引用',
  '- plugin.repo 在脚手架阶段是可选的，但不要悄悄省略它：先检查 `gh --version` 和 `gh auth status`，然后优先使用 auth status 打印出的本地账号登录名。仅当 auth status 没有暴露登录名时，才退回使用 `gh api user --jq .login`。如果 `gh` 缺失、未登录、被限流，或无法解析出真实的 owner，就省略 plugin.repo，而不要凭空编造一个 owner；并明确报告该鉴权问题，给出恢复命令：`gh auth refresh -h github.com -s repo,workflow`、`gh auth login -h github.com -s repo,workflow`，或 `od plugin publish-repo generated-plugin --owner <github-login-or-org>`。绝不要把诸如 `open-design-user`、`<vendor>`、`example-user`、`your-org`、`your-username` 这样的占位 owner 写进最终的 manifest。',
  '- 在有用时，可选地加入 examples/ 和 assets/',
  '',
  '在汇报之前先在本地验证插件：对该文件夹运行 `od plugin validate`，然后用 `od plugin pack` 打出 tarball，再用 `od plugin install --source <absolute-folder-path>` 确认安装路径可用。',
  '',
  '上述工作完成后，写一条总结回合，涵盖：创建了哪些文件、`od plugin validate` 的状态、本地安装 / 运行状态，以及 `od plugin pack` 的输出。然后停下（STOP）。',
  '',
  '**不要**建议任何后续的 CLI 命令，例如 `od plugin publish`、`od plugin publish --to open-design`、`gh repo create`、`git init` / `git remote add` / `git push`，或任何其他发布 / 仓库配置操作。Design Files 下的 plugin-folder 卡片已经提供了三个按钮，它们的 prompt 会端到端地驱动这些流程，并内置了正确的鉴权关卡、回退与重试规则：',
  '- **Add to My plugins** —— 本回合的 `od plugin install --source` 步骤已经满足它。',
  '- **Publish repo** —— 通过一段 agent 会被明确告知如何运行的 gh + git 序列，创建 / 更新作者的 `plugin.repo` GitHub 仓库。',
  '- **Open Design PR** —— 针对 `nexu-io/open-design` 打开一个草稿 PR，提交到社区目录。',
  '',
  '引导用户去点他们接下来想用的那个按钮；不要在这条总结里把这些流程重新写成自由形式的 shell 命令建议。重新实现这些流程会偏离按钮 prompt 的保证，正是导致 #2332 被关闭的那个 bug 的根源。',
  '',
  '**不要**假设系统装了独立的 `jq` 程序（它不在 OD agent 运行时基线里，默认的 macOS / Windows shell 也没有）。当你需要读取 manifest 时，优先用你内置的文件读取工具，其次是 `cat generated-plugin/open-design.json` 再手动解析 JSON，再次是 `node -e \'console.log(JSON.parse(require("fs").readFileSync("generated-plugin/open-design.json","utf8")))\'`。`gh ... --jq` 这个 flag 没问题，因为 gh 自带了内嵌的库；但用 brew 装的独立 `jq` 不行。',
].join('\n');

export const PLUGIN_AUTHORING_PROMPT = buildPluginAuthoringPrompt(PLUGIN_AUTHORING_DEFAULT_GOAL);

// Route any locale string to the set the prompt is authored for. Simplified
// Chinese (zh, zh-CN, zh-Hans, …) gets the localized prompt; Traditional
// Chinese (zh-TW / zh-HK / zh-MO / *-Hant) and everything else fall back to
// English. Mirrors normalizeOrbitOutputLocale in apps/daemon/src/orbit.ts.
export function normalizePluginAuthoringLocale(locale?: string | null): PluginAuthoringLocale {
  const normalized = locale?.trim().toLowerCase();
  if (!normalized) return 'en';
  const parts = normalized.split('-').filter(Boolean);
  const isTraditionalChinese =
    parts.includes('hant') || parts.some((part) => part === 'tw' || part === 'hk' || part === 'mo');
  if (normalized.startsWith('zh') && !isTraditionalChinese) return 'zh-CN';
  return 'en';
}

export function selectPluginAuthoringTemplate(locale?: string | null): string {
  return normalizePluginAuthoringLocale(locale) === 'zh-CN'
    ? PLUGIN_AUTHORING_PROMPT_TEMPLATE_ZH_CN
    : PLUGIN_AUTHORING_PROMPT_TEMPLATE;
}

function defaultPluginAuthoringGoal(locale?: string | null): string {
  return normalizePluginAuthoringLocale(locale) === 'zh-CN'
    ? PLUGIN_AUTHORING_DEFAULT_GOAL_ZH_CN
    : PLUGIN_AUTHORING_DEFAULT_GOAL;
}

export function buildPluginAuthoringPrompt(goal: string | undefined, locale?: string | null): string {
  const normalizedGoal = normalizePluginAuthoringGoal(goal, locale);
  return selectPluginAuthoringTemplate(locale).replace(
    `{{${PLUGIN_AUTHORING_GOAL_INPUT}}}`,
    normalizedGoal,
  );
}

export function normalizePluginAuthoringGoal(goal: string | undefined, locale?: string | null): string {
  const trimmed = goal?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : defaultPluginAuthoringGoal(locale);
}

export function buildPluginAuthoringInputs(
  goal: string | undefined,
  locale?: string | null,
): Record<string, unknown> {
  return { [PLUGIN_AUTHORING_GOAL_INPUT]: normalizePluginAuthoringGoal(goal, locale) };
}

export function buildPluginAuthoringPromptForInputs(
  inputs: Record<string, unknown>,
  locale?: string | null,
): string {
  const value = inputs[PLUGIN_AUTHORING_GOAL_INPUT];
  return buildPluginAuthoringPrompt(typeof value === 'string' ? value : undefined, locale);
}

function createPluginAuthoringPayload(goal: string | undefined, locale?: string | null) {
  const normalizedGoal = normalizePluginAuthoringGoal(goal, locale);
  const inputs = buildPluginAuthoringInputs(normalizedGoal, locale);
  return [
    normalizedGoal,
    inputs,
    buildPluginAuthoringPromptForInputs(inputs, locale),
  ] as const;
}

export function createPluginAuthoringHandoff(
  id: number,
  goal?: string,
  locale?: string | null,
): HomePromptHandoff {
  const [normalizedGoal, inputs, prompt] = createPluginAuthoringPayload(goal, locale);
  return {
    id,
    prompt,
    focus: true,
    source: 'plugin-authoring',
    goal: normalizedGoal,
    inputs,
    queryTemplate: selectPluginAuthoringTemplate(locale),
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
