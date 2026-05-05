// Runtime validation lives in the daemon. These mirror the shared DTOs in
// packages/contracts/src/api/live-artifacts.ts without importing daemon internals
// into contracts or forcing the daemon to compile contract source files.
export type BoundedJsonValue = null | boolean | number | string | BoundedJsonValue[] | { [key: string]: BoundedJsonValue };

export interface BoundedJsonObject {
  [key: string]: BoundedJsonValue;
}

export type LiveArtifactStatus = 'active' | 'archived' | 'error';
export type LiveArtifactRefreshStatus = 'never' | 'idle' | 'running' | 'succeeded' | 'failed';
export type LiveArtifactPreviewType = 'html' | 'jsx' | 'markdown';
export type LiveArtifactSourceType = 'local_file' | 'daemon_tool' | 'connector_tool';
export type LiveArtifactConnectorApprovalPolicy = 'read_only_auto' | 'manual_refresh_granted_for_read_only';
export type LiveArtifactRefreshPermission = 'none' | 'manual_refresh_granted_for_read_only';
export type LiveArtifactOutputTransform = 'identity' | 'compact_table' | 'metric_summary';
export type LiveArtifactProvenanceGenerator = 'agent' | 'refresh_runner';
export type LiveArtifactProvenanceSourceType = 'connector' | 'local_file' | 'user_input' | 'derived';
export type LiveArtifactRefreshStepStatus = 'running' | 'succeeded' | 'failed' | 'cancelled' | 'skipped';
export type LiveArtifactRefreshSourceType = 'document' | 'artifact';

export interface LiveArtifactPreview {
  type: LiveArtifactPreviewType;
  entry: string;
}

export interface LiveArtifactDocument {
  format: 'html_template_v1';
  templatePath: 'template.html';
  generatedPreviewPath: 'index.html';
  dataPath: 'data.json';
  dataJson: BoundedJsonObject;
  dataSchemaJson?: BoundedJsonObject;
  sourceJson?: LiveArtifactSource;
}

export interface LiveArtifactSource {
  type: LiveArtifactSourceType;
  toolName?: string;
  input: BoundedJsonObject;
  connector?: {
    connectorId: string;
    accountLabel?: string;
    toolName: string;
    approvalPolicy?: LiveArtifactConnectorApprovalPolicy;
  };
  outputMapping?: {
    dataPaths?: Array<{ from: string; to: string }>;
    transform?: LiveArtifactOutputTransform;
  };
  refreshPermission: LiveArtifactRefreshPermission;
}

export interface LiveArtifactProvenanceSource {
  label: string;
  type: LiveArtifactProvenanceSourceType;
  ref?: string;
}

export interface LiveArtifactProvenance {
  generatedAt: string;
  generatedBy: LiveArtifactProvenanceGenerator;
  notes?: string;
  sources: LiveArtifactProvenanceSource[];
}

export interface LiveArtifact {
  schemaVersion: 1;
  id: string;
  projectId: string;
  sessionId?: string;
  createdByRunId?: string;
  title: string;
  slug: string;
  status: LiveArtifactStatus;
  pinned: boolean;
  preview: LiveArtifactPreview;
  refreshStatus: LiveArtifactRefreshStatus;
  createdAt: string;
  updatedAt: string;
  lastRefreshedAt?: string;
  document: LiveArtifactDocument;
}

export interface LiveArtifactRefreshConnectorMetadata {
  connectorId: string;
  accountLabel?: string;
  toolName: string;
  approvalPolicy?: LiveArtifactConnectorApprovalPolicy;
}

export interface LiveArtifactRefreshSourceMetadata {
  sourceType: LiveArtifactRefreshSourceType;
  toolName?: string;
  connector?: LiveArtifactRefreshConnectorMetadata;
}

export interface LiveArtifactRefreshErrorRecord {
  code?: string;
  message: string;
  path?: string;
}

export interface LiveArtifactRefreshLogEntry {
  schemaVersion: 1;
  projectId: string;
  artifactId: string;
  refreshId: string;
  sequence: number;
  step: string;
  status: LiveArtifactRefreshStepStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  source?: LiveArtifactRefreshSourceMetadata;
  error?: LiveArtifactRefreshErrorRecord;
  metadata?: BoundedJsonObject;
  createdAt: string;
}

export interface LiveArtifactCreateInput {
  title: string;
  slug?: string;
  sessionId?: string;
  pinned?: boolean;
  status?: LiveArtifact['status'];
  preview: LiveArtifactPreview;
  document: LiveArtifactDocument;
}

export interface LiveArtifactUpdateInput {
  title?: string;
  slug?: string;
  pinned?: boolean;
  status?: LiveArtifact['status'];
  preview?: LiveArtifactPreview;
  document?: LiveArtifactDocument;
}

export interface LiveArtifactValidationIssue {
  path: string;
  message: string;
}

export type LiveArtifactValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; issues: LiveArtifactValidationIssue[] };

