import type {
  ConnectorMemoryExtractionResult,
  MemorySuggestion,
  MemoryEntrySummary,
} from '@open-design/contracts';

import type { BoundedJsonObject, BoundedJsonValue } from './live-artifacts/schema.js';
import { extractWithLLM, suggestWithLLM } from './memory-llm.js';
import { type ConnectorDetail, type ConnectorToolDetail } from './connectors/catalog.js';
import {
  ConnectorServiceError,
  connectorService,
  type ConnectorExecuteResponse,
  type ConnectorService,
} from './connectors/service.js';
import { listConnectorTools } from './tools/connectors.js';
import type { ToolTokenGrant } from './tool-tokens.js';

const DEFAULT_CONNECTOR_MEMORY_QUERY =
  '设计思路 设计偏好 UI UX 视觉风格 品牌 logo 设计系统 OpenDesign';
const CONNECTOR_MEMORY_QUERY_VARIANTS = [
  '设计思路',
  '设计偏好',
  'UI UX',
  '视觉风格',
  '品牌 logo',
  '黑色 logo 深色主题',
  '设计系统',
  '组件 布局 交互',
  '用户路径 工作流',
  '产品设计',
  'design preferences',
  'UI preferences',
  'visual references',
  'brand guidelines',
  'design system',
  'components',
  'layout',
  'interaction',
  'product design',
  'OpenDesign',
];
const CONNECTOR_MEMORY_PROJECT_ID = 'memory-connectors';
const MAX_CONNECTORS_PER_RUN = 5;
const MAX_READ_ATTEMPTS_PER_CONNECTOR = 14;
const MAX_READ_ATTEMPTS_PER_TOOL = 4;
const MAX_OUTPUT_CHARS_PER_SOURCE = 6000;
const MAX_TOTAL_CONTEXT_CHARS = 24_000;
const MAX_NOTION_PAGE_BODY_READS = 3;
const DIGEST_MAX_ITEMS = 12;
const DIGEST_MAX_LABELS = 4;
const DIGEST_MAX_SNIPPETS = 2;

const NOTION_PAGE_BODY_TOOL_NAMES = [
  'notion.notion_get_page_markdown',
  'notion.notion_fetch_all_block_contents',
  'notion.notion_fetch_block_contents',
  'notion.notion_get_page',
];

const CONNECTOR_MEMORY_SYSTEM_PROMPT = `You are a design-memory extractor for OpenDesign connected-app context.

You will receive compacted read-only data from apps such as Notion, Figma, Linear, Google Drive, GitHub, and Slack. Propose only durable memories that would improve future OpenDesign design work.

A fact is worth remembering when ALL of these are true:
- It is about design: visual taste, UI/UX preferences, brand/design-system context, reusable assets or references, product/design decisions, target audience, interface flows, components, layout, typography, color, accessibility, or recurring design workflow.
- It will plausibly remain useful for at least a week.
- It would change how OpenDesign creates, critiques, edits, or explains future design artifacts.

Do NOT save:
- Generic connector/read summaries, source counts, notifications, repo issue lists, PR/task status, raw search results, raw messages, raw document dumps, or short-lived todo churn.
- Meta language about extraction or saving, including phrases like "OpenDesign read X", "Found N readable items", "Summary from X", "context summary", or "Save this if it should be reused".
- Non-design facts that might be useful to a generic assistant but would not affect design output.
- Secrets, access tokens, private credentials, or sensitive personal content.
- Anything already captured in existing memory.

Output STRICT JSON in this exact shape — nothing else, no prose, no markdown fences:
{
  "entries": [
    { "type": "user|feedback|project|reference", "name": "short title (≤ 60 chars)", "description": "one-line summary (≤ 140 chars)", "body": "the actual remembered fact, 1-3 sentences" }
  ]
}

Return {"entries": []} when the content is not clearly design-relevant. Never
invent a memory just because a connector returned readable data. The body must
be the remembered fact itself, not an explanation of how it was found.

Type rules:
- user: who they are, role, expertise, long-term goals
- feedback: preferences about how OpenDesign should work or answer
- project: ongoing initiatives, decisions, constraints, or priorities
- reference: stable pointers to external apps, repos, docs, channels, boards, dashboards`;

const CONNECTOR_MEMORY_META_PATTERNS = [
  /\bsave this\b/i,
  /\bshould be reused as context\b/i,
  /\bopendesign read\b/i,
  /\bfound \d+ readable items?\b/i,
  /\bfound readable content\b/i,
  /\bsummary from\b/i,
  /\bcontext summary\b/i,
  /\bconnector findings?\b/i,
  /\bconnected-?app content\b/i,
  /\breview before saving\b/i,
  /\bvia list notifications\b/i,
];

const CONNECTOR_DESIGN_MEMORY_PATTERNS = [
  /\bopen[- ]?design\b/i,
  /\bdesign(?:er|ing)?\b/i,
  /\bui\b/i,
  /\bux\b/i,
  /\bvisual\b/i,
  /\bbrand\b/i,
  /\btypography\b/i,
  /\bfont\b/i,
  /\bcolor\b/i,
  /\bpalette\b/i,
  /\blayout\b/i,
  /\bcomponent\b/i,
  /\binteraction\b/i,
  /\bprototype\b/i,
  /\bfigma\b/i,
  /\bwireframe\b/i,
  /\bmockup\b/i,
  /\bcanvas\b/i,
  /\basset\b/i,
  /\bicon\b/i,
  /\blogo\b/i,
  /\btheme\b/i,
  /\bdark mode\b/i,
  /\bdensity\b/i,
  /\baccessibility\b/i,
  /\bhandoff\b/i,
  /\bdesign system\b/i,
  /设计/,
  /界面/,
  /视觉/,
  /品牌/,
  /字体/,
  /颜色/,
  /配色/,
  /布局/,
  /组件/,
  /交互/,
  /原型/,
  /画布/,
  /素材/,
  /图标/,
  /页面/,
  /网站/,
  /信息密度/,
  /深色/,
  /主题/,
  /用户路径/,
  /工作流/,
  /风格/,
  /参考/,
  /设计系统/,
];

