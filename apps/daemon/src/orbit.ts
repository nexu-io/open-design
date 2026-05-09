import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';

import type { OrbitRunSummary, OrbitStatusResponse } from '@open-design/contracts/api/orbit';

import type { OrbitConfigPrefs } from './app-config.js';

export interface OrbitConnectorRunResult {
  connectorId: string;
  connectorName: string;
  accountLabel?: string;
  toolName?: string;
  toolTitle?: string;
  status: 'succeeded' | 'skipped' | 'failed';
  summary: string;
  error?: string;
}

export interface OrbitActivitySummary extends OrbitRunSummary {
  id: string;
  startedAt: string;
  completedAt: string;
  trigger: 'manual' | 'scheduled';
  templateSkillId?: string | null;
  connectorsChecked: number;
  connectorsSucceeded: number;
  connectorsFailed: number;
  connectorsSkipped: number;
  artifactId?: string;
  artifactProjectId?: string;
  agentRunId?: string;
  markdown: string;
  results: OrbitConnectorRunResult[];
}

export interface OrbitAgentRunResult {
  agentRunId: string;
  status: 'succeeded' | 'failed' | 'canceled';
  artifactId?: string;
  artifactProjectId?: string;
  summary?: string;
}

export interface OrbitRunHandlerStart {
  projectId: string;
  agentRunId: string;
  completion: Promise<OrbitAgentRunResult>;
}

export interface OrbitTemplateSelection {
  id: string;
  name: string;
  examplePrompt: string;
  dir: string;
  body: string;
  designSystemRequired: boolean;
}

export type OrbitRunHandler = (request: {
  runId: string;
  trigger: 'manual' | 'scheduled';
  startedAt: string;
  prompt: string;
  systemPrompt: string;
  template: OrbitTemplateSelection | null;
}) => Promise<OrbitRunHandlerStart>;