const MAX_ID_LENGTH = 128;
const MAX_TITLE_LENGTH = 200;
const MAX_SLUG_LENGTH = 128;
const MAX_PATH_LENGTH = 260;
const MAX_SHORT_TEXT_LENGTH = 1_024;
const MAX_LONG_TEXT_LENGTH = 16 * 1024;
const MAX_PROVENANCE_SOURCES = 50;
const MAX_MAPPING_PATHS = 100;
const MAX_REFRESH_STEP_LENGTH = 128;
const MAX_REFRESH_ERROR_CODE_LENGTH = 128;
const MAX_REFRESH_ERROR_MESSAGE_LENGTH = 2_048;

const LIVE_ARTIFACT_BOUNDED_JSON_CONSTRAINTS = {
  maxDepth: 8,
  maxObjectKeys: 100,
  maxArrayLength: 500,
  maxStringLength: 16 * 1024,
  maxSerializedBytes: 256 * 1024,
} as const;

const DAEMON_OWNED_INPUT_FIELDS = new Set([
  'id',
  'projectId',
  'run',
  'runId',
  'createdAt',
  'updatedAt',
  'createdByRunId',
  'schemaVersion',
  'refreshStatus',
  'lastRefreshedAt',
]);

const FORBIDDEN_JSON_KEYS = new Set([
  'raw',
  'rawresponse',
  'payload',
  'body',
  'headers',
  'cookie',
  'authorization',
  'token',
  'secret',
  'credential',
  'password',
]);

const LIVE_ARTIFACT_STATUSES = new Set<LiveArtifact['status']>(['active', 'archived', 'error']);
const LIVE_ARTIFACT_REFRESH_STATUSES = new Set<LiveArtifact['refreshStatus']>([
  'never',
  'idle',
  'running',
  'succeeded',
  'failed',
]);
const PREVIEW_TYPES = new Set<LiveArtifactPreview['type']>(['html', 'jsx', 'markdown']);
const SOURCE_TYPES = new Set<LiveArtifactSource['type']>([
  'local_file',
  'daemon_tool',
  'connector_tool',
]);
const CONNECTOR_APPROVAL_POLICIES = new Set<LiveArtifactConnectorApprovalPolicy>([
  'read_only_auto',
  'manual_refresh_granted_for_read_only',
]);
const REFRESH_PERMISSIONS = new Set<LiveArtifactSource['refreshPermission']>([
  'none',
  'manual_refresh_granted_for_read_only',
]);
const OUTPUT_TRANSFORMS = new Set<LiveArtifactOutputTransform>(['identity', 'compact_table', 'metric_summary']);
const PROVENANCE_GENERATORS = new Set<LiveArtifactProvenance['generatedBy']>([
  'agent',
  'refresh_runner',
]);
const PROVENANCE_SOURCE_TYPES = new Set<LiveArtifactProvenanceSource['type']>([
  'connector',
  'local_file',
  'user_input',
  'derived',
]);
const REFRESH_STEP_STATUSES = new Set<LiveArtifactRefreshStepStatus>([
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'skipped',
]);
const REFRESH_SOURCE_TYPES = new Set<LiveArtifactRefreshSourceType>([
  'document',
  'artifact',
]);
const SOURCE_KEYS = new Set(['type', 'toolName', 'input', 'connector', 'outputMapping', 'refreshPermission']);
const CONNECTOR_REFERENCE_KEYS = new Set(['connectorId', 'accountLabel', 'toolName', 'approvalPolicy']);
const OUTPUT_MAPPING_KEYS = new Set(['dataPaths', 'transform']);
const REFRESH_SOURCE_METADATA_KEYS = new Set(['sourceType', 'toolName', 'connector']);

function fail<T>(issues: LiveArtifactValidationIssue[]): LiveArtifactValidationResult<T> {
  return {
    ok: false,
    error: issues[0]?.message ?? 'Live artifact validation failed',
    issues,
  };
}