export interface ExtractMemoryFromConnectorsOptions {
  projectsRoot: string;
  projectRoot?: string;
  projectId?: string | null;
  connectorIds?: string[];
  query?: string;
  chatAgentId?: string | null;
  chatModel?: string | null;
  service?: ConnectorService;
  signal?: AbortSignal;
  localCliRunner?: (input: {
    agentId: string;
    model: string;
    system: string;
    user: string;
    projectRoot: string | null;
    dataDir: string | null;
  }) => Promise<string>;
}

export interface ExtractMemoryFromConnectorsResult {
  changed: MemoryEntrySummary[];
  attemptedLLM: boolean;
  connectors: ConnectorMemoryExtractionResult[];
  contextBytes: number;
}

export interface SuggestMemoryFromConnectorsResult {
  suggestions: MemorySuggestion[];
  attemptedLLM: boolean;
  connectors: ConnectorMemoryExtractionResult[];
  contextBytes: number;
}

interface CandidateConnector {
  connector: ConnectorDetail;
  tools: ConnectorToolDetail[];
  allTools: ConnectorToolDetail[];
}

interface ConnectorMemoryContext {
  connectors: ConnectorMemoryExtractionResult[];
  connectorContext: string;
  contextBytes: number;
}

interface OutputDigest {
  itemCount: number;
  labels: string[];
  snippets: string[];
}

interface ConnectorReadSuccess {
  connector: ConnectorDetail;
  tool: ConnectorToolDetail;
  response: ConnectorExecuteResponse;
}

interface NotionPageCandidate {
  pageId?: string;
  pageUrl?: string;
  title?: string;
  score: number;
}

function createGrant(projectId: string): ToolTokenGrant {
  const issuedAt = new Date();
  return {
    token: 'memory-connectors',
    runId: `memory-connectors-${issuedAt.getTime()}`,
    projectId,
    allowedEndpoints: [],
    allowedOperations: [],
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + 5 * 60_000).toISOString(),
  };
}

function normalizeConnectorIds(ids: string[] | undefined): Set<string> | null {
  if (!Array.isArray(ids)) return null;
  const normalized = ids
    .filter((id) => typeof id === 'string')
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 12);
  return normalized.length > 0 ? new Set(normalized) : null;
}

function isSchemaObject(value: BoundedJsonValue | undefined): value is BoundedJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function schemaProperties(schema: BoundedJsonObject | undefined): Record<string, BoundedJsonObject> {
  if (!schema || !isSchemaObject(schema.properties)) return {};
  const props: Record<string, BoundedJsonObject> = {};
  for (const [key, value] of Object.entries(schema.properties)) {
    if (isSchemaObject(value)) props[key] = value;
  }
  return props;
}

function schemaRequired(schema: BoundedJsonObject | undefined): string[] {
  if (!schema || !Array.isArray(schema.required)) return [];
  return schema.required.filter((name): name is string => typeof name === 'string');
}

function propertyType(schema: BoundedJsonObject | undefined): string {
  const raw = schema?.type;
  return typeof raw === 'string' ? raw : '';
}

function fieldLooksLikeId(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith('_id')
    || lower.endsWith('id')
    || lower.includes('database')
    || lower.includes('channel')
    || lower.includes('file')
    || lower === 'repo'
    || lower === 'owner'
    || lower.includes('issue_number')
  );
}

function dateString(daysAgo: number, withTime: boolean): string {
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return withTime ? date.toISOString() : date.toISOString().slice(0, 10);
}

function guessFieldValue(
  name: string,
  schema: BoundedJsonObject | undefined,
  query: string,
): BoundedJsonValue | undefined {
  const lower = name.toLowerCase();
  const type = propertyType(schema);
  if (type === 'string' || type === '') {
    if (
      lower === 'query'
      || lower === 'q'
      || lower.includes('search')
      || lower.includes('keyword')
      || lower.includes('term')
      || lower.includes('text')
    ) {
      return query;
    }
    if (lower === 'direction') return 'descending';
    if (lower === 'timestamp') return 'last_edited_time';
    if (lower === 'filter_value') return 'page';
    if (lower === 'filter_property') return 'object';
    if (
      lower.includes('start')
      || lower.includes('since')
      || lower.includes('after')
      || lower.includes('from')
      || lower === 'timemin'
    ) {
      return dateString(30, true);
    }
    if (
      lower.includes('end')
      || lower.includes('until')
      || lower.includes('before')
      || lower === 'timemax'
    ) {
      return new Date().toISOString();
    }
    if (lower === 'date' || lower.includes('day')) return dateString(0, false);
    if (fieldLooksLikeId(name)) return undefined;
  }
  if (type === 'number' || type === 'integer') {
    if (lower.includes('page_size')) return 25;
    if (
      lower.includes('limit')
      || lower.includes('count')
      || lower.includes('size')
      || lower.includes('page')
      || lower.includes('per_page')
      || lower === 'first'
      || lower === 'top'
    ) {
      return 5;
    }
    if (lower.includes('issue_number')) return undefined;
  }
  if (type === 'boolean') {
    if (lower.includes('include') || lower.includes('archived')) return false;
    return false;
  }
  return undefined;
}

