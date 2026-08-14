import { createHash } from "node:crypto";
import { isAbsolute, posix, win32 } from "node:path";

import { isClosureChannel } from "@open-design/closure/protocol";

import {
  STANDALONE_PROTOCOL_VERSION,
  STANDALONE_BOOTSTRAP_SCHEMA_VERSION,
  STANDALONE_BOOTSTRAP_PROGRESS_SCHEMA_VERSION,
  STANDALONE_BOOTSTRAP_RESULT_SCHEMA_VERSION,
  STANDALONE_HANDOFF_SCHEMA_VERSION,
  STANDALONE_BOOTLOADER_ENTRY_PATH,
  StandaloneDigest,
  StandaloneBootstrapScope,
  StandaloneHandoffScope,
  StandaloneRuntimeDescriptor,
  StandaloneAttachmentDescriptor,
  StandaloneHandoffEnvelope,
  StandalonePaths,
  StandaloneBootstrapDescriptor,
  StandaloneBootstrapRequest,
  StandaloneBootstrapResolution,
  STANDALONE_BOOTSTRAP_PROGRESS_STAGES,
  StandaloneBootstrapProgressStage,
  StandaloneBootstrapProgress,
  StandaloneLifecycleTransitionCredential,
  STANDALONE_BOOTSTRAP_ERROR_CODES,
  StandaloneBootstrapErrorCode,
  StandaloneBootstrapResult,
  StandaloneProtocolJsonValue,
  StandaloneShellCapabilityPort,
  STANDALONE_SHELL_CAPABILITIES,
  StandaloneShellCapability,
  StandaloneExportPdfInput,
  StandaloneExportPdfResult,
  StandaloneRenderSlidesInput,
  StandaloneRenderSlidesErrorCode,
  StandaloneRenderSlidesResult,
  StandaloneExportArtifactInput,
  StandaloneExportArtifactResult,
  StandaloneShellCapabilityInput,
  StandaloneShellCapabilityOutput,
  StandaloneHandoffDescriptor,
  StandaloneHandoffRequest,
  StandaloneProtocolError,
} from "./index.js";

export function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new StandaloneProtocolError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function normalizeToken(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || !/^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u.test(value)
  ) {
    throw new StandaloneProtocolError(`${label} must be a lowercase protocol token`);
  }
  return value;
}

function normalizeNamespace(value: unknown): string {
  if (
    typeof value !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)
  ) {
    throw new StandaloneProtocolError("standalone namespace must be a safe local token");
  }
  return value;
}

export function normalizeVersion(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value !== value.trim()
    || !/^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(value)
  ) {
    throw new StandaloneProtocolError(`${label} must be a comparable semantic version`);
  }
  return value;
}

function normalizeDigest(value: unknown): StandaloneDigest {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new StandaloneProtocolError("standalone digest must be a lowercase sha256 digest");
  }
  return value as StandaloneDigest;
}

function normalizePath(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value !== value.trim()
    || value.includes("\0")
    || (!isAbsolute(value) && !posix.isAbsolute(value) && !win32.isAbsolute(value))
  ) {
    throw new StandaloneProtocolError(`${label} must be an absolute path`);
  }
  return value;
}

function normalizeNullableHttpUrl(value: unknown, label: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new StandaloneProtocolError(`${label} must be null or an absolute http(s) URL`);
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("unsupported protocol");
    return parsed.toString();
  } catch {
    throw new StandaloneProtocolError(`${label} must be null or an absolute http(s) URL`);
  }
}

export function normalizeJsonValue(
  value: unknown,
  label: string,
  seen: Set<object> = new Set(),
): StandaloneProtocolJsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new StandaloneProtocolError(`${label} numbers must be finite`);
    return value;
  }
  if (typeof value !== "object") {
    throw new StandaloneProtocolError(`${label} must contain only JSON values`);
  }
  if (seen.has(value)) throw new StandaloneProtocolError(`${label} must not contain cycles`);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry, index) => normalizeJsonValue(entry, `${label}[${index}]`, seen));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new StandaloneProtocolError(`${label} objects must be plain JSON records`);
    }
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      normalizeJsonValue(entry, `${label}.${key}`, seen),
    ]));
  } finally {
    seen.delete(value);
  }
}

