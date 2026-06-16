import type { randomUUID } from 'node:crypto';

export type PluginShareAction = 'publish-github' | 'contribute-open-design';

export interface PluginShareTask {
  id: string;
  projectId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  action: PluginShareAction | undefined;
  path: string | undefined;
  progress: string[];
  result: unknown;
  error: unknown;
  startedAt: number;
  endedAt: number | null;
  waiters: Set<() => void>;
  _gcScheduled?: boolean;
}

export interface CreatePluginShareTaskInfo {
  action?: PluginShareAction;
  path?: string;
}

export interface CreatePluginShareTaskStoreDeps {
  randomUUID: typeof randomUUID;
  execCommandViaLoginShell: (command: string, args: string[], opts?: Record<string, unknown>) => Promise<ExecCommandResult>;
  OD_NODE_BIN: string;
  OD_BIN: string;
}

interface ExecCommandResult {
  ok: boolean;
  stdout?: string;
  stderr?: string;
}

interface PluginShareStep {
  command?: string;
  stdout?: string;
  stderr?: string;
}

interface PluginShareCliPayload {
  ok?: boolean;
  repoUrl?: string;
  prUrl?: string;
  steps?: PluginShareStep[];
  error?: {
    label?: string;
    stderr?: string;
    stdout?: string;
  };
}

function parsePluginShareCliPayload(value: string | undefined): PluginShareCliPayload | null {
  if (!value) return null;
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object') return null;
  return parsed as PluginShareCliPayload;
}

const TASK_TTL_AFTER_DONE_MS = 10 * 60 * 1000;
const PLUGIN_SHARE_TERMINAL_STATUSES = new Set(['done', 'failed']);

function pluginShareActionToCli(action: PluginShareAction) {
  if (action === 'publish-github') {
    return {
      argv: ['plugin', 'publish-repo'],
      title: 'Publish repo',
      command: 'od plugin publish-repo',
      successMessage: 'Published plugin to GitHub.',
      failureCode: 'publish-repo-failed',
    };
  }
  return {
    argv: ['plugin', 'open-design-pr'],
    title: 'Open Design PR',
    command: 'od plugin open-design-pr',
    successMessage: 'Opened Open Design PR flow.',
    failureCode: 'open-design-pr-failed',
  };
}

function pluginShareProgressPlan(action: PluginShareAction) {
  if (action === 'publish-github') {
    return [
      'Resolve GitHub owner and validate plugin metadata',
      'Create or update the GitHub repository',
      'Push plugin files',
      'Return the repository URL',
    ];
  }
  return [
    'Ensure the Open Design fork exists',
    'Clone the fork and prepare a branch',
    'Copy the plugin into plugins/community',
    'Push the branch and open the PR form',
  ];
}

export function createPluginShareTaskStore(deps: CreatePluginShareTaskStoreDeps) {
  const pluginShareTasks = new Map<string, PluginShareTask>();

  function create(taskId: string, projectId: string, info: CreatePluginShareTaskInfo = {}) {
    const task: PluginShareTask = {
      id: taskId,
      projectId,
      status: 'queued',
      action: info.action,
      path: info.path,
      progress: [],
      result: null,
      error: null,
      startedAt: Date.now(),
      endedAt: null,
      waiters: new Set(),
    };
    pluginShareTasks.set(taskId, task);
    return task;
  }

  function get(taskId: string) {
    return pluginShareTasks.get(taskId) ?? null;
  }

  function appendProgress(task: PluginShareTask, line: unknown) {
    task.progress.push(String(line ?? ''));
    notify(task);
  }

  function snapshot(task: PluginShareTask, since = 0) {
    const out: Record<string, unknown> = {
      taskId: task.id,
      action: task.action,
      path: task.path,
      status: task.status,
      startedAt: task.startedAt,
      endedAt: task.endedAt,
      progress: task.progress.slice(since),
      nextSince: task.progress.length,
    };
    if (task.status === 'done') out.result = task.result;
    if (task.status === 'failed') out.error = task.error;
    return out;
  }

  function notify(task: PluginShareTask) {
    const wakers = Array.from(task.waiters);
    for (const w of wakers) {
      try {
        w();
      } catch {}
    }
    if (PLUGIN_SHARE_TERMINAL_STATUSES.has(task.status) && !task._gcScheduled) {
      task._gcScheduled = true;
      setTimeout(() => {
        if (task.waiters.size === 0) pluginShareTasks.delete(task.id);
      }, TASK_TTL_AFTER_DONE_MS).unref?.();
    }
  }

  async function run(task: PluginShareTask, folder: string) {
    const action = task.action ?? 'publish-github';
    const share = pluginShareActionToCli(action);
    appendProgress(task, `${share.title} started for ${task.path}`);
    appendProgress(task, `$ ${share.command} ${task.path}`);
    for (const step of pluginShareProgressPlan(action)) appendProgress(task, `- ${step}`);
    const result = await deps.execCommandViaLoginShell(
      deps.OD_NODE_BIN,
      [deps.OD_BIN, ...share.argv, folder, '--json'],
      { timeout: action === 'publish-github' ? 240_000 : 300_000 },
    );
    let payload: PluginShareCliPayload | null = null;
    try {
      payload = parsePluginShareCliPayload(result.stdout);
    } catch (error: unknown) {
      appendProgress(task, `Failed to parse CLI JSON output: ${error instanceof Error ? error.message : String(error)}`);
    }
    const stepLog = payload?.steps?.map((step) => step.stderr || step.stdout || step.command).filter(Boolean) ?? [];
    for (const line of stepLog) appendProgress(task, String(line).trim());
    if (!result.ok || !payload?.ok) {
      task.status = 'failed';
      task.error = {
        code: payload?.error?.label || share.failureCode,
        message: payload?.error?.stderr || payload?.error?.stdout || result.stderr || result.stdout || `${share.title} failed.`,
        log: stepLog.length > 0 ? stepLog : [result.stderr || result.stdout || `${share.command} failed`],
      };
      task.endedAt = Date.now();
      notify(task);
      return;
    }
    const url = payload.repoUrl || payload.prUrl || undefined;
    task.status = 'done';
    task.result = {
      message: url
        ? (action === 'publish-github' ? `Published plugin to ${url}.` : `Opened Open Design PR flow at ${url}.`)
        : share.successMessage,
      ...(url ? { url } : {}),
      log: stepLog,
    };
    task.endedAt = Date.now();
    notify(task);
  }

  function createAndStart(projectId: string, info: CreatePluginShareTaskInfo, folder: string) {
    const taskId = deps.randomUUID();
    const task = create(taskId, projectId, info);
    task.status = 'running';
    notify(task);
    void run(task, folder).catch((err: unknown) => {
      task.status = 'failed';
      task.error = {
        code: 'plugin-share-task-failed',
        message: err instanceof Error ? err.message : String(err),
        log: [err instanceof Error ? String(err.stack || err.message) : String(err)],
      };
      task.endedAt = Date.now();
      notify(task);
    });
    return task;
  }

  return { create, get, appendProgress, snapshot, notify, run, createAndStart };
}