function buildToolInput(
  tool: ConnectorToolDetail,
  query: string,
): BoundedJsonObject | null {
  const schema = tool.inputSchemaJson;
  const props = schemaProperties(schema);
  const required = schemaRequired(schema);
  const input: BoundedJsonObject = {};

  for (const field of required) {
    const value = guessFieldValue(field, props[field], query);
    if (value === undefined) return null;
    input[field] = value;
  }

  for (const field of Object.keys(props)) {
    if (Object.prototype.hasOwnProperty.call(input, field)) continue;
    const lower = field.toLowerCase();
    const value = guessFieldValue(field, props[field], query);
    if (value === undefined) continue;
    if (
      lower.includes('query')
      || lower === 'q'
      || lower.includes('search')
      || lower.includes('limit')
      || lower.includes('count')
      || lower.includes('page_size')
      || lower.includes('per_page')
      || lower.includes('since')
      || lower.includes('after')
      || lower.includes('start')
      || lower.includes('until')
      || lower.includes('before')
      || lower.includes('end')
      || lower === 'direction'
      || lower === 'timestamp'
      || lower === 'filter_value'
      || lower === 'filter_property'
    ) {
      input[field] = value;
    }
  }

  return input;
}

function buildQueryVariants(query: string): string[] {
  const variants = [
    query,
    ...CONNECTOR_MEMORY_QUERY_VARIANTS,
  ]
    .map((value) => value.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  return variants.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toolSupportsEmptyQueryFallback(tool: ConnectorToolDetail): boolean {
  const props = schemaProperties(tool.inputSchemaJson);
  const querySchema = props.query;
  if (querySchema && querySchema.default === '') return true;
  const haystack = [
    tool.name,
    tool.title,
    tool.description ?? '',
    querySchema?.description,
  ].filter((value): value is string => typeof value === 'string').join('\n');
  return /\bempty query\b/i.test(haystack)
    || /\blist all accessible\b/i.test(haystack)
    || /空查询/.test(haystack);
}

function buildToolInputs(
  tool: ConnectorToolDetail,
  query: string,
): BoundedJsonObject[] {
  const inputs: BoundedJsonObject[] = [];
  const seen = new Set<string>();
  const variants = buildQueryVariants(query);
  if (toolSupportsEmptyQueryFallback(tool) && !variants.includes('')) {
    variants.splice(Math.min(3, variants.length), 0, '');
  }
  for (const variant of variants) {
    const input = buildToolInput(tool, variant);
    if (!input) continue;
    const key = JSON.stringify(input);
    if (seen.has(key)) continue;
    seen.add(key);
    inputs.push(input);
  }
  return inputs;
}

function shouldTryNextConnectorTool(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\btool\b.+\bnot found\b/i.test(message)
    || /\bconnector tool\b.+\bnot found\b/i.test(message);
}

function errorDetailMessage(value: BoundedJsonValue | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, 180) : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = errorDetailMessage(item);
      if (message) return message;
    }
    return null;
  }
  for (const key of ['message', 'error', 'detail', 'description', 'reason']) {
    const message = errorDetailMessage(value[key]);
    if (message) return message;
  }
  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 0 ? serialized.slice(0, 180) : null;
  } catch {
    return null;
  }
}

function connectorErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (!(err instanceof ConnectorServiceError)) return message;
  const detailMessage = errorDetailMessage(err.details?.error);
  if (!detailMessage || message.includes(detailMessage)) return message;
  return `${message}: ${detailMessage}`;
}

function looksLikeToolSlug(value: string): boolean {
  const trimmed = value.trim();
  return /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/i.test(trimmed)
    || /^[A-Z][A-Z0-9_]*(?:\.[A-Z0-9_]+)*$/.test(trimmed);
}

function outputSummaryLooksLowInfo(
  summary: string,
  response: Pick<ConnectorExecuteResponse, 'toolName'>,
): boolean {
  const trimmed = summary.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  if (lower === response.toolName.toLowerCase()) return true;
  if (looksLikeToolSlug(trimmed)) return true;
  if (/^(ok|success|done|completed|read completed)\.?$/i.test(trimmed)) return true;
  return false;
}

function hasReadableValue(value: BoundedJsonValue | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.some(hasReadableValue);
  return Object.values(value).some(hasReadableValue);
}

function responseHasReadableContent(response: ConnectorExecuteResponse): boolean {
  if (hasReadableValue(response.output)) return true;
  const summary = response.outputSummary?.trim().toLowerCase() ?? '';
  if (!summary) return false;
  if (outputSummaryLooksLowInfo(summary, response)) return false;
  if (/^(no results?|none|empty|not found|0 results?)/i.test(summary)) return false;
  return true;
}

function responseLooksDesignRelevant(
  connector: ConnectorDetail,
  tool: ConnectorToolDetail,
  response: ConnectorExecuteResponse,
): boolean {
  const text = [
    connector.name,
    tool.title,
    tool.description ?? '',
    response.outputSummary ?? '',
    compactOutput(response.output, 4000),
  ].join('\n');
  return CONNECTOR_DESIGN_MEMORY_PATTERNS.some((pattern) => pattern.test(text));
}