export function requireKnownKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const allowed = new Set(keys);
  const extras = Object.keys(value).filter((key) => !allowed.has(key));
  if (extras.length > 0) {
    throw new StandaloneProtocolError(`${label} contains unsupported fields: ${extras.join(", ")}`);
  }
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new StandaloneProtocolError(`${label} must be a boolean`);
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") throw new StandaloneProtocolError(`${label} must be a string`);
  return value;
}

export function requiredString(value: unknown, label: string): string {
  const normalized = optionalString(value, label);
  if (normalized == null || normalized.length === 0) {
    throw new StandaloneProtocolError(`${label} must be a non-empty string`);
  }
  return normalized;
}

function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value == null) return undefined;
  return requireBoolean(value, label);
}

function optionalPositiveNumber(value: unknown, label: string): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new StandaloneProtocolError(`${label} must be a positive number`);
  }
  return value;
}

function optionalNonNegativeInteger(value: unknown, label: string): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new StandaloneProtocolError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function optionalStringArray(value: unknown, label: string): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new StandaloneProtocolError(`${label} must be an array of strings`);
  }
  return [...value] as string[];
}

function validateExportPdfInput(value: unknown): StandaloneExportPdfInput {
  const input = requireRecord(value, "standalone PDF export input");
  requireKnownKeys(input, ["baseHref", "deck", "defaultFilename", "html", "title"], "standalone PDF export input");
  return {
    ...(input.baseHref == null ? {} : { baseHref: requiredString(input.baseHref, "standalone PDF export baseHref") }),
    deck: requireBoolean(input.deck, "standalone PDF export deck"),
    defaultFilename: requiredString(input.defaultFilename, "standalone PDF export defaultFilename"),
    html: requiredString(input.html, "standalone PDF export html"),
    title: requiredString(input.title, "standalone PDF export title"),
  };
}

function validateExportPdfResult(value: unknown): StandaloneExportPdfResult {
  const result = requireRecord(value, "standalone PDF export result");
  requireKnownKeys(result, ["canceled", "error", "ok", "path"], "standalone PDF export result");
  return {
    ...(result.canceled == null ? {} : { canceled: requireBoolean(result.canceled, "standalone PDF export canceled") }),
    ...(result.error == null ? {} : { error: optionalString(result.error, "standalone PDF export error")! }),
    ok: requireBoolean(result.ok, "standalone PDF export ok"),
    ...(result.path == null ? {} : { path: optionalString(result.path, "standalone PDF export path")! }),
  };
}

function validateRenderSlidesInput(value: unknown): StandaloneRenderSlidesInput {
  const input = requireRecord(value, "standalone slide render input");
  requireKnownKeys(input, [
    "baseHref", "deck", "editable", "height", "html", "index", "outputDir",
    "pageImageFormat", "paginate", "stitch", "width",
  ], "standalone slide render input");
  const outputDir = input.outputDir == null
    ? undefined
    : requiredString(input.outputDir, "standalone slide render outputDir");
  if (outputDir != null && !isAbsolute(outputDir) && !posix.isAbsolute(outputDir) && !win32.isAbsolute(outputDir)) {
    throw new StandaloneProtocolError("standalone slide render outputDir must be an absolute path");
  }
  if (input.pageImageFormat != null && input.pageImageFormat !== "jpeg" && input.pageImageFormat !== "png") {
    throw new StandaloneProtocolError("standalone slide render pageImageFormat must be jpeg or png");
  }
  return {
    ...(input.baseHref == null ? {} : { baseHref: requiredString(input.baseHref, "standalone slide render baseHref") }),
    ...(input.deck == null ? {} : { deck: optionalBoolean(input.deck, "standalone slide render deck")! }),
    ...(input.editable == null ? {} : { editable: optionalBoolean(input.editable, "standalone slide render editable")! }),
    ...(input.height == null ? {} : { height: optionalPositiveNumber(input.height, "standalone slide render height")! }),
    html: requiredString(input.html, "standalone slide render html"),
    ...(input.index == null ? {} : { index: optionalNonNegativeInteger(input.index, "standalone slide render index")! }),
    ...(outputDir == null ? {} : { outputDir }),
    ...(input.pageImageFormat == null ? {} : { pageImageFormat: input.pageImageFormat }),
    ...(input.paginate == null ? {} : { paginate: optionalBoolean(input.paginate, "standalone slide render paginate")! }),
    ...(input.stitch == null ? {} : { stitch: optionalBoolean(input.stitch, "standalone slide render stitch")! }),
    ...(input.width == null ? {} : { width: optionalPositiveNumber(input.width, "standalone slide render width")! }),
  };
}

