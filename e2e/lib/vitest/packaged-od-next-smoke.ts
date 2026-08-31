export const PACKAGED_OD_NEXT_PROMPT = 'Create an OD Next active canary artifact';
export const PACKAGED_OD_NEXT_OUTPUT =
  'Created od-next-active-canary.html through the continued native session.';
export const PACKAGED_OD_NEXT_FILE = 'od-next-active-canary.html';
export const PACKAGED_OD_NEXT_HEADING = 'OD Next Active Canary';

export type PackagedOdNextStartResult = {
  appliedPluginSnapshotId: string;
  configStatus: number;
  conversationId: string;
  effectiveMode: string | null;
  initialInputStage: string | null;
  initialTerminal: boolean | null;
  projectId: string;
  projectStatus: number;
  requestedMode: string | null;
  runId: string;
  runStatus: number;
  strategyTaskProfile: string | null;
  taskExecutionId: string;
};

export type PackagedOdNextResult = {
  activeRunId: string | null;
  assistantContainsExpectedOutput: boolean;
  fileContainsExpectedHeading: boolean;
  fileStatus: number;
  outcome: string | null;
  physicalRunCount: number;
  status: string | null;
  taskExecutionId: string | null;
  terminal: boolean | null;
};

export async function startPackagedOdNextViaHttp(
  baseUrl: string,
): Promise<PackagedOdNextStartResult> {
  const request = (path: string, init?: RequestInit) => fetch(new URL(path, baseUrl), init);
  const currentConfigResponse = await request('/api/app-config');
  const currentConfig = currentConfigResponse.ok
    ? await currentConfigResponse.json() as { config?: Record<string, unknown> }
    : { config: {} };
  const configResponse = await request('/api/app-config', {
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
    body: JSON.stringify({ ...(currentConfig.config ?? {}), odNextStrategyMode: 'active' }),
  });
  const rolloutResponse = await request('/api/strategies/od-next/rollout');
  const rolloutBody = rolloutResponse.ok
    ? await rolloutResponse.json() as { status?: { effectiveMode?: string; requestedMode?: string } }
    : { status: {} };
  const projectId = `packaged-od-next-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const projectResponse = await request('/api/projects', {
    headers: { 'content-type': 'application/json' },
    method: 'POST',
    body: JSON.stringify({
      id: projectId,
      name: 'Packaged OD Next active smoke',
      conversationMode: 'design',
      automaticStrategyTaskProfile: 'prototype',
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  const projectBody = await projectResponse.json() as {
    appliedPluginSnapshotId?: string;
    conversationId?: string;
    project?: { metadata?: { strategyBinding?: { taskProfile?: string } } };
  };
  const conversationId = String(projectBody.conversationId ?? '');
  const requestId = `packaged-od-next-${Date.now().toString(36)}`;
  const runResponse = await request('/api/runs', {
    headers: { 'content-type': 'application/json' },
    method: 'POST',
    body: JSON.stringify({
      agentId: 'codex',
      message: PACKAGED_OD_NEXT_PROMPT,
      projectId,
      conversationId,
      assistantMessageId: `assistant-${requestId}`,
      clientRequestId: requestId,
      skillId: null,
      designSystemId: null,
      model: 'default',
      reasoning: 'default',
    }),
  });
  const runBody = await runResponse.json() as {
    runId?: string;
    strategyTask?: { inputStage?: string; terminal?: boolean };
    taskExecutionId?: string;
  };

  return {
    appliedPluginSnapshotId: String(projectBody.appliedPluginSnapshotId ?? ''),
    configStatus: configResponse.status,
    conversationId,
    effectiveMode: rolloutBody.status?.effectiveMode ?? null,
    initialInputStage: runBody.strategyTask?.inputStage ?? null,
    initialTerminal: runBody.strategyTask?.terminal ?? null,
    projectId,
    projectStatus: projectResponse.status,
    requestedMode: rolloutBody.status?.requestedMode ?? null,
    runId: String(runBody.runId ?? ''),
    runStatus: runResponse.status,
    strategyTaskProfile: projectBody.project?.metadata?.strategyBinding?.taskProfile ?? null,
    taskExecutionId: String(runBody.taskExecutionId ?? ''),
  };
}

export async function readPackagedOdNextViaHttp(
  baseUrl: string,
  start: Pick<PackagedOdNextStartResult, 'conversationId' | 'projectId' | 'runId' | 'taskExecutionId'>,
): Promise<PackagedOdNextResult> {
  const request = (path: string) => fetch(new URL(path, baseUrl));
  const [runResponse, runsResponse, fileResponse, messagesResponse] = await Promise.all([
    request(`/api/runs/${encodeURIComponent(start.runId)}`),
    request(`/api/runs?projectId=${encodeURIComponent(start.projectId)}`),
    request(`/api/projects/${encodeURIComponent(start.projectId)}/files/${encodeURIComponent(PACKAGED_OD_NEXT_FILE)}`),
    request(
      `/api/projects/${encodeURIComponent(start.projectId)}`
        + `/conversations/${encodeURIComponent(start.conversationId)}/messages`,
    ),
  ]);
  const runBody = runResponse.ok
    ? await runResponse.json() as {
      status?: string;
      strategyTask?: {
        activeRunId?: string;
        outcome?: string;
        taskExecutionId?: string;
        terminal?: boolean;
      };
    }
    : {};
  const runsBody = runsResponse.ok
    ? await runsResponse.json() as { runs?: Array<{ strategyTask?: { taskExecutionId?: string } }> }
    : { runs: [] };
  const fileText = fileResponse.ok ? await fileResponse.text() : '';
  const messagesBody = messagesResponse.ok
    ? await messagesResponse.json() as { messages?: Array<{ content?: string; role?: string }> }
    : { messages: [] };
  const strategyTask = runBody.strategyTask ?? null;

  return {
    activeRunId: strategyTask?.activeRunId ?? null,
    assistantContainsExpectedOutput: (messagesBody.messages ?? []).some((message) =>
      message.role === 'assistant' && String(message.content ?? '').includes(PACKAGED_OD_NEXT_OUTPUT),
    ),
    fileContainsExpectedHeading: fileText.includes(PACKAGED_OD_NEXT_HEADING),
    fileStatus: fileResponse.status,
    outcome: strategyTask?.outcome ?? null,
    physicalRunCount: (runsBody.runs ?? []).filter((run) =>
      run.strategyTask?.taskExecutionId === start.taskExecutionId,
    ).length,
    status: runBody.status ?? null,
    taskExecutionId: strategyTask?.taskExecutionId ?? null,
    terminal: strategyTask?.terminal ?? null,
  };
}

/**
 * Starts an automatic OD Next task through the packaged renderer's production
 * HTTP surface. The project payload intentionally omits explicit plugin and
 * snapshot authority so the daemon must resolve the shipped automatic route.
 */
export function packagedOdNextStartExpression(): string {
  return `
    (async () => {
      const prompt = ${JSON.stringify(PACKAGED_OD_NEXT_PROMPT)};
      const currentConfigResponse = await fetch('/api/app-config');
      const currentConfig = currentConfigResponse.ok
        ? await currentConfigResponse.json()
        : { config: {} };
      const configResponse = await fetch('/api/app-config', {
        headers: { 'content-type': 'application/json' },
        method: 'PUT',
        body: JSON.stringify({ ...(currentConfig.config ?? {}), odNextStrategyMode: 'active' }),
      });
      const rolloutResponse = await fetch('/api/strategies/od-next/rollout');
      const rolloutBody = rolloutResponse.ok ? await rolloutResponse.json() : { status: {} };

      const projectId = 'packaged-od-next-' + Date.now().toString(36)
        + '-' + Math.random().toString(36).slice(2, 8);
      const projectResponse = await fetch('/api/projects', {
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        body: JSON.stringify({
          id: projectId,
          name: 'Packaged OD Next active smoke',
          conversationMode: 'design',
          automaticStrategyTaskProfile: 'prototype',
          skillId: null,
          designSystemId: null,
          pendingPrompt: null,
          metadata: { kind: 'prototype' },
          skipDiscoveryBrief: true,
        }),
      });
      const projectBody = await projectResponse.json();
      const conversationId = String(projectBody.conversationId ?? '');
      const requestId = 'packaged-od-next-' + Date.now().toString(36);
      const runResponse = await fetch('/api/runs', {
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        body: JSON.stringify({
          agentId: 'codex',
          message: prompt,
          projectId,
          conversationId,
          assistantMessageId: 'assistant-' + requestId,
          clientRequestId: requestId,
          skillId: null,
          designSystemId: null,
          model: 'default',
          reasoning: 'default',
        }),
      });
      const runBody = await runResponse.json();

      return {
        appliedPluginSnapshotId: String(projectBody.appliedPluginSnapshotId ?? ''),
        configStatus: configResponse.status,
        conversationId,
        effectiveMode: rolloutBody.status?.effectiveMode ?? null,
        initialInputStage: runBody.strategyTask?.inputStage ?? null,
        initialTerminal: runBody.strategyTask?.terminal ?? null,
        projectId,
        projectStatus: projectResponse.status,
        requestedMode: rolloutBody.status?.requestedMode ?? null,
        runId: String(runBody.runId ?? ''),
        runStatus: runResponse.status,
        strategyTaskProfile: projectBody.project?.metadata?.strategyBinding?.taskProfile ?? null,
        taskExecutionId: String(runBody.taskExecutionId ?? ''),
      };
    })()
  `;
}

export function packagedOdNextSnapshotExpression(
  start: Pick<PackagedOdNextStartResult, 'conversationId' | 'projectId' | 'runId' | 'taskExecutionId'>,
): string {
  return `
    (async () => {
      const projectId = ${JSON.stringify(start.projectId)};
      const conversationId = ${JSON.stringify(start.conversationId)};
      const runId = ${JSON.stringify(start.runId)};
      const taskExecutionId = ${JSON.stringify(start.taskExecutionId)};
      const [runResponse, runsResponse, fileResponse, messagesResponse] = await Promise.all([
        fetch('/api/runs/' + encodeURIComponent(runId)),
        fetch('/api/runs?projectId=' + encodeURIComponent(projectId)),
        fetch('/api/projects/' + encodeURIComponent(projectId)
          + '/files/' + encodeURIComponent(${JSON.stringify(PACKAGED_OD_NEXT_FILE)})),
        fetch('/api/projects/' + encodeURIComponent(projectId)
          + '/conversations/' + encodeURIComponent(conversationId) + '/messages'),
      ]);
      const runBody = runResponse.ok ? await runResponse.json() : {};
      const runsBody = runsResponse.ok ? await runsResponse.json() : { runs: [] };
      const fileText = fileResponse.ok ? await fileResponse.text() : '';
      const messagesBody = messagesResponse.ok ? await messagesResponse.json() : { messages: [] };
      const runs = Array.isArray(runsBody.runs) ? runsBody.runs : [];
      const messages = Array.isArray(messagesBody.messages) ? messagesBody.messages : [];
      const strategyTask = runBody.strategyTask ?? null;

      return {
        activeRunId: strategyTask?.activeRunId ?? null,
        assistantContainsExpectedOutput: messages.some((message) =>
          message?.role === 'assistant'
          && String(message?.content ?? '').includes(${JSON.stringify(PACKAGED_OD_NEXT_OUTPUT)}),
        ),
        fileContainsExpectedHeading: fileText.includes(${JSON.stringify(PACKAGED_OD_NEXT_HEADING)}),
        fileStatus: fileResponse.status,
        outcome: strategyTask?.outcome ?? null,
        physicalRunCount: runs.filter((run) =>
          run?.strategyTask?.taskExecutionId === taskExecutionId,
        ).length,
        status: runBody.status ?? null,
        taskExecutionId: strategyTask?.taskExecutionId ?? null,
        terminal: strategyTask?.terminal ?? null,
      };
    })()
  `;
}

export function assertPackagedOdNextStartResult(value: unknown): PackagedOdNextStartResult {
  const candidate = value as Partial<PackagedOdNextStartResult> | null;
  if (
    candidate == null
    || typeof candidate !== 'object'
    || typeof candidate.appliedPluginSnapshotId !== 'string'
    || typeof candidate.configStatus !== 'number'
    || typeof candidate.conversationId !== 'string'
    || (typeof candidate.effectiveMode !== 'string' && candidate.effectiveMode !== null)
    || (typeof candidate.initialInputStage !== 'string' && candidate.initialInputStage !== null)
    || (typeof candidate.initialTerminal !== 'boolean' && candidate.initialTerminal !== null)
    || typeof candidate.projectId !== 'string'
    || typeof candidate.projectStatus !== 'number'
    || (typeof candidate.requestedMode !== 'string' && candidate.requestedMode !== null)
    || typeof candidate.runId !== 'string'
    || typeof candidate.runStatus !== 'number'
    || (typeof candidate.strategyTaskProfile !== 'string' && candidate.strategyTaskProfile !== null)
    || typeof candidate.taskExecutionId !== 'string'
  ) {
    throw new Error(`unexpected packaged OD Next start value: ${JSON.stringify(value)}`);
  }
  return candidate as PackagedOdNextStartResult;
}

export function assertPackagedOdNextResult(value: unknown): PackagedOdNextResult {
  const candidate = value as Partial<PackagedOdNextResult> | null;
  if (
    candidate == null
    || typeof candidate !== 'object'
    || (typeof candidate.activeRunId !== 'string' && candidate.activeRunId !== null)
    || typeof candidate.assistantContainsExpectedOutput !== 'boolean'
    || typeof candidate.fileContainsExpectedHeading !== 'boolean'
    || typeof candidate.fileStatus !== 'number'
    || (typeof candidate.outcome !== 'string' && candidate.outcome !== null)
    || typeof candidate.physicalRunCount !== 'number'
    || (typeof candidate.status !== 'string' && candidate.status !== null)
    || (typeof candidate.taskExecutionId !== 'string' && candidate.taskExecutionId !== null)
    || (typeof candidate.terminal !== 'boolean' && candidate.terminal !== null)
  ) {
    throw new Error(`unexpected packaged OD Next result: ${JSON.stringify(value)}`);
  }
  return candidate as PackagedOdNextResult;
}