function toolScore(tool: ConnectorToolDetail): number {
  const haystack = `${tool.name} ${tool.title} ${tool.description ?? ''}`.toLowerCase();
  let score = 0;
  if (tool.curation?.useCases?.includes('personal_daily_digest')) score += 50;
  if (/\b(search|recent|list|query|find)\b/.test(haystack)) score += 20;
  if (/\b(notification|event|issue|task|message|document|file|comment|pull|repo)\b/.test(haystack)) score += 12;
  if (/\b(get|fetch)\b/.test(haystack)) score += 4;
  if (schemaRequired(tool.inputSchemaJson).some(fieldLooksLikeId)) score -= 25;
  return score;
}

function uniqueByToolName(tools: ConnectorToolDetail[]): ConnectorToolDetail[] {
  const seen = new Set<string>();
  const unique: ConnectorToolDetail[] = [];
  for (const tool of tools) {
    if (seen.has(tool.name)) continue;
    seen.add(tool.name);
    unique.push(tool);
  }
  return unique;
}

function mergeConnectorLists(
  curated: ConnectorDetail[],
  fallback: ConnectorDetail[],
): CandidateConnector[] {
  const byId = new Map<string, CandidateConnector>();
  for (const connector of fallback) {
    byId.set(connector.id, { connector, tools: [...connector.tools], allTools: [...connector.tools] });
  }
  for (const connector of curated) {
    const existing = byId.get(connector.id);
    const tools = uniqueByToolName([...connector.tools, ...(existing?.allTools ?? [])]);
    byId.set(connector.id, {
      connector: existing?.connector ?? connector,
      tools,
      allTools: tools,
    });
  }
  return [...byId.values()].map((entry) => ({
    connector: entry.connector,
    allTools: uniqueByToolName(entry.allTools),
    tools: uniqueByToolName(entry.tools)
      .filter((tool) => buildToolInput(tool, DEFAULT_CONNECTOR_MEMORY_QUERY))
      .sort((left, right) => toolScore(right) - toolScore(left)),
  })).filter((entry) => entry.tools.length > 0);
}

function compactOutput(value: BoundedJsonValue, cap = MAX_OUTPUT_CHARS_PER_SOURCE): string {
  const raw = (() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  })();
  if (raw.length <= cap) return raw;
  return `${raw.slice(0, cap - 80)}\n... [truncated ${raw.length - cap + 80} chars]`;
}

function cleanedDigestText(value: string): string | null {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  if (looksLikeToolSlug(cleaned)) return null;
  if (/^https?:\/\//i.test(cleaned)) return null;
  if (cleaned.length < 3) return null;
  return cleaned.length <= 120 ? cleaned : `${cleaned.slice(0, 117).trim()}...`;
}

function addUniqueDigestText(values: string[], value: string, limit: number): void {
  if (values.length >= limit) return;
  const cleaned = cleanedDigestText(value);
  if (!cleaned) return;
  const key = cleaned.toLowerCase();
  if (values.some((existing) => existing.toLowerCase() === key)) return;
  values.push(cleaned);
}

function isLabelKey(key: string): boolean {
  return /^(title|name|subject|heading|label|display_name)$/i.test(key);
}

function isSnippetKey(key: string): boolean {
  return /^(summary|description|text|plain_text|content|body|message|markdown|data)$/i.test(key);
}

function collectOutputDigest(
  value: BoundedJsonValue | undefined,
  digest: OutputDigest,
  depth = 0,
): void {
  if (value === null || value === undefined || depth > 5) return;
  if (typeof value === 'string') {
    addUniqueDigestText(digest.snippets, value, DIGEST_MAX_SNIPPETS);
    return;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return;
  if (Array.isArray(value)) {
    const readableItems = value.filter(hasReadableValue);
    digest.itemCount = Math.max(digest.itemCount, readableItems.length);
    for (const item of readableItems.slice(0, DIGEST_MAX_ITEMS)) {
      collectOutputDigest(item, digest, depth + 1);
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string') {
      if (isLabelKey(key)) {
        addUniqueDigestText(digest.labels, child, DIGEST_MAX_LABELS);
      } else if (isSnippetKey(key)) {
        addUniqueDigestText(digest.snippets, child, DIGEST_MAX_SNIPPETS);
      }
    }
  }
  for (const child of Object.values(value)) {
    if (typeof child === 'object' && child !== null) {
      collectOutputDigest(child, digest, depth + 1);
    }
  }
}

function digestConnectorOutput(response: ConnectorExecuteResponse): OutputDigest {
  const digest: OutputDigest = { itemCount: 0, labels: [], snippets: [] };
  collectOutputDigest(response.output, digest);
  return digest;
}

function derivedOutputSummary(
  connector: ConnectorDetail,
  tool: ConnectorToolDetail,
  response: ConnectorExecuteResponse,
): string {
  const digest = digestConnectorOutput(response);
  const countPrefix = digest.itemCount > 0
    ? `Found ${digest.itemCount} readable item${digest.itemCount === 1 ? '' : 's'}`
    : 'Found readable content';
  const sourceLabel = connector.name || 'connected app';
  const examples = digest.labels.length > 0
    ? `: ${digest.labels.slice(0, 3).join(', ')}`
    : digest.snippets.length > 0
      ? `: ${digest.snippets[0]}`
      : '';
  const summary = `${countPrefix} from ${sourceLabel}${examples}.`;
  if (summary.length <= 240) return summary;
  const fallback = `${countPrefix} from ${sourceLabel} via ${tool.title}.`;
  return fallback.slice(0, 240);
}

function resultSummary(
  connector: ConnectorDetail,
  tool: ConnectorToolDetail,
  response: ConnectorExecuteResponse,
): string {
  if (
    typeof response.outputSummary === 'string'
    && response.outputSummary.trim()
    && !outputSummaryLooksLowInfo(response.outputSummary, response)
  ) {
    return response.outputSummary.trim().slice(0, 240);
  }
  return derivedOutputSummary(connector, tool, response);
}

function trimmedString(value: BoundedJsonValue | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const NOTION_UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32}/i;

function notionIdFromString(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.match(NOTION_UUID_PATTERN)?.[0];
}

function compactDigestSource(value: BoundedJsonValue): string {
  return compactOutput(value, 1200);
}

function addLikelyTitleText(values: string[], value: string | undefined): void {
  if (values.length >= 6 || value === undefined) return;
  const cleaned = cleanedDigestText(value);
  if (!cleaned) return;
  const key = cleaned.toLowerCase();
  if (values.some((existing) => existing.toLowerCase() === key)) return;
  values.push(cleaned);
}

function collectLikelyTitleTexts(
  value: BoundedJsonValue | undefined,
  values: string[],
  parentKey = '',
  depth = 0,
): void {
  if (value === null || value === undefined || values.length >= 6 || depth > 6) return;
  if (typeof value === 'string') {
    if (
      isLabelKey(parentKey)
      || parentKey === 'plain_text'
      || parentKey === 'text'
      || parentKey === 'content'
    ) {
      addLikelyTitleText(values, value);
    }
    return;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 16)) {
      collectLikelyTitleTexts(item, values, parentKey, depth + 1);
      if (values.length >= 6) return;
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string') {
      if (
        isLabelKey(key)
        || key === 'plain_text'
        || (parentKey === 'title' && (key === 'content' || key === 'text'))
      ) {
        addLikelyTitleText(values, child);
      }
    } else {
      collectLikelyTitleTexts(child, values, key.toLowerCase(), depth + 1);
    }
    if (values.length >= 6) return;
  }
}