function validateRenderSlidesResult(value: unknown): StandaloneRenderSlidesResult {
  const result = requireRecord(value, "standalone slide render result");
  requireKnownKeys(result, [
    "error", "errorCode", "height", "mode", "ok", "pptxFile", "slideFiles", "slides", "width",
  ], "standalone slide render result");
  const errorCodes: readonly StandaloneRenderSlidesErrorCode[] = [
    "NO_SLIDES", "PAGE_TOO_TALL", "RENDER_FAILED", "SLIDE_INDEX_OUT_OF_RANGE",
  ];
  if (result.errorCode != null && !errorCodes.includes(result.errorCode as StandaloneRenderSlidesErrorCode)) {
    throw new StandaloneProtocolError("standalone slide render errorCode is unsupported");
  }
  if (result.mode != null && result.mode !== "deck" && result.mode !== "page") {
    throw new StandaloneProtocolError("standalone slide render mode must be deck or page");
  }
  return {
    ...(result.error == null ? {} : { error: optionalString(result.error, "standalone slide render error")! }),
    ...(result.errorCode == null ? {} : { errorCode: result.errorCode as StandaloneRenderSlidesErrorCode }),
    ...(result.height == null ? {} : { height: optionalPositiveNumber(result.height, "standalone slide render height")! }),
    ...(result.mode == null ? {} : { mode: result.mode }),
    ok: requireBoolean(result.ok, "standalone slide render ok"),
    ...(result.pptxFile == null ? {} : { pptxFile: optionalString(result.pptxFile, "standalone slide render pptxFile")! }),
    ...(result.slideFiles == null ? {} : { slideFiles: optionalStringArray(result.slideFiles, "standalone slide render slideFiles")! }),
    ...(result.slides == null ? {} : { slides: optionalStringArray(result.slides, "standalone slide render slides")! }),
    ...(result.width == null ? {} : { width: optionalPositiveNumber(result.width, "standalone slide render width")! }),
  };
}

function validateExportArtifactInput(value: unknown): StandaloneExportArtifactInput {
  const input = requireRecord(value, "standalone artifact export input");
  requireKnownKeys(input, ["baseHref", "deck", "format", "height", "html", "imageFormat", "title", "width"], "standalone artifact export input");
  if (input.format !== "image" && input.format !== "pdf") {
    throw new StandaloneProtocolError("standalone artifact export format must be image or pdf");
  }
  if (input.imageFormat != null && input.imageFormat !== "jpeg" && input.imageFormat !== "png") {
    throw new StandaloneProtocolError("standalone artifact export imageFormat must be jpeg or png");
  }
  return {
    ...(input.baseHref == null ? {} : { baseHref: requiredString(input.baseHref, "standalone artifact export baseHref") }),
    deck: requireBoolean(input.deck, "standalone artifact export deck"),
    format: input.format,
    ...(input.height == null ? {} : { height: optionalPositiveNumber(input.height, "standalone artifact export height")! }),
    html: requiredString(input.html, "standalone artifact export html"),
    ...(input.imageFormat == null ? {} : { imageFormat: input.imageFormat }),
    title: requiredString(input.title, "standalone artifact export title"),
    ...(input.width == null ? {} : { width: optionalPositiveNumber(input.width, "standalone artifact export width")! }),
  };
}