function ok<T>(value: T): LiveArtifactValidationResult<T> {
  return { ok: true, value };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function asString(value: unknown, path: string, issues: LiveArtifactValidationIssue[], max = MAX_SHORT_TEXT_LENGTH): string | undefined {
  if (typeof value !== 'string') {
    issues.push({ path, message: `${path} must be a string` });
    return undefined;
  }
  if (value.length === 0) {
    issues.push({ path, message: `${path} is required` });
  }
  if (value.length > max) {
    issues.push({ path, message: `${path} exceeds max length (${max})` });
  }
  return value;
}

function asOptionalString(value: unknown, path: string, issues: LiveArtifactValidationIssue[], max = MAX_SHORT_TEXT_LENGTH): string | undefined {
  if (value === undefined) return undefined;
  return asString(value, path, issues, max);
}

function asBoolean(value: unknown, path: string, issues: LiveArtifactValidationIssue[]): boolean | undefined {
  if (typeof value !== 'boolean') {
    issues.push({ path, message: `${path} must be a boolean` });
    return undefined;
  }
  return value;
}

function asOptionalBoolean(value: unknown, path: string, issues: LiveArtifactValidationIssue[]): boolean | undefined {
  if (value === undefined) return undefined;
  return asBoolean(value, path, issues);
}

function validateEnum<T extends string>(value: unknown, allowed: ReadonlySet<T>, path: string, issues: LiveArtifactValidationIssue[]): T | undefined {
  if (typeof value !== 'string' || !allowed.has(value as T)) {
    issues.push({ path, message: `${path} is not allowed` });
    return undefined;
  }
  return value as T;
}

function isIsoDateString(value: string): boolean {
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function validateIsoDate(value: unknown, path: string, issues: LiveArtifactValidationIssue[]): string | undefined {
  const text = asString(value, path, issues, MAX_SHORT_TEXT_LENGTH);
  if (text !== undefined && !isIsoDateString(text)) {
    issues.push({ path, message: `${path} must be an ISO-8601 timestamp` });
  }
  return text;
}

function validateRelativePath(value: string, path: string, issues: LiveArtifactValidationIssue[]): void {
  if (value.length > MAX_PATH_LENGTH) {
    issues.push({ path, message: `${path} exceeds max length (${MAX_PATH_LENGTH})` });
  }
  if (value.includes('\0')) {
    issues.push({ path, message: `${path} cannot contain null bytes` });
  }
  const normalized = value.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    issues.push({ path, message: `${path} cannot be an absolute path` });
  }
  if (normalized.split('/').some((part) => part === '..')) {
    issues.push({ path, message: `${path} cannot contain path traversal` });
  }
}

function validateNoDaemonOwnedFields(raw: Record<string, unknown>, issues: LiveArtifactValidationIssue[]): void {
  for (const key of Object.keys(raw)) {
    if (DAEMON_OWNED_INPUT_FIELDS.has(key)) {
      issues.push({ path: key, message: `${key} is daemon-owned and cannot be supplied` });
    }
  }
}

function validateOnlyAllowedKeys(raw: Record<string, unknown>, allowed: ReadonlySet<string>, path: string, issues: LiveArtifactValidationIssue[]): void {
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      issues.push({ path: `${path}.${key}`, message: `${path}.${key} is not allowed` });
    }
  }
}

function validateBoundedJsonInternal(value: unknown, path: string, issues: LiveArtifactValidationIssue[], depth: number): value is BoundedJsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      issues.push({ path, message: `${path} must be a finite number` });
      return false;
    }
    return true;
  }

  if (typeof value === 'string') {
    if (value.length > LIVE_ARTIFACT_BOUNDED_JSON_CONSTRAINTS.maxStringLength) {
      issues.push({
        path,
        message: `${path} exceeds max string length (${LIVE_ARTIFACT_BOUNDED_JSON_CONSTRAINTS.maxStringLength})`,
      });
      return false;
    }
    return true;
  }

  if (Array.isArray(value)) {
    if (depth > LIVE_ARTIFACT_BOUNDED_JSON_CONSTRAINTS.maxDepth) {
      issues.push({ path, message: `${path} exceeds max JSON depth (${LIVE_ARTIFACT_BOUNDED_JSON_CONSTRAINTS.maxDepth})` });
      return false;
    }
    if (value.length > LIVE_ARTIFACT_BOUNDED_JSON_CONSTRAINTS.maxArrayLength) {
      issues.push({
        path,
        message: `${path} exceeds max array length (${LIVE_ARTIFACT_BOUNDED_JSON_CONSTRAINTS.maxArrayLength})`,
      });
      return false;
    }
    return value.every((item, index) => validateBoundedJsonInternal(item, `${path}.${index}`, issues, depth + 1));
  }

  if (isPlainObject(value)) {
    if (depth > LIVE_ARTIFACT_BOUNDED_JSON_CONSTRAINTS.maxDepth) {
      issues.push({ path, message: `${path} exceeds max JSON depth (${LIVE_ARTIFACT_BOUNDED_JSON_CONSTRAINTS.maxDepth})` });
      return false;
    }
    const entries = Object.entries(value);
    if (entries.length > LIVE_ARTIFACT_BOUNDED_JSON_CONSTRAINTS.maxObjectKeys) {
      issues.push({
        path,
        message: `${path} exceeds max object keys (${LIVE_ARTIFACT_BOUNDED_JSON_CONSTRAINTS.maxObjectKeys})`,
      });
      return false;
    }
    let valid = true;
    for (const [key, child] of entries) {
      if (FORBIDDEN_JSON_KEYS.has(key.toLowerCase())) {
        issues.push({ path: `${path}.${key}`, message: `${path}.${key} uses a forbidden key` });
        valid = false;
      }
      valid = validateBoundedJsonInternal(child, `${path}.${key}`, issues, depth + 1) && valid;
    }
    return valid;
  }

  issues.push({ path, message: `${path} must be JSON-serializable` });
  return false;
}

