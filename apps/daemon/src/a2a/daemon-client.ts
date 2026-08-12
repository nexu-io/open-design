import {
  buildProjectRawFileUrl,
  type OpenDesignA2AArtifactData,
  type OpenDesignA2ARequestMetadata,
  type QuestionFormEnvelope,
} from '@open-design/contracts';
import { randomUUID } from 'node:crypto';

type JsonRecord = Record<string, unknown>;

export interface OpenDesignContextRef {
  projectId: string;
  conversationId: string;
}

export interface OpenDesignRunRef extends OpenDesignContextRef {
  runId: string;
}

export interface OpenDesignRunStatus extends OpenDesignRunRef {
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | string;
  errorCode?: string;
  error?: string;
  questionForm?: QuestionFormEnvelope;
  questionFormDiagnostic?: {
    source: 'assistant-text' | 'tool-result' | 'fallback';
    repaired: boolean;
    reason?: string;
  };
}

export interface OpenDesignRunResult {
  message: string | null;
  artifact: OpenDesignA2AArtifactData;
}

export interface OpenDesignA2ADaemonClient {
  resolveContext(
    metadata: OpenDesignA2ARequestMetadata,
    prompt: string,
  ): Promise<OpenDesignContextRef>;
  startRun(
    context: OpenDesignContextRef,
    prompt: string,
    metadata: OpenDesignA2ARequestMetadata,
  ): Promise<OpenDesignRunRef>;
  getRun(run: OpenDesignRunRef): Promise<OpenDesignRunStatus>;
  getRunMessage(runId: string): Promise<string | null>;
  getRunResult(run: OpenDesignRunRef): Promise<OpenDesignRunResult>;
  cancelRun(runId: string): Promise<void>;
}

export interface HttpOpenDesignA2ADaemonClientOptions {
  baseUrl: () => string | null;
}

export class HttpOpenDesignA2ADaemonClient implements OpenDesignA2ADaemonClient {
  private readonly baseUrlProvider: () => string | null;

  constructor(options: HttpOpenDesignA2ADaemonClientOptions) {
    this.baseUrlProvider = options.baseUrl;
  }