function validateExportArtifactResult(value: unknown): StandaloneExportArtifactResult {
  const result = requireRecord(value, "standalone artifact export result");
  requireKnownKeys(result, ["bytes", "error", "mime", "ok", "path"], "standalone artifact export result");
  return {
    ...(result.bytes == null ? {} : { bytes: optionalNonNegativeInteger(result.bytes, "standalone artifact export bytes")! }),
    ...(result.error == null ? {} : { error: optionalString(result.error, "standalone artifact export error")! }),
    ...(result.mime == null ? {} : { mime: optionalString(result.mime, "standalone artifact export mime")! }),
    ok: requireBoolean(result.ok, "standalone artifact export ok"),
    ...(result.path == null ? {} : { path: optionalString(result.path, "standalone artifact export path")! }),
  };
}

export function validateStandaloneShellCapabilityInput<
  TCapability extends StandaloneShellCapability,
>(
  capability: TCapability,
  value: unknown,
): StandaloneShellCapabilityInput<TCapability> {
  switch (capability) {
    case STANDALONE_SHELL_CAPABILITIES.EXPORT_ARTIFACT:
      return validateExportArtifactInput(value) as StandaloneShellCapabilityInput<TCapability>;
    case STANDALONE_SHELL_CAPABILITIES.EXPORT_PDF:
      return validateExportPdfInput(value) as StandaloneShellCapabilityInput<TCapability>;
    case STANDALONE_SHELL_CAPABILITIES.RENDER_SLIDES:
      return validateRenderSlidesInput(value) as StandaloneShellCapabilityInput<TCapability>;
  }
}

export function validateStandaloneShellCapabilityOutput<
  TCapability extends StandaloneShellCapability,
>(
  capability: TCapability,
  value: unknown,
): StandaloneShellCapabilityOutput<TCapability> {
  switch (capability) {
    case STANDALONE_SHELL_CAPABILITIES.EXPORT_ARTIFACT:
      return validateExportArtifactResult(value) as StandaloneShellCapabilityOutput<TCapability>;
    case STANDALONE_SHELL_CAPABILITIES.EXPORT_PDF:
      return validateExportPdfResult(value) as StandaloneShellCapabilityOutput<TCapability>;
    case STANDALONE_SHELL_CAPABILITIES.RENDER_SLIDES:
      return validateRenderSlidesResult(value) as StandaloneShellCapabilityOutput<TCapability>;
  }
}

export function validateStandaloneHandoffScope(value: unknown): StandaloneHandoffScope {
  const scope = requireRecord(value, "standalone handoff scope");
  if (!isClosureChannel(scope.channel)) {
    throw new StandaloneProtocolError(`unsupported standalone channel: ${String(scope.channel)}`);
  }
  if (
    typeof scope.generation !== "number"
    || !Number.isSafeInteger(scope.generation)
    || scope.generation < 0
  ) {
    throw new StandaloneProtocolError("standalone generation must be a non-negative safe integer");
  }
  return {
    channel: scope.channel,
    generation: scope.generation,
    namespace: normalizeNamespace(scope.namespace),
  };
}

export function validateStandaloneRuntimeDescriptor(value: unknown): StandaloneRuntimeDescriptor {
  const descriptor = requireRecord(value, "standalone runtime descriptor");
  const release = requireRecord(descriptor.release, "standalone release descriptor");
  const standalone = requireRecord(descriptor.standalone, "standalone body descriptor");
  if (standalone.protocolVersion !== STANDALONE_PROTOCOL_VERSION) {
    throw new StandaloneProtocolError(
      `unsupported standalone protocol version: ${String(standalone.protocolVersion)}`,
    );
  }
  return {
    release: {
      version: normalizeVersion(release.version, "standalone release version"),
    },
    standalone: {
      digest: normalizeDigest(standalone.digest),
      protocolVersion: STANDALONE_PROTOCOL_VERSION,
      version: normalizeVersion(standalone.version, "standalone body version"),
    },
  };
}