export function validateBoundedJsonValue(value: unknown, path = 'value'): LiveArtifactValidationResult<BoundedJsonValue> {
  const issues: LiveArtifactValidationIssue[] = [];
  if (validateBoundedJsonInternal(value, path, issues, 1)) {
    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, 'utf8') <= LIVE_ARTIFACT_BOUNDED_JSON_CONSTRAINTS.maxSerializedBytes) {
      return ok(value);
    }
    issues.push({
      path,
      message: `${path} exceeds max serialized size (${LIVE_ARTIFACT_BOUNDED_JSON_CONSTRAINTS.maxSerializedBytes} bytes)`,
    });
  }
  return fail(issues);
}

export function validateBoundedJsonObject(value: unknown, path = 'value'): LiveArtifactValidationResult<BoundedJsonObject> {
  const result = validateBoundedJsonValue(value, path);
  if (!result.ok) return result;
  if (!isPlainObject(result.value)) {
    return fail([{ path, message: `${path} must be a JSON object` }]);
  }
  return ok(result.value);
}

function validateSourceInputPaths(value: BoundedJsonValue, path: string, issues: LiveArtifactValidationIssue[]): void {
  if (typeof value === 'string') {
    validateRelativePath(value, path, issues);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateSourceInputPaths(item, `${path}.${index}`, issues));
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (/path|file|glob|ref/i.test(key)) validateSourceInputPaths(child, `${path}.${key}`, issues);
    }
  }
}

function validatePreview(value: unknown, path: string, issues: LiveArtifactValidationIssue[]): LiveArtifactPreview | undefined {
  if (!isPlainObject(value)) {
    issues.push({ path, message: `${path} must be an object` });
    return undefined;
  }
  const type = validateEnum(value.type, PREVIEW_TYPES, `${path}.type`, issues);
  const entry = asString(value.entry, `${path}.entry`, issues, MAX_PATH_LENGTH);
  if (entry !== undefined) validateRelativePath(entry, `${path}.entry`, issues);
  if (type === undefined || entry === undefined) return undefined;
  return { type, entry };
}

const SAFE_MAPPING_SEGMENT = /^[A-Za-z_][A-Za-z0-9_-]*$|^(?:0|[1-9][0-9]*)$/;
const UNSAFE_MAPPING_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

function validateMappingPath(value: string, path: string, issues: LiveArtifactValidationIssue[]): void {
  const normalized = value.startsWith('$.') ? value.slice(2) : value;
  if (normalized.length === 0 || normalized.startsWith('.') || normalized.endsWith('.') || normalized.includes('..')) {
    issues.push({ path, message: `${path} must be a dot-separated JSON path` });
    return;
  }
  for (const segment of normalized.split('.')) {
    if (!SAFE_MAPPING_SEGMENT.test(segment) || UNSAFE_MAPPING_SEGMENTS.has(segment)) {
      issues.push({ path, message: `${path} contains unsupported JSON path segment: ${segment}` });
      return;
    }
  }
}