  async resolveContext(
    metadata: OpenDesignA2ARequestMetadata,
    prompt: string,
  ): Promise<OpenDesignContextRef> {
    if (metadata.projectId) {
      await this.getJson(`/api/projects/${encodeURIComponent(metadata.projectId)}`);
      const conversationId = await this.resolveConversationId(
        metadata.projectId,
        metadata.conversationId,
      );
      return { projectId: metadata.projectId, conversationId };
    }

    const name = metadata.projectName?.trim() || projectNameFromPrompt(prompt);
    const created = await this.request('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ id: slugifyProjectId(name), name }),
    });
    const project = isRecord(created.project) ? created.project : created;
    const projectId = stringValue(project.id);
    if (!projectId) throw new Error('Open Design project creation returned no project id');
    const conversationId = stringValue(created.conversationId)
      ?? await this.resolveConversationId(projectId, undefined);
    return { projectId, conversationId };
  }

  async startRun(
    context: OpenDesignContextRef,
    prompt: string,
    metadata: OpenDesignA2ARequestMetadata,
  ): Promise<OpenDesignRunRef> {
    await this.appendUserMessage(context, prompt);
    const body: JsonRecord = {
      projectId: context.projectId,
      conversationId: context.conversationId,
      message: prompt,
    };
    if (metadata.agentId) body.agentId = metadata.agentId;
    if (metadata.model) body.model = metadata.model;
    if (metadata.skillId) body.skillId = metadata.skillId;
    if (metadata.pluginId) body.pluginId = metadata.pluginId;
    if (metadata.pluginInputs) body.pluginInputs = metadata.pluginInputs;

    const created = await this.request('/api/runs', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const runId = stringValue(created.runId);
    if (!runId) throw new Error('Open Design run creation returned no run id');
    return { ...context, runId };
  }

  async getRun(run: OpenDesignRunRef): Promise<OpenDesignRunStatus> {
    const status = await this.getJson(`/api/runs/${encodeURIComponent(run.runId)}`);
    const errorCode = stringValue(status.errorCode);
    const error = stringValue(status.error);
    const questionForm = questionFormEnvelope(status.questionForm);
    const questionFormDiagnostic = normalizeQuestionFormDiagnostic(status.questionFormDiagnostic);
    return {
      ...run,
      status: stringValue(status.status) ?? 'running',
      ...(errorCode ? { errorCode } : {}),
      ...(error ? { error } : {}),
      ...(questionForm ? { questionForm } : {}),
      ...(questionFormDiagnostic ? { questionFormDiagnostic } : {}),
    };
  }

  async getRunMessage(runId: string): Promise<string | null> {
    const response = await this.fetch(`/api/runs/${encodeURIComponent(runId)}/events`);
    if (!response.ok) return null;
    const body = await response.text();
    const parts: string[] = [];
    for (const block of body.split(/\r?\n\r?\n/)) {
      let eventName = '';
      let dataLine = '';
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        if (line.startsWith('data:')) dataLine += line.slice(5).trim();
      }
      if (eventName !== 'agent' || !dataLine) continue;
      try {
        const event = JSON.parse(dataLine) as { type?: unknown; delta?: unknown };
        if (event.type === 'text_delta' && typeof event.delta === 'string') {
          parts.push(event.delta);
        }
      } catch {
        // Ignore malformed diagnostic events; the persisted assistant message
        // remains the source of truth for the Open Design UI.
      }
    }
    return parts.length > 0 ? parts.join('') : null;
  }

  async getRunResult(run: OpenDesignRunRef): Promise<OpenDesignRunResult> {
    const [message, runStatus, projectPayload, filesPayload, installInfo] = await Promise.all([
      this.getRunMessage(run.runId),
      this.getJson(`/api/runs/${encodeURIComponent(run.runId)}`),
      this.getJson(`/api/projects/${encodeURIComponent(run.projectId)}`),
      this.getJson(`/api/projects/${encodeURIComponent(run.projectId)}/files`),
      this.getJson('/api/mcp/install-info').catch((): JsonRecord => ({})),
    ]);
    const project = isRecord(projectPayload.project) ? projectPayload.project : projectPayload;
    const projectMetadata = isRecord(project.metadata) ? project.metadata : {};
    const files = Array.isArray(filesPayload.files)
      ? filesPayload.files.filter(isRecord)
      : [];
    const entryFile = stringValue(projectMetadata.entryFile) ?? resolveEntryFile(files);
    const previewUrl = entryFile
      ? buildProjectRawFileUrl(this.requireBaseUrl(), run.projectId, entryFile)
      : null;
    const webBaseUrl = stringValue(installInfo.webBaseUrl);
    const studioUrl = webBaseUrl
      ? buildStudioUrl(webBaseUrl, run.projectId, run.conversationId, entryFile)
      : null;
    const outputPolicy = isRecord(runStatus.outputPolicy)
      ? runStatus.outputPolicy as NonNullable<OpenDesignA2AArtifactData['outputPolicy']>
      : null;
    return {
      message,
      artifact: {
        schemaVersion: 1,
        projectId: run.projectId,
        conversationId: run.conversationId,
        runId: run.runId,
        ...(outputPolicy ? { outputPolicy } : {}),
        ...(entryFile ? { entryFile } : {}),
        ...(studioUrl ? { studioUrl } : {}),
        ...(previewUrl ? { previewUrl } : {}),
        files: files.slice(0, 200).flatMap((file) => {
          const name = stringValue(file.path) ?? stringValue(file.name);
          if (!name) return [];
          const mime = stringValue(file.mime);
          return [{
            name,
            ...(mime ? { mime } : {}),
            ...(typeof file.size === 'number' ? { size: file.size } : {}),
          }];
        }),
      },
    };
  }

  async cancelRun(runId: string): Promise<void> {
    await this.request(`/api/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
      body: '{}',
    });
  }

  private async resolveConversationId(
    projectId: string,
    requested: string | undefined,
  ): Promise<string> {
    const listed = await this.getJson(
      `/api/projects/${encodeURIComponent(projectId)}/conversations`,
    );
    const conversations = Array.isArray(listed.conversations)
      ? listed.conversations.filter(isRecord)
      : [];
    if (requested) {
      if (!conversations.some((conversation) => conversation.id === requested)) {
        throw new Error('Open Design conversation does not belong to the requested project');
      }
      return requested;
    }
    const first = conversations.map((conversation) => stringValue(conversation.id)).find(Boolean);
    if (first) return first;

    const created = await this.request(
      `/api/projects/${encodeURIComponent(projectId)}/conversations`,
      { method: 'POST', body: JSON.stringify({ title: 'A2A conversation' }) },
    );
    const conversation = isRecord(created.conversation) ? created.conversation : created;
    const conversationId = stringValue(conversation.id);
    if (!conversationId) throw new Error('Open Design conversation creation returned no id');
    return conversationId;
  }

  private async appendUserMessage(
    context: OpenDesignContextRef,
    content: string,
  ): Promise<void> {
    const messageId = randomUUID();
    const now = Date.now();
    await this.request(
      `/api/projects/${encodeURIComponent(context.projectId)}`
        + `/conversations/${encodeURIComponent(context.conversationId)}`
        + `/messages/${encodeURIComponent(messageId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          id: messageId,
          role: 'user',
          content,
          startedAt: now,
          endedAt: now,
        }),
      },
    );
  }

  private async getJson(path: string): Promise<JsonRecord> {
    return this.request(path, { method: 'GET' });
  }

  private async request(path: string, init: RequestInit): Promise<JsonRecord> {
    const response = await this.fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', 'x-od-client': 'a2a' },
    });
    const text = await response.text();
    const payload = text ? parseJsonRecord(text) : {};
    if (!response.ok) {
      const nestedError = isRecord(payload.error) ? payload.error : null;
      const message = stringValue(nestedError?.message)
        ?? stringValue(payload.error)
        ?? `Open Design daemon request failed (${response.status})`;
      throw new Error(message);
    }
    return payload;
  }

  private fetch(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${this.requireBaseUrl()}${path}`, init);
  }

  private requireBaseUrl(): string {
    const value = this.baseUrlProvider();
    if (!value) throw new Error('Open Design daemon URL is not available yet');
    return value.replace(/\/$/, '');
  }
}

function projectNameFromPrompt(prompt: string): string {
  const compact = prompt.replace(/\s+/g, ' ').trim().slice(0, 72);
  return compact || `A2A Design ${new Date().toISOString().slice(0, 10)}`;
}

function slugifyProjectId(name: string): string {
  const base = name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'a2a-design';
  return `${base}-${randomUUID().replace(/-/g, '').slice(0, 6)}`;
}

function resolveEntryFile(files: JsonRecord[]): string | undefined {
  const paths = files
    .map((file) => stringValue(file.path) ?? stringValue(file.name))
    .filter((path): path is string => Boolean(path));
  return paths.find((path) => path.toLowerCase() === 'index.html')
    ?? paths.find((path) => path.toLowerCase().endsWith('/index.html'))
    ?? (paths.filter((path) => !path.includes('/') && path.toLowerCase().endsWith('.html')).length === 1
      ? paths.find((path) => !path.includes('/') && path.toLowerCase().endsWith('.html'))
      : undefined);
}

function buildStudioUrl(
  webBaseUrl: string,
  projectId: string,
  conversationId: string,
  entryFile?: string,
): string {
  const base = `${webBaseUrl.replace(/\/$/, '')}/projects/${encodeURIComponent(projectId)}`
    + `/conversations/${encodeURIComponent(conversationId)}`;
  if (!entryFile) return base;
  const encoded = entryFile.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return `${base}/files/${encoded}`;
}

function parseJsonRecord(value: string): JsonRecord {
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function questionFormEnvelope(value: unknown): QuestionFormEnvelope | undefined {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.form)) return undefined;
  if (typeof value.form.id !== 'string' || typeof value.form.title !== 'string') return undefined;
  if (!Array.isArray(value.form.questions) || value.form.questions.length === 0) return undefined;
  return value as unknown as QuestionFormEnvelope;
}

function normalizeQuestionFormDiagnostic(
  value: unknown,
): OpenDesignRunStatus['questionFormDiagnostic'] | undefined {
  if (!isRecord(value)) return undefined;
  const source = value.source;
  if (source !== 'assistant-text' && source !== 'tool-result' && source !== 'fallback') return undefined;
  if (typeof value.repaired !== 'boolean') return undefined;
  const reason = stringValue(value.reason);
  return { source, repaired: value.repaired, ...(reason ? { reason } : {}) };
}