export function formatLocalProjectTimestamp(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function formatLocalOrbitPromptTimestamp(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const timeZoneName = new Intl.DateTimeFormat(undefined, { timeZoneName: 'shortOffset' })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value;
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}${timeZoneName ? ` (${timeZoneName})` : ''}`;
}

export type OrbitTemplateResolver = (skillId: string) => Promise<OrbitTemplateSelection | null>;

export interface OrbitStatus extends OrbitStatusResponse {
  config: OrbitConfigPrefs;
  running: boolean;
  nextRunAt: string | null;
  lastRun: OrbitActivitySummary | null;
  lastRunsByTemplate: Record<string, OrbitActivitySummary>;
}

export const DEFAULT_ORBIT_CONFIG: OrbitConfigPrefs = {
  enabled: false,
  time: '08:00',
  // Default to the general-purpose Orbit briefing skill so the daemon
  // runs an adaptive template out of the box. Mirrors apps/web's
  // DEFAULT_ORBIT — both surfaces must agree on the seed value to avoid
  // a "default in UI, null on disk" drift after the first save.
  templateSkillId: 'orbit-general',
};

const SUMMARY_FILE = 'activity-summary.json';

interface OrbitSummaryStore {
  lastRun: OrbitActivitySummary | null;
  lastRunsByTemplate: Record<string, OrbitActivitySummary>;
}

function isValidOrbitTime(time: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function normalizeOrbitConfig(config: Partial<OrbitConfigPrefs> | undefined): OrbitConfigPrefs {
  const time = typeof config?.time === 'string' && isValidOrbitTime(config.time)
    ? config.time
    : DEFAULT_ORBIT_CONFIG.time;
  const hasTemplateSkillId = config !== undefined && 'templateSkillId' in config;
  const defaultTemplateSkillId = DEFAULT_ORBIT_CONFIG.templateSkillId ?? null;
  return {
    enabled: Boolean(config?.enabled),
    time,
    templateSkillId: !hasTemplateSkillId
      ? defaultTemplateSkillId
      : typeof config?.templateSkillId === 'string' && config.templateSkillId.trim()
        ? config.templateSkillId.trim()
        : null,
  };
}

function orbitDir(dataDir: string): string {
  return path.join(dataDir, 'orbit');
}

function summaryFile(dataDir: string): string {
  return path.join(orbitDir(dataDir), SUMMARY_FILE);
}

async function readLastSummary(dataDir: string): Promise<OrbitActivitySummary | null> {
  return (await readSummaryStore(dataDir)).lastRun;
}

function isOrbitRunSummary(value: unknown): value is OrbitActivitySummary {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Partial<OrbitActivitySummary>;
  return (
    typeof obj.completedAt === 'string' &&
    typeof obj.connectorsChecked === 'number' &&
    typeof obj.connectorsSucceeded === 'number' &&
    typeof obj.connectorsFailed === 'number' &&
    typeof obj.connectorsSkipped === 'number' &&
    typeof obj.markdown === 'string'
  );
}

function normalizeSummaryStore(raw: unknown): OrbitSummaryStore {
  if (isOrbitRunSummary(raw)) {
    const templateSkillId = typeof raw.templateSkillId === 'string' && raw.templateSkillId.trim()
      ? raw.templateSkillId.trim()
      : null;
    return {
      lastRun: templateSkillId ? { ...raw, templateSkillId } : raw,
      lastRunsByTemplate: templateSkillId ? { [templateSkillId]: { ...raw, templateSkillId } } : {},
    };
  }
  if (!raw || typeof raw !== 'object') {
    return { lastRun: null, lastRunsByTemplate: {} };
  }
  const obj = raw as {
    lastRun?: unknown;
    lastRunsByTemplate?: Record<string, unknown>;
  };
  const lastRun = isOrbitRunSummary(obj.lastRun) ? obj.lastRun : null;
  const lastRunsByTemplate: Record<string, OrbitActivitySummary> = {};
  for (const [templateSkillId, summary] of Object.entries(obj.lastRunsByTemplate ?? {})) {
    if (!templateSkillId || !isOrbitRunSummary(summary)) continue;
    lastRunsByTemplate[templateSkillId] = {
      ...summary,
      templateSkillId,
    };
  }
  if (lastRun && typeof lastRun.templateSkillId === 'string' && lastRun.templateSkillId.trim()) {
    const templateSkillId = lastRun.templateSkillId.trim();
    if (!lastRunsByTemplate[templateSkillId]) {
      lastRunsByTemplate[templateSkillId] = { ...lastRun, templateSkillId };
    }
  }
  return { lastRun, lastRunsByTemplate };
}

async function readSummaryStore(dataDir: string): Promise<OrbitSummaryStore> {
  let raw: string;
  try {
    raw = await readFile(summaryFile(dataDir), 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { lastRun: null, lastRunsByTemplate: {} };
    }
    throw error;
  }

  try {
    return normalizeSummaryStore(JSON.parse(raw) as unknown);
  } catch {
    return { lastRun: null, lastRunsByTemplate: {} };
  }
}

async function writeLastSummary(dataDir: string, summary: OrbitActivitySummary): Promise<void> {
  const store = await readSummaryStore(dataDir);
  const dir = orbitDir(dataDir);
  await mkdir(dir, { recursive: true });
  const target = summaryFile(dataDir);
  const tmp = `${target}.${randomBytes(4).toString('hex')}.tmp`;
  const templateSkillId = typeof summary.templateSkillId === 'string' && summary.templateSkillId.trim()
    ? summary.templateSkillId.trim()
    : null;
  const nextStore: OrbitSummaryStore = {
    lastRun: summary,
    lastRunsByTemplate: templateSkillId
      ? {
          ...store.lastRunsByTemplate,
          [templateSkillId]: {
            ...summary,
            templateSkillId,
          },
        }
      : store.lastRunsByTemplate,
  };
  await writeFile(tmp, `${JSON.stringify(nextStore, null, 2)}\n`, 'utf8');
  await rename(tmp, target);
}

function nextDailyRunAt(time: string, now = new Date()): Date {
  const [hoursRaw, minutesRaw] = time.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  const next = new Date(now);
  next.setHours(Number.isFinite(hours) ? hours : 8, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

function renderMarkdown(summary: Omit<OrbitActivitySummary, 'markdown'>): string {
  const lines = [
    `# Daily Orbit Activity Summary`,
    '',
    `Generated: ${summary.completedAt}`,
    `Trigger: ${summary.trigger}`,
    '',
    `Checked ${summary.connectorsChecked} connector(s): ${summary.connectorsSucceeded} succeeded, ${summary.connectorsSkipped} skipped, ${summary.connectorsFailed} failed.`,
    '',
  ];
  for (const result of summary.results) {
    const title = result.accountLabel ? `${result.connectorName} (${result.accountLabel})` : result.connectorName;
    lines.push(`## ${title}`);
    lines.push(`- Status: ${result.status}`);
    if (result.toolTitle || result.toolName) lines.push(`- Tool: ${result.toolTitle ?? result.toolName}`);
    lines.push(`- Summary: ${result.summary}`);
    if (result.error) lines.push(`- Error: ${result.error}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

export function buildOrbitPrompt(now = new Date(), template?: OrbitTemplateSelection | null): string {
  const end = formatLocalOrbitPromptTimestamp(now);
  const start = formatLocalOrbitPromptTimestamp(new Date(now.getTime() - 24 * 60 * 60_000));
  const lines = [
    'Create today\'s Orbit daily digest as a Live Artifact.',
    '',
    `Use my connected work data from ${start} through ${end}.`,
  ];
  if (template) {
    lines.push('', `Use the selected Orbit template: ${template.name}.`);
  }
  return lines.join('\n');
}

export function buildOrbitSystemPrompt(now = new Date(), template?: OrbitTemplateSelection | null): string {
  const end = now.toISOString();
  const start = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
  const lines = [
    'Create a Live Artifact: a polished daily digest that helps a normal person understand what changed in their connected work data during the past 24 hours and what they should do next.',
    '',
    `Time window: ${start} through ${end}.`,
    '',
    'Work autonomously. Do not ask follow-up questions, do not emit a question form, and do not wait for user input. Use sensible defaults and proceed.',
    'Optimize for fast completion: sample at most 3 relevant data sources. DAILY DIGEST CONNECTOR CURATION IS REQUIRED WHEN SUPPORTED: first run `tools connectors list --use-case personal_daily_digest --format compact` with a 120s timeout, and if that curated list command times out or returns no output, retry it once with another 120s timeout. If the curated command is unsupported, rejected, or succeeds but returns no usable tools, immediately fall back to the unfiltered read-only list via `tools connectors list --format compact`; do not stop just because `--use-case` is unsupported. If connector discovery still fails, or if both the curated and fallback lists yield zero usable connected read-only data tools, do not create an empty-state artifact; send one concise final message explaining that data loading failed and stop. For individual source calls after discovery succeeds, if a source fails because of auth, permissions, timeout, malformed output, empty output, oversized output, or any other data-loading problem, do not get stuck trying to fix it; drop that source and continue with the others. After the artifact is registered successfully, send one concise final message with the artifact id and stop.',
    '',
    'Use the live-artifact skill to author and register the artifact. Prefer the curated daily-digest connector list first: `tools connectors list --use-case personal_daily_digest --format compact`. If that command is unsupported, rejected, or returns no usable tools, fall back to the unfiltered read-only list. Then call only the tools needed for a useful digest.',
    '- Prefer recent activity, search, list, updated, or changed-item tools that can be bounded to this 24-hour window.',
    '- Avoid provider metadata, api_root, schema, health, status, broad fetch_all, or block-content dump tools unless they are truly necessary.',
    '- When a tool needs an input file, write a small JSON file under `.daily-digest-tmp/` (create it if missing). Files at the project root show up in the user-facing Design Files panel, while dot-prefixed paths are hidden. Reuse the same path when retrying the same tool.',
    '- Never persist raw responses or sensitive fields in artifact files. Exclude headers, cookies, authorization values, tokens, secrets, credentials, passwords, stack traces, and unbounded raw payloads.',
    '',
    'Refresh support:',
    '- If at least one read-only data call succeeds, register exactly one refresh source in `document.sourceJson` using the live-artifact schema so the manual Refresh button can update the digest later.',
    '- Pick the most representative successful read-only data call, typically an activity/search/list call that represents "what changed in the last 24 hours" for the user.',
    '- Prefer a relative refresh window supported by the source, such as "last 24 hours" or an equivalent relative filter. Do not persist the literal ISO timestamps from this run if that would freeze future refreshes to this exact window.',
    '- Keep the refresh input bounded and free of credentials, raw payload dumps, headers, cookies, tokens, secrets, passwords, and raw response bodies.',
    '- If no read-only data call succeeds, omit `document.sourceJson`. Do not fabricate a refresh source. If refresh registration fails, retry once with a smaller bounded refresh input; if it still fails, create a static artifact without `document.sourceJson` rather than failing the entire digest.',
    '',
    'The artifact should include:',
    '- A plain-language headline and timestamp for the reporting window.',
    '- 3-5 key takeaways focused on actual changes, decisions, blockers, and opportunities.',
    '- A concise section for each useful source, such as code/repository activity, documents/notes/tasks, calendars, messages, or other work data when available.',
    '- Actionable recommendations for today: follow-ups, reviews, risks to check, and suggested next steps.',
    '- A short "What I checked today" footnote in user-friendly language that says what categories were reviewed, what was quiet, what was unavailable, and where data was sparse. Do not expose raw errors, HTTP codes, internal ids, tool names, schemas, refresh mechanics, daemon details, or system mechanics.',
    '- Links or identifiers when source data provides them.',
    '- If connector discovery succeeded and at least one source was checked, but the successful source results are quiet or empty, provide a useful quiet-day briefing with clear next steps. Do not create a digest when connector discovery itself failed or no usable connected read-only data tools were available.',
    '',
    'Voice and synthesis examples:',
    '- Code: “open-design had 4 repositories updated. The most notable change was a daemon update that affects data refresh behavior, so review it before the next release.”',
    '- Docs: “Product Notes and Launch Checklist were the only matching pages. Launch Checklist changed around onboarding and should be reviewed before sharing with the team.”',
    '- Recommendation: “Today, prioritize reviewing the changed release checklist, then follow up on the two open PRs that touched user-facing refresh behavior.”',
    '',
    'Keep the artifact compact: a single responsive HTML view, no more than roughly 200 lines of template/CSS, and no lengthy design critique pass. If connector discovery succeeded but checked data is sparse, empty, or partially unavailable, still create the Live Artifact and clearly state the useful human-facing outcome. If connector discovery failed or no usable connected read-only data tools are available, fail fast instead of creating an empty-state artifact. Do not invent activity. Keep the visual design polished but lightweight.',
    'Important: the user-facing artifact must not mention internal product, data plumbing, tool-running, automation terms, raw failure details, or system mechanics. Write it as a normal daily briefing for a person, not as a technical run report.',
  ];
  if (template) {
    lines.push(
      '',
      'Selected example template:',
      `- Skill id: ${template.id}`,
      `- Skill name: ${template.name}`,
      `- Staged root: .od-skills/${path.basename(template.dir)}/`,
      '',
      `Before writing the artifact, read ".od-skills/${path.basename(template.dir)}/SKILL.md" and, if present, ".od-skills/${path.basename(template.dir)}/example.html". Follow that staged template's structure, layout, tokens, domain rules, and visual language as the source of truth. The staged template is for visual/domain guidance; still use the live-artifact workflow to register the final artifact.`,
      '',
      'Selected template example prompt:',
      '',
      template.examplePrompt.trim(),
    );
  }
  return lines.join('\n');
}