function validateSource(value: unknown, path: string, issues: LiveArtifactValidationIssue[]): LiveArtifactSource | undefined {
  if (!isPlainObject(value)) {
    issues.push({ path, message: `${path} must be an object` });
    return undefined;
  }
  validateOnlyAllowedKeys(value, SOURCE_KEYS, path, issues);
  const type = validateEnum(value.type, SOURCE_TYPES, `${path}.type`, issues);
  const toolName = asOptionalString(value.toolName, `${path}.toolName`, issues, MAX_ID_LENGTH);
  const inputResult = validateBoundedJsonObject(value.input, `${path}.input`);
  if (!inputResult.ok) issues.push(...inputResult.issues);
  else validateSourceInputPaths(inputResult.value, `${path}.input`, issues);

  let connector: LiveArtifactSource['connector'];
  if (value.connector !== undefined) {
    if (!isPlainObject(value.connector)) {
      issues.push({ path: `${path}.connector`, message: `${path}.connector must be an object` });
    } else {
      validateOnlyAllowedKeys(value.connector, CONNECTOR_REFERENCE_KEYS, `${path}.connector`, issues);
      const connectorId = asString(value.connector.connectorId, `${path}.connector.connectorId`, issues, MAX_ID_LENGTH);
      const accountLabel = asOptionalString(value.connector.accountLabel, `${path}.connector.accountLabel`, issues, MAX_SHORT_TEXT_LENGTH);
      const connectorToolName = asString(value.connector.toolName, `${path}.connector.toolName`, issues, MAX_ID_LENGTH);
      const approvalPolicy = value.connector.approvalPolicy === undefined
        ? undefined
        : validateEnum(value.connector.approvalPolicy, CONNECTOR_APPROVAL_POLICIES, `${path}.connector.approvalPolicy`, issues);
      if (connectorId !== undefined && connectorToolName !== undefined) {
        const nextConnector: NonNullable<LiveArtifactSource['connector']> = { connectorId, toolName: connectorToolName };
        if (accountLabel !== undefined) nextConnector.accountLabel = accountLabel;
        if (approvalPolicy !== undefined) nextConnector.approvalPolicy = approvalPolicy;
        connector = nextConnector;
      }
    }
  }

  let outputMapping: LiveArtifactSource['outputMapping'];
  if (value.outputMapping !== undefined) {
    if (!isPlainObject(value.outputMapping)) {
      issues.push({ path: `${path}.outputMapping`, message: `${path}.outputMapping must be an object` });
    } else {
      validateOnlyAllowedKeys(value.outputMapping, OUTPUT_MAPPING_KEYS, `${path}.outputMapping`, issues);
      const mapping: NonNullable<LiveArtifactSource['outputMapping']> = {};
      if (value.outputMapping.dataPaths !== undefined) {
        if (!Array.isArray(value.outputMapping.dataPaths) || value.outputMapping.dataPaths.length > MAX_MAPPING_PATHS) {
          issues.push({ path: `${path}.outputMapping.dataPaths`, message: `${path}.outputMapping.dataPaths must be a bounded array` });
        } else {
          mapping.dataPaths = [];
          value.outputMapping.dataPaths.forEach((item, index) => {
            const itemPath = `${path}.outputMapping.dataPaths.${index}`;
            if (!isPlainObject(item)) {
              issues.push({ path: itemPath, message: `${itemPath} must be an object` });
              return;
            }
            const from = asString(item.from, `${itemPath}.from`, issues, MAX_PATH_LENGTH);
            const to = asString(item.to, `${itemPath}.to`, issues, MAX_PATH_LENGTH);
            if (from !== undefined) validateMappingPath(from, `${itemPath}.from`, issues);
            if (to !== undefined) validateMappingPath(to, `${itemPath}.to`, issues);
            if (from !== undefined && to !== undefined) mapping.dataPaths?.push({ from, to });
          });
        }
      }
      if (value.outputMapping.transform !== undefined) {
        const transform = validateEnum(value.outputMapping.transform, OUTPUT_TRANSFORMS, `${path}.outputMapping.transform`, issues);
        if (transform !== undefined) mapping.transform = transform;
      }
      outputMapping = mapping;
    }
  }

  const refreshPermission = validateEnum(value.refreshPermission, REFRESH_PERMISSIONS, `${path}.refreshPermission`, issues);
  if (type === 'connector_tool' && connector === undefined) {
    issues.push({ path: `${path}.connector`, message: `${path}.connector is required for connector_tool sources` });
  }
  if (type === 'connector_tool' && toolName !== undefined && connector !== undefined && toolName !== connector.toolName) {
    issues.push({ path: `${path}.toolName`, message: `${path}.toolName must match ${path}.connector.toolName` });
  }
  if (type === 'daemon_tool' && toolName === undefined) {
    issues.push({ path: `${path}.toolName`, message: `${path}.toolName is required for daemon_tool sources` });
  }
  if (type === undefined || !inputResult.ok || refreshPermission === undefined) return undefined;
  const source: LiveArtifactSource = { type, input: inputResult.value, refreshPermission };
  if (toolName !== undefined) source.toolName = toolName;
  if (connector !== undefined) source.connector = connector;
  if (outputMapping !== undefined) source.outputMapping = outputMapping;
  return source;
}

function validateRefreshSourceMetadata(value: unknown, path: string, issues: LiveArtifactValidationIssue[]): LiveArtifactRefreshSourceMetadata | undefined {
  if (!isPlainObject(value)) {
    issues.push({ path, message: `${path} must be an object` });
    return undefined;
  }
  validateOnlyAllowedKeys(value, REFRESH_SOURCE_METADATA_KEYS, path, issues);
  const sourceType = validateEnum(value.sourceType, REFRESH_SOURCE_TYPES, `${path}.sourceType`, issues);
  const toolName = asOptionalString(value.toolName, `${path}.toolName`, issues, MAX_ID_LENGTH);
  let connector: LiveArtifactRefreshConnectorMetadata | undefined;
  if (value.connector !== undefined) {
    if (!isPlainObject(value.connector)) {
      issues.push({ path: `${path}.connector`, message: `${path}.connector must be an object` });
    } else {
      validateOnlyAllowedKeys(value.connector, CONNECTOR_REFERENCE_KEYS, `${path}.connector`, issues);
      const connectorId = asString(value.connector.connectorId, `${path}.connector.connectorId`, issues, MAX_ID_LENGTH);
      const accountLabel = asOptionalString(value.connector.accountLabel, `${path}.connector.accountLabel`, issues, MAX_SHORT_TEXT_LENGTH);
      const connectorToolName = asString(value.connector.toolName, `${path}.connector.toolName`, issues, MAX_ID_LENGTH);
      const approvalPolicy = value.connector.approvalPolicy === undefined
        ? undefined
        : validateEnum(value.connector.approvalPolicy, CONNECTOR_APPROVAL_POLICIES, `${path}.connector.approvalPolicy`, issues);
      if (connectorId !== undefined && connectorToolName !== undefined) {
        connector = { connectorId, toolName: connectorToolName };
        if (accountLabel !== undefined) connector.accountLabel = accountLabel;
        if (approvalPolicy !== undefined) connector.approvalPolicy = approvalPolicy;
      }
    }
  }
  if (sourceType === undefined) return undefined;
  const source: LiveArtifactRefreshSourceMetadata = { sourceType };
  if (toolName !== undefined) source.toolName = toolName;
  if (connector !== undefined) source.connector = connector;
  return source;
}