function descriptorJson(descriptor: StandaloneRuntimeDescriptor): string {
  return JSON.stringify({
    release: { version: descriptor.release.version },
    standalone: {
      digest: descriptor.standalone.digest,
      protocolVersion: descriptor.standalone.protocolVersion,
      version: descriptor.standalone.version,
    },
  });
}

export function validateStandaloneAttachmentDescriptor(
  value: unknown,
): StandaloneAttachmentDescriptor {
  const attachment = requireRecord(value, "standalone attachment descriptor");
  const shell = requireRecord(attachment.shell, "standalone attachment shell descriptor");
  return {
    id: normalizeToken(attachment.id, "standalone attachment id"),
    shell: {
      digest: normalizeDigest(shell.digest),
      type: normalizeToken(shell.type, "standalone shell type"),
      version: normalizeVersion(shell.version, "standalone shell version"),
    },
  };
}

export function validateStandaloneBootstrapScope(value: unknown): StandaloneBootstrapScope {
  const scope = requireRecord(value, "standalone bootstrap scope");
  requireKnownKeys(scope, ["channel", "namespace"], "standalone bootstrap scope");
  if (!isClosureChannel(scope.channel)) {
    throw new StandaloneProtocolError(`unsupported standalone channel: ${String(scope.channel)}`);
  }
  return Object.freeze({
    channel: scope.channel,
    namespace: normalizeNamespace(scope.namespace),
  });
}

export function validateStandaloneBootstrapDescriptor(
  value: unknown,
): StandaloneBootstrapDescriptor {
  const descriptor = requireRecord(value, "standalone bootstrap descriptor");
  requireKnownKeys(
    descriptor,
    ["attachment", "discovery", "paths", "releaseVersion", "repositoryConfigPath", "schemaVersion", "scope"],
    "standalone bootstrap descriptor",
  );
  if (descriptor.schemaVersion !== STANDALONE_BOOTSTRAP_SCHEMA_VERSION) {
    throw new StandaloneProtocolError("standalone bootstrap schemaVersion is unsupported");
  }
  const discovery = requireRecord(descriptor.discovery, "standalone bootstrap discovery");
  requireKnownKeys(discovery, ["metadataUrl", "target"], "standalone bootstrap discovery");
  return Object.freeze({
    attachment: validateStandaloneAttachmentDescriptor(descriptor.attachment),
    discovery: Object.freeze({
      metadataUrl: normalizeNullableHttpUrl(discovery.metadataUrl, "standalone bootstrap metadataUrl"),
      target: normalizeToken(discovery.target, "standalone bootstrap target"),
    }),
    paths: validateStandalonePaths(descriptor.paths),
    releaseVersion: normalizeVersion(descriptor.releaseVersion, "standalone requested release version"),
    repositoryConfigPath: normalizePath(
      descriptor.repositoryConfigPath,
      "standalone bootstrap repositoryConfigPath",
    ),
    schemaVersion: STANDALONE_BOOTSTRAP_SCHEMA_VERSION,
    scope: validateStandaloneBootstrapScope(descriptor.scope),
  });
}

export function validateStandaloneBootstrapRequest(value: unknown): StandaloneBootstrapRequest {
  const request = requireRecord(value, "standalone bootstrap request");
  requireKnownKeys(
    request,
    ["attachment", "capabilities", "discovery", "paths", "releaseVersion", "repositoryConfigPath", "schemaVersion", "scope"],
    "standalone bootstrap request",
  );
  const descriptor = validateStandaloneBootstrapDescriptor({
    attachment: request.attachment,
    discovery: request.discovery,
    paths: request.paths,
    releaseVersion: request.releaseVersion,
    repositoryConfigPath: request.repositoryConfigPath,
    schemaVersion: request.schemaVersion,
    scope: request.scope,
  });
  const capabilities = requireRecord(request.capabilities, "standalone bootstrap capabilities");
  if (typeof capabilities.invoke !== "function") {
    throw new StandaloneProtocolError("standalone bootstrap capabilities must provide invoke()");
  }
  return Object.freeze({ ...descriptor, capabilities: request.capabilities as StandaloneShellCapabilityPort });
}