function titleFromNotionObject(value: BoundedJsonObject): string | undefined {
  const properties = isSchemaObject(value.properties) ? value.properties : undefined;
  if (properties) {
    for (const property of Object.values(properties)) {
      if (!isSchemaObject(property)) continue;
      const propertyTypeValue = trimmedString(property.type)?.toLowerCase();
      if (propertyTypeValue !== 'title') continue;
      const titleValues: string[] = [];
      collectLikelyTitleTexts(property.title, titleValues, 'title');
      if (titleValues[0]) return titleValues[0];
    }
    for (const [key, property] of Object.entries(properties)) {
      if (!/^(title|name|名称|名字|标题)$/i.test(key) || !isSchemaObject(property)) continue;
      const titleValues: string[] = [];
      collectLikelyTitleTexts(property, titleValues, 'title');
      if (titleValues[0]) return titleValues[0];
    }
  }
  const directTitle = trimmedString(value.title)
    ?? trimmedString(value.name)
    ?? trimmedString(value.display_name)
    ?? trimmedString(value.label);
  if (directTitle) return directTitle;
  if (properties) {
    const propertyValues: string[] = [];
    collectLikelyTitleTexts(properties, propertyValues);
    if (propertyValues[0]) return propertyValues[0];
  }
  const values: string[] = [];
  collectLikelyTitleTexts(value, values);
  return values[0];
}

function stringFieldFromObject(value: BoundedJsonObject, fieldNames: readonly string[]): string | undefined {
  for (const fieldName of fieldNames) {
    const direct = trimmedString(value[fieldName]);
    if (direct) return direct;
  }
  return undefined;
}