function validateRefreshErrorRecord(value: unknown, path: string, issues: LiveArtifactValidationIssue[]): LiveArtifactRefreshErrorRecord | undefined {
  if (!isPlainObject(value)) {
    issues.push({ path, message: `${path} must be an object` });
    return undefined;
  }
  const code = asOptionalString(value.code, `${path}.code`, issues, MAX_REFRESH_ERROR_CODE_LENGTH);
  const message = asString(value.message, `${path}.message`, issues, MAX_REFRESH_ERROR_MESSAGE_LENGTH);
  const errorPath = asOptionalString(value.path, `${path}.path`, issues, MAX_PATH_LENGTH);
  if (message === undefined) return undefined;
  const record: LiveArtifactRefreshErrorRecord = { message };
  if (code !== undefined) record.code = code;
  if (errorPath !== undefined) record.path = errorPath;
  return record;
}

function validateProvenance(value: unknown, path: string, issues: LiveArtifactValidationIssue[]): LiveArtifactProvenance | undefined {
  if (!isPlainObject(value)) {
    issues.push({ path, message: `${path} must be an object` });
    return undefined;
  }
  const generatedAt = validateIsoDate(value.generatedAt, `${path}.generatedAt`, issues);
  const generatedBy = validateEnum(value.generatedBy, PROVENANCE_GENERATORS, `${path}.generatedBy`, issues);
  const notes = asOptionalString(value.notes, `${path}.notes`, issues, MAX_LONG_TEXT_LENGTH);
  let sources: LiveArtifactProvenanceSource[] | undefined;
  if (!Array.isArray(value.sources) || value.sources.length > MAX_PROVENANCE_SOURCES) {
    issues.push({ path: `${path}.sources`, message: `${path}.sources must be a bounded array` });
  } else {
    sources = [];
    value.sources.forEach((source, index) => {
      const sourcePath = `${path}.sources.${index}`;
      if (!isPlainObject(source)) {
        issues.push({ path: sourcePath, message: `${sourcePath} must be an object` });
        return;
      }
      const label = asString(source.label, `${sourcePath}.label`, issues, MAX_SHORT_TEXT_LENGTH);
      const type = validateEnum(source.type, PROVENANCE_SOURCE_TYPES, `${sourcePath}.type`, issues);
      const ref = asOptionalString(source.ref, `${sourcePath}.ref`, issues, MAX_PATH_LENGTH);
      if (ref !== undefined) validateRelativePath(ref, `${sourcePath}.ref`, issues);
      if (label !== undefined && type !== undefined) {
        const provenanceSource: LiveArtifactProvenanceSource = { label, type };
        if (ref !== undefined) provenanceSource.ref = ref;
        sources?.push(provenanceSource);
      }
    });
  }
  if (generatedAt === undefined || generatedBy === undefined || sources === undefined) return undefined;
  const provenance: LiveArtifactProvenance = { generatedAt, generatedBy, sources };
  if (notes !== undefined) provenance.notes = notes;
  return provenance;
}

function validateOptionalInteger(value: unknown, path: string, issues: LiveArtifactValidationIssue[], min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    issues.push({ path, message: `${path} must be an integer between ${min} and ${max}` });
    return undefined;
  }
  return value;
}