export function validateStandaloneBootstrapResolution(
  value: unknown,
): StandaloneBootstrapResolution {
  const resolution = requireRecord(value, "standalone bootstrap resolution");
  requireKnownKeys(resolution, ["bootloaderPath", "handoff"], "standalone bootstrap resolution");
  const bootloaderPath = normalizePath(resolution.bootloaderPath, "standalone bootstrap bootloaderPath");
  if (!bootloaderPath.endsWith(`/${STANDALONE_BOOTLOADER_ENTRY_PATH}`)
    && !bootloaderPath.endsWith(`\\${STANDALONE_BOOTLOADER_ENTRY_PATH}`)) {
    throw new StandaloneProtocolError(
      `standalone bootstrap bootloaderPath must end with ${STANDALONE_BOOTLOADER_ENTRY_PATH}`,
    );
  }
  return Object.freeze({
    bootloaderPath,
    handoff: validateStandaloneHandoffDescriptor(resolution.handoff),
  });
}

export function validateStandaloneBootstrapProgress(
  value: unknown,
): StandaloneBootstrapProgress {
  const progress = requireRecord(value, "standalone bootstrap progress");
  requireKnownKeys(
    progress,
    ["initialLoad", "progress", "schemaVersion", "stage", "subject"],
    "standalone bootstrap progress",
  );
  if (progress.schemaVersion !== STANDALONE_BOOTSTRAP_PROGRESS_SCHEMA_VERSION) {
    throw new StandaloneProtocolError("standalone bootstrap progress schemaVersion is unsupported");
  }
  if (!STANDALONE_BOOTSTRAP_PROGRESS_STAGES.includes(
    progress.stage as StandaloneBootstrapProgressStage,
  )) {
    throw new StandaloneProtocolError("standalone bootstrap progress stage is unsupported");
  }
  let normalizedProgress: StandaloneBootstrapProgress["progress"];
  if (progress.progress != null) {
    const quantitative = requireRecord(
      progress.progress,
      "standalone bootstrap quantitative progress",
    );
    requireKnownKeys(
      quantitative,
      ["completed", "total", "unit"],
      "standalone bootstrap quantitative progress",
    );
    const completed = optionalNonNegativeInteger(
      quantitative.completed,
      "standalone bootstrap completed progress",
    );
    const total = optionalNonNegativeInteger(
      quantitative.total,
      "standalone bootstrap total progress",
    );
    if (completed == null || total == null || total === 0 || completed > total) {
      throw new StandaloneProtocolError(
        "standalone bootstrap quantitative progress must satisfy 0 <= completed <= total",
      );
    }
    if (quantitative.unit !== "bytes" && quantitative.unit !== "components") {
      throw new StandaloneProtocolError("standalone bootstrap progress unit is unsupported");
    }
    normalizedProgress = Object.freeze({ completed, total, unit: quantitative.unit });
  }
  const subject = requireRecord(progress.subject, "standalone bootstrap progress subject");
  requireKnownKeys(subject, ["id", "kind", "title"], "standalone bootstrap progress subject");
  if (subject.kind !== "resource" && subject.kind !== "standalone") {
    throw new StandaloneProtocolError("standalone bootstrap progress subject kind is unsupported");
  }
  return Object.freeze({
    initialLoad: requireBoolean(progress.initialLoad, "standalone bootstrap initialLoad"),
    ...(normalizedProgress == null ? {} : { progress: normalizedProgress }),
    schemaVersion: STANDALONE_BOOTSTRAP_PROGRESS_SCHEMA_VERSION,
    stage: progress.stage as StandaloneBootstrapProgressStage,
    subject: Object.freeze({
      id: requiredString(subject.id, "standalone bootstrap progress subject id"),
      kind: subject.kind,
      title: requiredString(subject.title, "standalone bootstrap progress subject title"),
    }),
  });
}