export function renderOrbitTemplateSystemPrompt(template: OrbitTemplateSelection | null): string {
  if (!template) return '';
  return [
    `## Selected Orbit template skill — ${template.name}`,
    '',
    'This Orbit run was explicitly steered with the selected template skill below. Treat it as authoritative for the artifact structure, visual language, tokens, layout, and domain-specific synthesis rules.',
    'The generic Orbit digest brief and the live-artifact workflow still apply for data collection and artifact registration, but they must not override the selected template\'s visual/source-of-truth rules.',
    template.designSystemRequired
      ? 'If an active design system is also present, follow the selected template first for structure and interaction, then apply compatible design-system tokens only where the template permits them.'
      : 'This selected template opts out of external design-system injection. Do not apply the workspace design system or brand tokens; use only the template\'s own visual language.',
    '',
    'Before writing files, read the staged side files referenced by this skill, especially `example.html` when present, and mirror that example as instructed by the skill.',
    '',
    template.body.trim(),
  ].join('\n');
}

export class OrbitService {
  private config: OrbitConfigPrefs = DEFAULT_ORBIT_CONFIG;
  private timer: NodeJS.Timeout | null = null;
  private nextRunAtValue: Date | null = null;
  private starting: Promise<{ projectId: string; agentRunId: string }> | null = null;
  private inflight: Promise<OrbitActivitySummary> | null = null;
  private inflightProjectId: string | null = null;
  private inflightAgentRunId: string | null = null;
  private runHandler: OrbitRunHandler | null = null;
  private templateResolver: OrbitTemplateResolver | null = null;