function validateDocument(value: unknown, path: string, issues: LiveArtifactValidationIssue[]): LiveArtifactDocument | undefined {
  if (!isPlainObject(value)) {
    issues.push({ path, message: `${path} must be an object` });
    return undefined;
  }
  if (value.format !== 'html_template_v1') issues.push({ path: `${path}.format`, message: `${path}.format must be html_template_v1` });
  if (value.templatePath !== 'template.html') issues.push({ path: `${path}.templatePath`, message: `${path}.templatePath must be template.html` });
  if (value.generatedPreviewPath !== 'index.html') issues.push({ path: `${path}.generatedPreviewPath`, message: `${path}.generatedPreviewPath must be index.html` });
  if (value.dataPath !== 'data.json') issues.push({ path: `${path}.dataPath`, message: `${path}.dataPath must be data.json` });
  const dataJsonResult = validateBoundedJsonObject(value.dataJson, `${path}.dataJson`);
  if (!dataJsonResult.ok) issues.push(...dataJsonResult.issues);
  let dataSchemaJson: BoundedJsonObject | undefined;
  if (value.dataSchemaJson !== undefined) {
    const schemaResult = validateBoundedJsonObject(value.dataSchemaJson, `${path}.dataSchemaJson`);
    if (schemaResult.ok) dataSchemaJson = schemaResult.value;
    else issues.push(...schemaResult.issues);
  }
  const sourceJson = value.sourceJson === undefined ? undefined : validateSource(value.sourceJson, `${path}.sourceJson`, issues);
  if (value.format !== 'html_template_v1' || value.templatePath !== 'template.html' || value.generatedPreviewPath !== 'index.html' || value.dataPath !== 'data.json' || !dataJsonResult.ok) {
    return undefined;
  }
  const document: LiveArtifactDocument = {
    format: 'html_template_v1',
    templatePath: 'template.html',
    generatedPreviewPath: 'index.html',
    dataPath: 'data.json',
    dataJson: dataJsonResult.value,
  };
  if (dataSchemaJson !== undefined) document.dataSchemaJson = dataSchemaJson;
  if (sourceJson !== undefined) document.sourceJson = sourceJson;
  return document;
}

export function validatePersistedLiveArtifact(value: unknown, path = 'liveArtifact'): LiveArtifactValidationResult<LiveArtifact> {
  const issues: LiveArtifactValidationIssue[] = [];
  if (!isPlainObject(value)) return fail([{ path, message: `${path} must be an object` }]);

  if (value.schemaVersion !== 1) issues.push({ path: `${path}.schemaVersion`, message: `${path}.schemaVersion must be 1` });
  const id = asString(value.id, `${path}.id`, issues, MAX_ID_LENGTH);
  const projectId = asString(value.projectId, `${path}.projectId`, issues, MAX_ID_LENGTH);
  const sessionId = asOptionalString(value.sessionId, `${path}.sessionId`, issues, MAX_ID_LENGTH);
  const createdByRunId = asOptionalString(value.createdByRunId, `${path}.createdByRunId`, issues, MAX_ID_LENGTH);
  const title = asString(value.title, `${path}.title`, issues, MAX_TITLE_LENGTH);
  const slug = asString(value.slug, `${path}.slug`, issues, MAX_SLUG_LENGTH);
  const status = validateEnum(value.status, LIVE_ARTIFACT_STATUSES, `${path}.status`, issues);
  const pinned = asBoolean(value.pinned, `${path}.pinned`, issues);
  const preview = validatePreview(value.preview, `${path}.preview`, issues);
  const refreshStatus = validateEnum(value.refreshStatus, LIVE_ARTIFACT_REFRESH_STATUSES, `${path}.refreshStatus`, issues);
  const createdAt = validateIsoDate(value.createdAt, `${path}.createdAt`, issues);
  const updatedAt = validateIsoDate(value.updatedAt, `${path}.updatedAt`, issues);
  const lastRefreshedAt = value.lastRefreshedAt === undefined ? undefined : validateIsoDate(value.lastRefreshedAt, `${path}.lastRefreshedAt`, issues);
  const document = validateDocument(value.document, `${path}.document`, issues);

  if (issues.length > 0 || id === undefined || projectId === undefined || title === undefined || slug === undefined || status === undefined || pinned === undefined || preview === undefined || refreshStatus === undefined || createdAt === undefined || updatedAt === undefined || document === undefined) {
    return fail(issues);
  }
  const liveArtifact: LiveArtifact = {
    schemaVersion: 1,
    id,
    projectId,
    title,
    slug,
    status,
    pinned,
    preview,
    refreshStatus,
    createdAt,
    updatedAt,
    document,
  };
  if (sessionId !== undefined) liveArtifact.sessionId = sessionId;
  if (createdByRunId !== undefined) liveArtifact.createdByRunId = createdByRunId;
  if (lastRefreshedAt !== undefined) liveArtifact.lastRefreshedAt = lastRefreshedAt;
  return ok(liveArtifact);
}