export function validateStandaloneLifecycleTransitionCredential(
  value: unknown,
): StandaloneLifecycleTransitionCredential {
  const credential = requireRecord(value, "standalone lifecycle transition credential");
  requireKnownKeys(credential, ["fence", "id", "token"], "standalone lifecycle transition credential");
  if (!Number.isSafeInteger(credential.fence) || Number(credential.fence) < 1) {
    throw new StandaloneProtocolError("standalone lifecycle transition fence must be a positive integer");
  }
  return Object.freeze({
    fence: credential.fence as number,
    id: normalizeToken(credential.id, "standalone lifecycle transition id"),
    token: normalizeToken(credential.token, "standalone lifecycle transition token"),
  });
}

export function validateStandaloneBootstrapResult(
  value: unknown,
): StandaloneBootstrapResult {
  const result = requireRecord(value, "standalone bootstrap result");
  if (result.schemaVersion !== STANDALONE_BOOTSTRAP_RESULT_SCHEMA_VERSION) {
    throw new StandaloneProtocolError("standalone bootstrap result schemaVersion is unsupported");
  }
  if (result.outcome === "resolved") {
    requireKnownKeys(
      result,
      ["outcome", "resolution", "schemaVersion"],
      "standalone bootstrap result",
    );
    return Object.freeze({
      outcome: "resolved",
      resolution: validateStandaloneBootstrapResolution(result.resolution),
      schemaVersion: STANDALONE_BOOTSTRAP_RESULT_SCHEMA_VERSION,
    });
  }
  if (result.outcome !== "rejected") {
    throw new StandaloneProtocolError("standalone bootstrap result outcome is unsupported");
  }
  requireKnownKeys(
    result,
    ["error", "outcome", "schemaVersion"],
    "standalone bootstrap result",
  );
  const error = requireRecord(result.error, "standalone bootstrap error");
  requireKnownKeys(error, ["code", "message"], "standalone bootstrap error");
  if (!STANDALONE_BOOTSTRAP_ERROR_CODES.includes(error.code as StandaloneBootstrapErrorCode)) {
    throw new StandaloneProtocolError("standalone bootstrap error code is unsupported");
  }
  return Object.freeze({
    error: Object.freeze({
      code: error.code as StandaloneBootstrapErrorCode,
      message: requiredString(error.message, "standalone bootstrap error message"),
    }),
    outcome: "rejected",
    schemaVersion: STANDALONE_BOOTSTRAP_RESULT_SCHEMA_VERSION,
  });
}

export function digestStandaloneRuntimeDescriptor(value: unknown): StandaloneDigest {
  const descriptor = validateStandaloneRuntimeDescriptor(value);
  return `sha256:${createHash("sha256").update(descriptorJson(descriptor)).digest("hex")}`;
}

export function sameStandaloneHandoffScope(
  left: StandaloneHandoffScope,
  right: StandaloneHandoffScope,
): boolean {
  return (
    left.channel === right.channel
    && left.generation === right.generation
    && left.namespace === right.namespace
  );
}

export function sameStandaloneHandoffEnvelope(
  left: StandaloneHandoffEnvelope,
  right: StandaloneHandoffEnvelope,
): boolean {
  return (
    left.schemaVersion === right.schemaVersion
    && left.descriptorDigest === right.descriptorDigest
    && sameStandaloneHandoffScope(left.scope, right.scope)
  );
}

export function createStandaloneHandoffEnvelope(
  input: Readonly<{
    descriptor: StandaloneRuntimeDescriptor;
    scope: StandaloneHandoffScope;
  }>,
): StandaloneHandoffEnvelope {
  const descriptor = validateStandaloneRuntimeDescriptor(input.descriptor);
  return validateStandaloneHandoffEnvelope({
    descriptor,
    descriptorDigest: digestStandaloneRuntimeDescriptor(descriptor),
    schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
    scope: input.scope,
  });
}