  constructor(private readonly dataDir: string) {}

  setRunHandler(handler: OrbitRunHandler): void {
    this.runHandler = handler;
  }

  setTemplateResolver(resolver: OrbitTemplateResolver): void {
    this.templateResolver = resolver;
  }

  configure(config: Partial<OrbitConfigPrefs> | undefined): void {
    this.config = normalizeOrbitConfig(config);
    this.reschedule();
  }

  async status(): Promise<OrbitStatus> {
    const summaryStore = await readSummaryStore(this.dataDir);
    return {
      config: this.config,
      running: this.starting !== null || this.inflight !== null,
      nextRunAt: this.nextRunAtValue?.toISOString() ?? null,
      lastRun: summaryStore.lastRun,
      lastRunsByTemplate: summaryStore.lastRunsByTemplate,
    };
  }

  async start(trigger: 'manual' | 'scheduled'): Promise<{ projectId: string; agentRunId: string }> {
    if (this.inflight && this.inflightProjectId && this.inflightAgentRunId) {
      return { projectId: this.inflightProjectId, agentRunId: this.inflightAgentRunId };
    }
    if (this.starting) return this.starting;
    if (!this.runHandler) throw new Error('Orbit agent runner is not configured');

    this.starting = this.startRun(trigger).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async startRun(trigger: 'manual' | 'scheduled'): Promise<{ projectId: string; agentRunId: string }> {
    if (!this.runHandler) throw new Error('Orbit agent runner is not configured');

    const startedAt = new Date().toISOString();
    const runId = `orbit-${randomUUID()}`;
    const configuredTemplateSkillId = this.config.templateSkillId ?? null;
    const template = configuredTemplateSkillId && this.templateResolver
      ? await this.templateResolver(configuredTemplateSkillId).catch(() => null)
      : null;
    const now = new Date(startedAt);
    const prompt = buildOrbitPrompt(now, template);
    const systemPrompt = buildOrbitSystemPrompt(now, template);
    const handlerStart = await this.runHandler({
      runId,
      trigger,
      startedAt,
      prompt,
      systemPrompt,
      template,
    });

    this.inflightProjectId = handlerStart.projectId;
    this.inflightAgentRunId = handlerStart.agentRunId;
    this.inflight = (async () => {
      try {
        const agentResult = await handlerStart.completion;
        const completedAt = new Date().toISOString();
        const connectorsSucceeded = agentResult.status === 'succeeded' ? 1 : 0;
        const connectorsFailed = agentResult.status === 'failed' ? 1 : 0;
        const connectorsSkipped = agentResult.status === 'canceled' ? 1 : 0;
        const base = {
          id: runId,
          startedAt,
          completedAt,
          trigger,
          templateSkillId: template?.id ?? configuredTemplateSkillId,
          connectorsChecked: connectorsSucceeded + connectorsFailed + connectorsSkipped,
          connectorsSucceeded,
          connectorsFailed,
          connectorsSkipped,
          agentRunId: agentResult.agentRunId,
          ...(agentResult.artifactId === undefined ? {} : { artifactId: agentResult.artifactId }),
          ...(agentResult.artifactProjectId === undefined ? {} : { artifactProjectId: agentResult.artifactProjectId }),
          results: [{
            connectorId: 'agent-runtime',
            connectorName: 'Orbit Agent',
            status: agentResult.status === 'succeeded' ? 'succeeded' : agentResult.status === 'failed' ? 'failed' : 'skipped',
            summary: agentResult.summary ?? `Agent run ${agentResult.status}.`,
          } satisfies OrbitConnectorRunResult],
        };
        const summary: OrbitActivitySummary = {
          ...base,
          markdown: renderMarkdown(base),
        };
        await writeLastSummary(this.dataDir, summary);
        return summary;
      } finally {
        this.inflight = null;
        this.inflightProjectId = null;
        this.inflightAgentRunId = null;
        this.reschedule();
      }
    })();
    this.inflight.catch((error) => {
      console.warn('[orbit] Run failed:', error);
    });

    return { projectId: handlerStart.projectId, agentRunId: handlerStart.agentRunId };
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.nextRunAtValue = null;
  }

  private reschedule(): void {
    this.stop();
    if (!this.config.enabled) return;
    const next = nextDailyRunAt(this.config.time);
    this.nextRunAtValue = next;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.nextRunAtValue = null;
      void this.start('scheduled').catch((error) => {
        console.warn('[orbit] Scheduled run failed:', error);
        if (!this.inflight) this.reschedule();
      });
    }, Math.max(0, next.getTime() - Date.now()));
    this.timer.unref();
  }
}