function notionPageUrlFromObject(value: BoundedJsonObject): string | undefined {
  const direct = stringFieldFromObject(value, ['url', 'public_url', 'publicUrl', 'page_url', 'pageUrl']);
  if (direct && /notion\.(?:so|site)\//i.test(direct)) return direct;
  return undefined;
}

function notionPageIdFromObject(value: BoundedJsonObject): string | undefined {
  const direct = stringFieldFromObject(value, ['page_id', 'pageId', 'id', 'block_id', 'blockId']);
  const directId = notionIdFromString(direct);
  if (directId) return directId;
  return notionIdFromString(notionPageUrlFromObject(value));
}

function looksLikeNotionPageObject(value: BoundedJsonObject): boolean {
  const objectType = trimmedString(value.object)?.toLowerCase();
  if (objectType === 'database') return false;
  if (objectType === 'page') return true;
  if (notionPageUrlFromObject(value)) return true;
  return notionPageIdFromObject(value) !== undefined && (
    isSchemaObject(value.properties)
    || isSchemaObject(value.parent)
    || trimmedString(value.created_time) !== null
    || trimmedString(value.last_edited_time) !== null
  );
}

function scoreNotionPageCandidate(candidate: Omit<NotionPageCandidate, 'score'>, source: BoundedJsonObject, query: string): number {
  const haystack = [
    candidate.title ?? '',
    candidate.pageUrl ?? '',
    compactDigestSource(source),
  ].join('\n');
  let score = 0;
  if (candidate.title) score += 12;
  if (candidate.pageId) score += 4;
  if (candidate.pageUrl) score += 2;
  if (/设计思路/.test(haystack)) score += 45;
  if (CONNECTOR_DESIGN_MEMORY_PATTERNS.some((pattern) => pattern.test(haystack))) score += 28;
  for (const token of query.split(/\s+/).map((part) => part.trim()).filter((part) => part.length >= 2)) {
    if (haystack.toLowerCase().includes(token.toLowerCase())) score += 6;
  }
  return score;
}

function collectNotionPageCandidates(
  value: BoundedJsonValue | undefined,
  query: string,
  candidates: NotionPageCandidate[],
  depth = 0,
): void {
  if (value === null || value === undefined || depth > 7) return;
  if (Array.isArray(value)) {
    for (const item of value) collectNotionPageCandidates(item, query, candidates, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  if (looksLikeNotionPageObject(value)) {
    const pageId = notionPageIdFromObject(value);
    const pageUrl = notionPageUrlFromObject(value);
    const title = titleFromNotionObject(value);
    const candidate: Omit<NotionPageCandidate, 'score'> = {
      ...(pageId === undefined ? {} : { pageId }),
      ...(pageUrl === undefined ? {} : { pageUrl }),
      ...(title === undefined ? {} : { title }),
    };
    if (candidate.pageId || candidate.pageUrl) {
      candidates.push({
        ...candidate,
        score: scoreNotionPageCandidate(candidate, value, query),
      });
    }
  }
  for (const child of Object.values(value)) {
    if (typeof child === 'object' && child !== null) {
      collectNotionPageCandidates(child, query, candidates, depth + 1);
    }
  }
}

function extractNotionPageCandidates(value: BoundedJsonValue, query: string): NotionPageCandidate[] {
  const candidates: NotionPageCandidate[] = [];
  collectNotionPageCandidates(value, query, candidates);
  const byKey = new Map<string, NotionPageCandidate>();
  for (const candidate of candidates) {
    const key = candidate.pageId ?? candidate.pageUrl;
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing || candidate.score > existing.score) byKey.set(key, candidate);
  }
  return [...byKey.values()]
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_NOTION_PAGE_BODY_READS);
}

function isNotionSearchTool(tool: ConnectorToolDetail): boolean {
  const haystack = `${tool.name} ${tool.title}`.toLowerCase();
  return haystack.includes('notion') && haystack.includes('search');
}

function buildNotionPageReadInput(
  tool: ConnectorToolDetail,
  candidate: NotionPageCandidate,
): BoundedJsonObject | null {
  const props = schemaProperties(tool.inputSchemaJson);
  const required = schemaRequired(tool.inputSchemaJson);
  const input: BoundedJsonObject = {};

  const valueForField = (field: string): BoundedJsonValue | undefined => {
    const lower = field.toLowerCase();
    if (lower === 'page_id' || lower === 'pageid' || lower === 'block_id' || lower === 'blockid') {
      return candidate.pageId ?? notionIdFromString(candidate.pageUrl);
    }
    if (lower === 'page_url' || lower === 'pageurl' || lower === 'url') {
      return candidate.pageUrl;
    }
    return undefined;
  };

  for (const field of required) {
    const value = valueForField(field);
    if (value === undefined) return null;
    input[field] = value;
  }

  for (const field of Object.keys(props)) {
    if (Object.prototype.hasOwnProperty.call(input, field)) continue;
    const lower = field.toLowerCase();
    const value = valueForField(field);
    if (value !== undefined) {
      input[field] = value;
      continue;
    }
    if (lower === 'include_transcript') input[field] = false;
    if (lower === 'recursive') input[field] = true;
    if (lower === 'page_size') input[field] = 100;
    if (lower === 'max_depth') input[field] = 6;
    if (lower === 'max_blocks') input[field] = 500;
  }

  return Object.keys(input).length > 0 ? input : null;
}

async function maybeEnrichNotionSearchResponse(input: {
  service: ConnectorService;
  projectsRoot: string;
  projectId: string;
  signal?: AbortSignal;
  connector: ConnectorDetail;
  allTools: ConnectorToolDetail[];
  searchTool: ConnectorToolDetail;
  query: string;
  response: ConnectorExecuteResponse;
}): Promise<ConnectorExecuteResponse> {
  if (input.connector.id !== 'notion' || !isNotionSearchTool(input.searchTool)) return input.response;

  const candidates = extractNotionPageCandidates(input.response.output, input.query);
  if (candidates.length === 0) return input.response;

  const bodyTools = NOTION_PAGE_BODY_TOOL_NAMES
    .map((toolName) => input.allTools.find((tool) => tool.name === toolName))
    .filter((tool): tool is ConnectorToolDetail => tool !== undefined);
  if (bodyTools.length === 0) return input.response;

  const openedPages: Array<{
    title?: string;
    pageId?: string;
    pageUrl?: string;
    toolName: string;
    toolTitle: string;
    summary: string;
    content: BoundedJsonValue;
  }> = [];
  let attempts = 0;

  for (const candidate of candidates) {
    for (const bodyTool of bodyTools) {
      if (attempts >= MAX_READ_ATTEMPTS_PER_CONNECTOR) break;
      const pageInput = buildNotionPageReadInput(bodyTool, candidate);
      if (!pageInput) continue;
      attempts += 1;
      try {
        const pageResponse = await input.service.execute(
          {
            connectorId: input.connector.id,
            toolName: bodyTool.name,
            input: pageInput,
            ...(input.connector.accountLabel === undefined
              ? {}
              : { expectedAccountLabel: input.connector.accountLabel }),
          },
          {
            projectsRoot: input.projectsRoot,
            projectId: input.projectId,
            purpose: 'agent_preview',
            ...(input.signal === undefined ? {} : { signal: input.signal }),
          },
        );
        if (!responseHasReadableContent(pageResponse)) continue;
        openedPages.push({
          ...(candidate.title === undefined ? {} : { title: candidate.title }),
          ...(candidate.pageId === undefined ? {} : { pageId: candidate.pageId }),
          ...(candidate.pageUrl === undefined ? {} : { pageUrl: candidate.pageUrl }),
          toolName: bodyTool.name,
          toolTitle: bodyTool.title,
          summary: resultSummary(input.connector, bodyTool, pageResponse),
          content: pageResponse.output,
        });
        break;
      } catch {
        continue;
      }
    }
    if (attempts >= MAX_READ_ATTEMPTS_PER_CONNECTOR) break;
  }

  if (openedPages.length === 0) return input.response;

  const openedLabels = openedPages
    .map((page) => page.title ?? page.pageUrl ?? page.pageId)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .slice(0, 3);
  const baseSummary = resultSummary(input.connector, input.searchTool, input.response).replace(/\.$/, '');
  const outputSummary = `${baseSummary}. Read page content: ${openedLabels.join(', ')}.`;

  return {
    ...input.response,
    outputSummary,
    output: {
      openedPages,
      searchResults: input.response.output,
    },
    metadata: {
      ...(input.response.metadata ?? {}),
      notionOpenedPageCount: openedPages.length,
      notionPageReadToolNames: [...new Set(openedPages.map((page) => page.toolName))],
    },
  };
}

function appendContextBlock(
  blocks: string[],
  connector: ConnectorDetail,
  tool: ConnectorToolDetail,
  response: ConnectorExecuteResponse,
): boolean {
  const summary = resultSummary(connector, tool, response);
  const block = [
    `### ${connector.name}`,
    connector.accountLabel ? `Account: ${connector.accountLabel}` : '',
    `Tool: ${tool.title} (${tool.name})`,
    `Summary: ${summary}`,
    '',
    compactOutput(response.output),
  ].filter(Boolean).join('\n');
  const nextLength = blocks.join('\n\n').length + block.length;
  if (nextLength > MAX_TOTAL_CONTEXT_CHARS) return false;
  blocks.push(block);
  return true;
}

function appendConnectorReadSuccess(
  blocks: string[],
  connectors: ConnectorMemoryExtractionResult[],
  success: ConnectorReadSuccess,
): boolean {
  if (!appendContextBlock(blocks, success.connector, success.tool, success.response)) {
    return false;
  }
  connectors.push({
    connectorId: success.connector.id,
    connectorName: success.connector.name,
    ...(success.connector.accountLabel === undefined ? {} : { accountLabel: success.connector.accountLabel }),
    status: 'succeeded',
    toolName: success.tool.name,
    toolTitle: success.tool.title,
    summary: resultSummary(success.connector, success.tool, success.response),
  });
  return true;
}

async function readConnectorMemoryContext(
  options: ExtractMemoryFromConnectorsOptions,
): Promise<ConnectorMemoryContext> {
  const service = options.service ?? connectorService;
  const projectId = options.projectId?.trim() || CONNECTOR_MEMORY_PROJECT_ID;
  const grant = createGrant(projectId);
  const query = options.query?.trim().slice(0, 240) || DEFAULT_CONNECTOR_MEMORY_QUERY;
  const selectedIds = normalizeConnectorIds(options.connectorIds);

  const [curated, fallback] = await Promise.all([
    listConnectorTools({
      grant,
      projectsRoot: options.projectsRoot,
      service,
      useCase: 'personal_daily_digest',
    }),
    listConnectorTools({
      grant,
      projectsRoot: options.projectsRoot,
      service,
    }),
  ]);

  const candidates = mergeConnectorLists(curated, fallback)
    .filter((entry) => selectedIds === null || selectedIds.has(entry.connector.id))
    .slice(0, MAX_CONNECTORS_PER_RUN);
  const connectors: ConnectorMemoryExtractionResult[] = [];
  const contextBlocks: string[] = [];

  for (const { connector, tools, allTools } of candidates) {
    let completed = false;
    let lastError = '';
    let attempts = 0;
    let fallbackSuccess: ConnectorReadSuccess | null = null;
    for (const tool of tools) {
      if (attempts >= MAX_READ_ATTEMPTS_PER_CONNECTOR) break;
      let toolAttempts = 0;
      const inputs = buildToolInputs(tool, query);
      if (inputs.length === 0) continue;
      for (const input of inputs) {
        if (attempts >= MAX_READ_ATTEMPTS_PER_CONNECTOR) break;
        if (toolAttempts >= MAX_READ_ATTEMPTS_PER_TOOL) break;
        attempts += 1;
        toolAttempts += 1;
        try {
          const response = await service.execute(
            {
              connectorId: connector.id,
              toolName: tool.name,
              input,
              ...(connector.accountLabel === undefined
                ? {}
                : { expectedAccountLabel: connector.accountLabel }),
            },
            {
              projectsRoot: options.projectsRoot,
              projectId,
              purpose: 'agent_preview',
              ...(options.signal === undefined ? {} : { signal: options.signal }),
            },
          );
          if (!responseHasReadableContent(response)) {
            lastError = 'No readable content found for this query.';
            continue;
          }
          const enrichedResponse = await maybeEnrichNotionSearchResponse({
            service,
            projectsRoot: options.projectsRoot,
            projectId,
            ...(options.signal === undefined ? {} : { signal: options.signal }),
            connector,
            allTools,
            searchTool: tool,
            query,
            response,
          });
          const success = { connector, tool, response: enrichedResponse };
          if (!responseLooksDesignRelevant(connector, tool, enrichedResponse)) {
            fallbackSuccess ??= success;
            lastError = 'Readable content found, but it did not look design-related.';
            continue;
          }
          if (!appendConnectorReadSuccess(contextBlocks, connectors, success)) {
            lastError = 'Readable content exceeded the connector memory context limit.';
            break;
          }
          completed = true;
          break;
        } catch (err) {
          lastError = connectorErrorMessage(err);
          if (shouldTryNextConnectorTool(err)) break;
        }
      }
      if (completed) break;
    }
    if (!completed && fallbackSuccess) {
      if (appendConnectorReadSuccess(contextBlocks, connectors, fallbackSuccess)) {
        completed = true;
      } else {
        lastError = 'Readable content exceeded the connector memory context limit.';
      }
    }
    if (!completed) {
      connectors.push({
        connectorId: connector.id,
        connectorName: connector.name,
        ...(connector.accountLabel === undefined ? {} : { accountLabel: connector.accountLabel }),
        status: 'failed',
        summary: 'No safe connector read completed.',
        ...(lastError ? { error: lastError.slice(0, 240) } : {}),
      });
    }
  }

  if (candidates.length === 0 && selectedIds !== null) {
    for (const connectorId of selectedIds) {
      connectors.push({
        connectorId,
        connectorName: connectorId,
        status: 'skipped',
        summary: 'Connector is not connected or has no approved read tools.',
      });
    }
  }

  const connectorContext = contextBlocks.join('\n\n');
  return {
    connectors,
    connectorContext,
    contextBytes: Buffer.byteLength(connectorContext, 'utf8'),
  };
}

function suggestionIdFor(draft: Omit<MemorySuggestion, 'id' | 'source'>, index: number): string {
  const base = `${draft.type}-${draft.name}-${index + 1}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return base || `connector_suggestion_${index + 1}`;
}

function suggestionSourceFrom(
  connectors: ConnectorMemoryExtractionResult[],
): NonNullable<MemorySuggestion['source']> {
  const succeeded = connectors.filter((connector) => connector.status === 'succeeded');
  if (succeeded.length !== 1) return { kind: 'connector' };
  const connector = succeeded[0];
  if (!connector) return { kind: 'connector' };
  return {
    kind: 'connector',
    connectorId: connector.connectorId,
    connectorName: connector.connectorName,
    ...(connector.accountLabel === undefined ? {} : { accountLabel: connector.accountLabel }),
    ...(connector.toolName === undefined ? {} : { toolName: connector.toolName }),
    ...(connector.toolTitle === undefined ? {} : { toolTitle: connector.toolTitle }),
  };
}

function isDesignMemoryDraft(draft: Omit<MemorySuggestion, 'id' | 'source'>): boolean {
  const text = [
    draft.name,
    draft.description,
    draft.body,
  ].join('\n').trim();
  if (!text) return false;
  if (CONNECTOR_MEMORY_META_PATTERNS.some((pattern) => pattern.test(text))) {
    return false;
  }
  return CONNECTOR_DESIGN_MEMORY_PATTERNS.some((pattern) => pattern.test(text));
}

export async function suggestMemoryFromConnectors(
  dataDir: string,
  options: ExtractMemoryFromConnectorsOptions,
): Promise<SuggestMemoryFromConnectorsResult> {
  const context = await readConnectorMemoryContext(options);
  if (!context.connectorContext.trim()) {
    return {
      suggestions: [],
      attemptedLLM: false,
      connectors: context.connectors,
      contextBytes: 0,
    };
  }

  const drafts = await suggestWithLLM(
    dataDir,
    {
      userMessage: `Suggest durable OpenDesign memories from connected apps. Search hint: ${options.query?.trim().slice(0, 240) || DEFAULT_CONNECTOR_MEMORY_QUERY}`,
      assistantMessage: context.connectorContext,
    },
    {
      projectRoot: options.projectRoot,
      chatAgentId: options.chatAgentId ?? null,
      chatModel: options.chatModel ?? null,
      kind: 'connector',
      source: 'connector',
      systemPrompt: CONNECTOR_MEMORY_SYSTEM_PROMPT,
      candidateFilter: isDesignMemoryDraft,
      localCliRunner: options.localCliRunner,
    },
  ) as Array<Omit<MemorySuggestion, 'id' | 'source'>>;

  const source = suggestionSourceFrom(context.connectors);
  const suggestions = drafts
    .filter(isDesignMemoryDraft)
    .map((draft, index) => ({
      id: suggestionIdFor(draft, index),
      ...draft,
      source,
    }));

  return {
    suggestions,
    attemptedLLM: true,
    connectors: context.connectors,
    contextBytes: context.contextBytes,
  };
}

export async function extractMemoryFromConnectors(
  dataDir: string,
  options: ExtractMemoryFromConnectorsOptions,
): Promise<ExtractMemoryFromConnectorsResult> {
  const context = await readConnectorMemoryContext(options);
  if (!context.connectorContext.trim()) {
    return {
      changed: [],
      attemptedLLM: false,
      connectors: context.connectors,
      contextBytes: 0,
    };
  }

  const changed = await extractWithLLM(
    dataDir,
    {
      userMessage: `Extract durable OpenDesign memory from connected apps. Search hint: ${options.query?.trim().slice(0, 240) || DEFAULT_CONNECTOR_MEMORY_QUERY}`,
      assistantMessage: context.connectorContext,
    },
    {
      projectRoot: options.projectRoot,
      chatAgentId: options.chatAgentId ?? null,
      chatModel: options.chatModel ?? null,
      kind: 'connector',
      source: 'connector',
      systemPrompt: CONNECTOR_MEMORY_SYSTEM_PROMPT,
      candidateFilter: isDesignMemoryDraft,
      localCliRunner: options.localCliRunner,
    },
  ) as MemoryEntrySummary[];

  return {
    changed,
    attemptedLLM: true,
    connectors: context.connectors,
    contextBytes: context.contextBytes,
  };
}