export function validateStandaloneHandoffEnvelope(
  value: unknown,
  expected?: StandaloneHandoffEnvelope,
): StandaloneHandoffEnvelope {
  const envelope = requireRecord(value, "standalone handoff");
  if (envelope.schemaVersion !== STANDALONE_HANDOFF_SCHEMA_VERSION) {
    throw new StandaloneProtocolError(
      `unsupported standalone handoff schema version: ${String(envelope.schemaVersion)}`,
    );
  }
  const descriptor = validateStandaloneRuntimeDescriptor(envelope.descriptor);
  const descriptorDigest = normalizeDigest(envelope.descriptorDigest);
  if (descriptorDigest !== digestStandaloneRuntimeDescriptor(descriptor)) {
    throw new StandaloneProtocolError(
      "standalone descriptorDigest does not match the runtime descriptor",
    );
  }
  const normalized = {
    descriptor,
    descriptorDigest,
    schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
    scope: validateStandaloneHandoffScope(envelope.scope),
  } as const;
  if (
    expected != null
    && (
      !sameStandaloneHandoffEnvelope(normalized, expected)
    )
  ) {
    throw new StandaloneProtocolError(
      "standalone handoff does not match the active generation and descriptor",
    );
  }
  return normalized;
}

export function validateStandalonePaths(value: unknown): StandalonePaths {
  const paths = requireRecord(value, "standalone paths");
  return {
    cacheRoot: normalizePath(paths.cacheRoot, "standalone cacheRoot"),
    dataRoot: normalizePath(paths.dataRoot, "standalone dataRoot"),
    installationRoot: normalizePath(paths.installationRoot, "standalone installationRoot"),
    logsRoot: normalizePath(paths.logsRoot, "standalone logsRoot"),
    resourceRoot: normalizePath(paths.resourceRoot, "standalone resourceRoot"),
    runtimeRoot: normalizePath(paths.runtimeRoot, "standalone runtimeRoot"),
  };
}

export function validateStandaloneHandoffDescriptor(value: unknown): StandaloneHandoffDescriptor {
  const request = requireRecord(value, "standalone handoff descriptor");
  requireKnownKeys(
    request,
    ["attachment", "closure", "handoff", "paths", "transition"],
    "standalone handoff descriptor",
  );
  return {
    attachment: validateStandaloneAttachmentDescriptor(request.attachment),
    ...(request.closure == null ? {} : {
      closure: (() => {
        const closure = requireRecord(request.closure, "standalone Closure resource context");
        requireKnownKeys(
          closure,
          ["repositoryConfigPath", "storeRoot", "target"],
          "standalone Closure resource context",
        );
        return Object.freeze({
          repositoryConfigPath: normalizePath(
            closure.repositoryConfigPath,
            "standalone Closure repositoryConfigPath",
          ),
          storeRoot: normalizePath(closure.storeRoot, "standalone Closure storeRoot"),
          target: normalizeToken(closure.target, "standalone Closure target"),
        });
      })(),
    }),
    handoff: validateStandaloneHandoffEnvelope(request.handoff),
    paths: validateStandalonePaths(request.paths),
    transition: request.transition == null
      ? null
      : validateStandaloneLifecycleTransitionCredential(request.transition),
  };
}

export function validateStandaloneHandoffRequest(value: unknown): StandaloneHandoffRequest {
  const request = requireRecord(value, "standalone handoff request");
  requireKnownKeys(
    request,
    ["attachment", "capabilities", "closure", "handoff", "paths", "transition"],
    "standalone handoff request",
  );
  const descriptor = validateStandaloneHandoffDescriptor({
    attachment: request.attachment,
    closure: request.closure,
    handoff: request.handoff,
    paths: request.paths,
    transition: request.transition,
  });
  const capabilities = requireRecord(request.capabilities, "standalone shell capability port");
  if (typeof capabilities.invoke !== "function") {
    throw new StandaloneProtocolError("standalone shell capability port must expose invoke()");
  }
  return {
    ...descriptor,
    capabilities: request.capabilities as StandaloneShellCapabilityPort,
  };
}