export function validateLiveArtifactRefreshLogEntry(value: unknown, path = 'refreshLogEntry'): LiveArtifactValidationResult<LiveArtifactRefreshLogEntry> {
  const issues: LiveArtifactValidationIssue[] = [];
  if (!isPlainObject(value)) return fail([{ path, message: `${path} must be an object` }]);

  if (value.schemaVersion !== 1) issues.push({ path: `${path}.schemaVersion`, message: `${path}.schemaVersion must be 1` });
  const projectId = asString(value.projectId, `${path}.projectId`, issues, MAX_ID_LENGTH);
  const artifactId = asString(value.artifactId, `${path}.artifactId`, issues, MAX_ID_LENGTH);
  const refreshId = asString(value.refreshId, `${path}.refreshId`, issues, MAX_ID_LENGTH);
  const sequence = validateOptionalInteger(value.sequence, `${path}.sequence`, issues, 0, Number.MAX_SAFE_INTEGER);
  const step = asString(value.step, `${path}.step`, issues, MAX_REFRESH_STEP_LENGTH);
  const status = validateEnum(value.status, REFRESH_STEP_STATUSES, `${path}.status`, issues);
  const startedAt = validateIsoDate(value.startedAt, `${path}.startedAt`, issues);
  const finishedAt = value.finishedAt === undefined ? undefined : validateIsoDate(value.finishedAt, `${path}.finishedAt`, issues);
  const durationMs = validateOptionalInteger(value.durationMs, `${path}.durationMs`, issues, 0, Number.MAX_SAFE_INTEGER);
  const source = value.source === undefined ? undefined : validateRefreshSourceMetadata(value.source, `${path}.source`, issues);
  const error = value.error === undefined ? undefined : validateRefreshErrorRecord(value.error, `${path}.error`, issues);
  let metadata: BoundedJsonObject | undefined;
  if (value.metadata !== undefined) {
    const metadataResult = validateBoundedJsonObject(value.metadata, `${path}.metadata`);
    if (metadataResult.ok) metadata = metadataResult.value;
    else issues.push(...metadataResult.issues);
  }
  const createdAt = validateIsoDate(value.createdAt, `${path}.createdAt`, issues);

  if (issues.length > 0 || projectId === undefined || artifactId === undefined || refreshId === undefined || sequence === undefined || step === undefined || status === undefined || startedAt === undefined || createdAt === undefined) {
    return fail(issues);
  }

  const entry: LiveArtifactRefreshLogEntry = {
    schemaVersion: 1,
    projectId,
    artifactId,
    refreshId,
    sequence,
    step,
    status,
    startedAt,
    createdAt,
  };
  if (finishedAt !== undefined) entry.finishedAt = finishedAt;
  if (durationMs !== undefined) entry.durationMs = durationMs;
  if (source !== undefined) entry.source = source;
  if (error !== undefined) entry.error = error;
  if (metadata !== undefined) entry.metadata = metadata;
  return ok(entry);
}

export function validateLiveArtifactCreateInput(value: unknown, path = 'input'): LiveArtifactValidationResult<LiveArtifactCreateInput> {
  const issues: LiveArtifactValidationIssue[] = [];
  if (!isPlainObject(value)) return fail([{ path, message: `${path} must be an object` }]);
  validateNoDaemonOwnedFields(value, issues);
  const title = asString(value.title, `${path}.title`, issues, MAX_TITLE_LENGTH);
  const slug = asOptionalString(value.slug, `${path}.slug`, issues, MAX_SLUG_LENGTH);
  const sessionId = asOptionalString(value.sessionId, `${path}.sessionId`, issues, MAX_ID_LENGTH);
  const pinned = asOptionalBoolean(value.pinned, `${path}.pinned`, issues);
  const status = value.status === undefined ? undefined : validateEnum(value.status, LIVE_ARTIFACT_STATUSES, `${path}.status`, issues);
  const preview = validatePreview(value.preview, `${path}.preview`, issues);
  const document = validateDocument(value.document, `${path}.document`, issues);
  if (issues.length > 0 || title === undefined || preview === undefined || document === undefined) return fail(issues);
  const input: LiveArtifactCreateInput = { title, preview, document };
  if (slug !== undefined) input.slug = slug;
  if (sessionId !== undefined) input.sessionId = sessionId;
  if (pinned !== undefined) input.pinned = pinned;
  if (status !== undefined) input.status = status;
  return ok(input);
}

export function validateLiveArtifactUpdateInput(value: unknown, path = 'input'): LiveArtifactValidationResult<LiveArtifactUpdateInput> {
  const issues: LiveArtifactValidationIssue[] = [];
  if (!isPlainObject(value)) return fail([{ path, message: `${path} must be an object` }]);
  validateNoDaemonOwnedFields(value, issues);
  const title = asOptionalString(value.title, `${path}.title`, issues, MAX_TITLE_LENGTH);
  const slug = asOptionalString(value.slug, `${path}.slug`, issues, MAX_SLUG_LENGTH);
  const pinned = asOptionalBoolean(value.pinned, `${path}.pinned`, issues);
  const status = value.status === undefined ? undefined : validateEnum(value.status, LIVE_ARTIFACT_STATUSES, `${path}.status`, issues);
  const preview = value.preview === undefined ? undefined : validatePreview(value.preview, `${path}.preview`, issues);
  const document = value.document === undefined ? undefined : validateDocument(value.document, `${path}.document`, issues);
  if (issues.length > 0) return fail(issues);
  const input: LiveArtifactUpdateInput = {};
  if (title !== undefined) input.title = title;
  if (slug !== undefined) input.slug = slug;
  if (pinned !== undefined) input.pinned = pinned;
  if (status !== undefined) input.status = status;
  if (preview !== undefined) input.preview = preview;
  if (document !== undefined) input.document = document;
  return ok(input);
}
