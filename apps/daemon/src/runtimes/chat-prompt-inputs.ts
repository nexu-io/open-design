import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  renderCodexImagegenOverride,
  resolveCodexImagegenModelId,
  shouldRenderCodexImagegenOverride,
} from '../prompts/system.js';
import { renderResearchCommandContract } from '../prompts/research-contract.js';

export const MAX_CHAT_IMAGE_BYTES = 1024 * 1024;
export const UPLOAD_DIR = path.join(os.tmpdir(), 'od-uploads');
type CodexImagegenProjectMetadata = Parameters<typeof resolveCodexImagegenModelId>[0];
type InputValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | InputRecord
  | readonly InputValue[];
type InputRecord = { [key: string]: InputValue };
type MediaExecutionLike = {
  mode?: string | null;
  allowedSurfaces?: readonly string[] | null;
  allowedModels?: readonly string[] | null;
};
type PreviewCommentImageAttachmentInput = {
  path?: InputValue;
  name?: InputValue;
};
type CommentAttachmentPodMemberInput = {
  elementId?: InputValue;
  selector?: InputValue;
  label?: InputValue;
  text?: InputValue;
  position?: InputValue;
  htmlHint?: InputValue;
  style?: InputValue;
};
type CommentAttachmentInput = {
  id?: InputValue;
  order?: InputValue;
  filePath?: InputValue;
  elementId?: InputValue;
  selector?: InputValue;
  label?: InputValue;
  screenshotPath?: InputValue;
  markKind?: InputValue;
  intent?: InputValue;
  imageAttachments?: readonly PreviewCommentImageAttachmentInput[] | null;
  commentContext?: InputValue;
  comment?: InputValue;
  selectionKind?: InputValue;
  podMembers?: readonly CommentAttachmentPodMemberInput[] | null;
  memberCount?: InputValue;
  currentText?: InputValue;
  pagePosition?: InputValue;
  htmlHint?: InputValue;
  style?: InputValue;
  source?: InputValue;
};

export function composeLiveInstructionPrompt({
  daemonSystemPrompt,
  runtimeToolPrompt,
  clientSystemPrompt,
  finalPromptOverride,
}: {
  daemonSystemPrompt?: string | null;
  runtimeToolPrompt?: string | null;
  clientSystemPrompt?: string | null;
  finalPromptOverride?: string | null;
}) {
  const override =
    typeof finalPromptOverride === 'string'
      ? finalPromptOverride.trim()
      : '';
  const parts = [daemonSystemPrompt, runtimeToolPrompt, clientSystemPrompt]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .map((part) =>
      override && part.includes(override)
        ? part.split(override).join('').trim()
        : part,
    )
    .filter(Boolean);
  if (override) {
    parts.push(override);
  }
  return parts.join('\n\n---\n\n');
}

export function resolveResearchCommandContract(
  research: { enabled?: boolean; query?: string; maxSources?: number } | null | undefined,
  message: string,
) {
  if (!research || !research.enabled) return '';
  const researchQuery =
    typeof research.query === 'string' && research.query.trim()
      ? research.query
      : message;
  return renderResearchCommandContract({
    query: researchQuery,
    ...(typeof research.maxSources === 'number'
      ? { maxSources: research.maxSources }
      : {}),
  });
}

export function resolveCodexGeneratedImagesDir(
  agentId: string | null | undefined,
  metadata: CodexImagegenProjectMetadata,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  homeDir = os.homedir(),
  mediaExecution: MediaExecutionLike | null | undefined = undefined,
) {
  if (!shouldAllowCodexImagegenForMediaPolicy(metadata, mediaExecution)) return null;
  if (!shouldRenderCodexImagegenOverride(agentId, metadata)) return null;
  const rawCodexHome =
    typeof env?.CODEX_HOME === 'string' && env.CODEX_HOME.trim().length > 0
      ? env.CODEX_HOME.trim()
      : path.join(homeDir, '.codex');
  const codexHome = rawCodexHome.startsWith('~/')
    ? path.join(homeDir, rawCodexHome.slice(2))
    : rawCodexHome;
  return path.resolve(codexHome, 'generated_images');
}

type DirectoryStat = {
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
};

type CodexGeneratedImagesDirValidationOptions = {
  protectedDirs?: Array<string | null | undefined>;
  mkdirSync?: (target: string, options: { recursive: true }) => string | undefined | void;
  lstatSync?: (target: string) => DirectoryStat;
  statSync?: (target: string) => DirectoryStat;
  realpathSync?: (target: string) => string;
  warn?: (message: string) => void;
};

function isMissingPathError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    err.code === 'ENOENT'
  );
}

function collectProtectedDirRoots(
  protectedDirs: Array<string | null | undefined>,
  {
    realpathSync,
    statSync,
  }: {
    realpathSync: (target: string) => string;
    statSync: (target: string) => DirectoryStat;
  },
): string[] {
  const roots: string[] = [];
  for (const raw of Array.isArray(protectedDirs) ? protectedDirs : []) {
    if (typeof raw !== 'string' || raw.trim().length === 0) continue;
    const resolved = path.resolve(raw);
    roots.push(resolved);
    try {
      const canonical = realpathSync(resolved);
      try {
        if (statSync(canonical).isDirectory()) roots.push(canonical);
      } catch {
        roots.push(canonical);
      }
    } catch {
      // A missing protected root cannot be the canonical target of a symlink.
    }
  }
  return Array.from(new Set(roots));
}

function findContainingProtectedRoot(
  candidate: string,
  protectedRoots: string[],
): string | null {
  return protectedRoots.find((root) => isPathWithin(root, candidate)) ?? null;
}

export function validateCodexGeneratedImagesDir(
  codexGeneratedImagesDir: string | null | undefined,
  {
    protectedDirs = [],
    mkdirSync = fs.mkdirSync,
    lstatSync = fs.lstatSync,
    statSync = fs.statSync,
    realpathSync = fs.realpathSync.native,
    warn = console.warn,
  }: CodexGeneratedImagesDirValidationOptions = {},
): string | null {
  if (
    typeof codexGeneratedImagesDir !== 'string' ||
    codexGeneratedImagesDir.trim().length === 0
  ) {
    return null;
  }

  const resolved = path.resolve(codexGeneratedImagesDir);
  const protectedRoots = collectProtectedDirRoots(protectedDirs, {
    realpathSync,
    statSync,
  });
  const warnSkipped = (reason: string) =>
    warn(`[od] codex generated_images allowlist skipped: ${reason}`);

  const protectedRoot = findContainingProtectedRoot(resolved, protectedRoots);
  if (protectedRoot) {
    warnSkipped(`${resolved} is inside protected root ${protectedRoot}`);
    return null;
  }

  try {
    let existingTargetStat: DirectoryStat | null = null;
    try {
      existingTargetStat = lstatSync(resolved);
    } catch (err) {
      if (!isMissingPathError(err)) throw err;
    }
    if (existingTargetStat?.isSymbolicLink()) {
      warnSkipped(`${resolved} is a symlink`);
      return null;
    }
    if (existingTargetStat && !existingTargetStat.isDirectory()) {
      warnSkipped(`${resolved} is not a directory`);
      return null;
    }

    const parent = path.dirname(resolved);
    const protectedParentRoot = findContainingProtectedRoot(
      parent,
      protectedRoots,
    );
    if (protectedParentRoot) {
      warnSkipped(`${parent} is inside protected root ${protectedParentRoot}`);
      return null;
    }

    mkdirSync(parent, { recursive: true });
    const canonicalParent = realpathSync(parent);
    const canonicalCandidate = path.join(
      canonicalParent,
      path.basename(resolved),
    );
    const protectedCanonicalParentRoot = findContainingProtectedRoot(
      canonicalCandidate,
      protectedRoots,
    );
    if (protectedCanonicalParentRoot) {
      warnSkipped(
        `${canonicalCandidate} resolves inside protected root ${protectedCanonicalParentRoot}`,
      );
      return null;
    }

    mkdirSync(resolved, { recursive: true });
    if (lstatSync(resolved).isSymbolicLink()) {
      warnSkipped(`${resolved} is a symlink`);
      return null;
    }
    if (!statSync(resolved).isDirectory()) {
      warnSkipped(`${resolved} is not a directory`);
      return null;
    }
    const canonicalDir = realpathSync(resolved);
    const protectedCanonicalRoot = findContainingProtectedRoot(
      canonicalDir,
      protectedRoots,
    );
    if (protectedCanonicalRoot) {
      warnSkipped(
        `${canonicalDir} resolves inside protected root ${protectedCanonicalRoot}`,
      );
      return null;
    }

    return canonicalDir;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err ?? 'unknown error');
    warn(`[od] codex generated_images allowlist mkdir failed: ${message}`);
    return null;
  }
}

export function resolveChatExtraAllowedDirs({
  agentId,
  skillsDir,
  designSystemsDir,
  linkedDirs = [],
  codexGeneratedImagesDir,
  existsSync = fs.existsSync,
}: {
  agentId?: string | null;
  skillsDir?: string | null;
  designSystemsDir?: string | null;
  linkedDirs?: Array<string | null | undefined>;
  codexGeneratedImagesDir?: string | null;
  existsSync?: (path: string) => boolean;
}): string[] {
  const isCodex =
    typeof agentId === 'string' && agentId.trim().toLowerCase() === 'codex';
  const candidates = isCodex
    ? [codexGeneratedImagesDir]
    : [
        skillsDir,
        designSystemsDir,
        ...(Array.isArray(linkedDirs) ? linkedDirs : []),
      ];
  return Array.from(
    new Set(
      candidates.filter(
        (d): d is string =>
          typeof d === 'string' && d.length > 0 && existsSync(d),
      ),
    ),
  );
}

export type DesignSystemSelectionSource =
  | 'request'
  | 'plugin'
  | 'project'
  | 'app-default'
  | 'none';

function normalizedDesignSystemId(value: InputValue): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

export function resolveEffectiveDesignSystemSelection({
  requestDesignSystemId,
  pluginDesignSystemId,
  projectDesignSystemId,
  appDefaultDesignSystemId,
  allowAppDefault = true,
}: {
  requestDesignSystemId?: InputValue;
  pluginDesignSystemId?: InputValue;
  projectDesignSystemId?: InputValue;
  appDefaultDesignSystemId?: InputValue;
  allowAppDefault?: boolean;
}): { id: string | null; source: DesignSystemSelectionSource } {
  const requestId = normalizedDesignSystemId(requestDesignSystemId);
  if (requestId) return { id: requestId, source: 'request' };

  const pluginId = normalizedDesignSystemId(pluginDesignSystemId);
  if (pluginId) return { id: pluginId, source: 'plugin' };

  const projectId = normalizedDesignSystemId(projectDesignSystemId);
  if (projectId) return { id: projectId, source: 'project' };

  if (allowAppDefault) {
    const appDefaultId = normalizedDesignSystemId(appDefaultDesignSystemId);
    if (appDefaultId) return { id: appDefaultId, source: 'app-default' };
  }

  return { id: null, source: 'none' };
}

export function designSystemIdFromPluginSnapshot(snapshot: InputValue): string | null {
  if (!isInputRecord(snapshot)) return null;
  const resolvedContext = snapshot.resolvedContext;
  if (!isInputRecord(resolvedContext)) return null;
  const items = resolvedContext.items;
  if (!Array.isArray(items)) return null;
  const designSystemItems = items.filter((item): item is InputRecord => (
    isInputRecord(item) && item.kind === 'design-system'
  ));
  const primary = designSystemItems.find((item) => item.primary === true);
  return normalizedDesignSystemId(primary?.id ?? designSystemItems[0]?.id);
}

export type StablePromptCacheMissReason =
  | 'new-session'
  | 'missing-stored-hash'
  | 'stable-prompt-changed'
  | null;

export function describeStablePromptCache({
  isResuming,
  storedStablePromptHash,
  currentStableHash,
}: {
  isResuming: boolean;
  storedStablePromptHash: string | null;
  currentStableHash: string;
}): {
  stablePromptHash: string;
  hit: boolean;
  missReason: StablePromptCacheMissReason;
} {
  if (!isResuming) {
    return {
      stablePromptHash: currentStableHash,
      hit: false,
      missReason: 'new-session',
    };
  }
  if (storedStablePromptHash === currentStableHash) {
    return {
      stablePromptHash: currentStableHash,
      hit: true,
      missReason: null,
    };
  }
  return {
    stablePromptHash: currentStableHash,
    hit: false,
    missReason: storedStablePromptHash === null
      ? 'missing-stored-hash'
      : 'stable-prompt-changed',
  };
}

export function resolveGrantedCodexImagegenOverride({
  agentId,
  metadata,
  codexGeneratedImagesDir,
  extraAllowedDirs = [],
  mediaExecution,
}: {
  agentId?: string | null;
  metadata?: CodexImagegenProjectMetadata;
  codexGeneratedImagesDir?: string | null;
  extraAllowedDirs?: string[];
  mediaExecution?: MediaExecutionLike | null;
}): string | null {
  if (!shouldAllowCodexImagegenForMediaPolicy(metadata, mediaExecution)) {
    return null;
  }
  if (
    typeof codexGeneratedImagesDir !== 'string' ||
    codexGeneratedImagesDir.length === 0 ||
    !Array.isArray(extraAllowedDirs) ||
    !extraAllowedDirs.includes(codexGeneratedImagesDir)
  ) {
    return null;
  }
  return renderCodexImagegenOverride(agentId, metadata);
}

function shouldAllowCodexImagegenForMediaPolicy(
  metadata: CodexImagegenProjectMetadata,
  mediaExecution: MediaExecutionLike | null | undefined,
) {
  const mode = mediaExecution?.mode ?? 'enabled';
  if (mode !== 'enabled') return false;
  if (
    Array.isArray(mediaExecution?.allowedSurfaces) &&
    mediaExecution.allowedSurfaces.length > 0 &&
    !mediaExecution.allowedSurfaces.includes('image')
  ) {
    return false;
  }
  const model = resolveCodexImagegenModelId(metadata);
  if (
    model &&
    Array.isArray(mediaExecution?.allowedModels) &&
    mediaExecution.allowedModels.length > 0 &&
    !mediaExecution.allowedModels.includes(model)
  ) {
    return false;
  }
  return true;
}

export function normalizeCommentAttachments(input: readonly CommentAttachmentInput[] | null | undefined) {
  if (!Array.isArray(input)) return [];
  return input
    .map((raw, index) => {
      if (!raw || typeof raw !== 'object') return null;
      const record = raw;
      const filePath = cleanString(record.filePath);
      const elementId = cleanString(record.elementId);
      const selector = cleanString(record.selector);
      const label = cleanString(record.label);
      const screenshotPath = cleanString(record.screenshotPath);
      const markKind = normalizeVisualMarkKind(record.markKind);
      const intent = compactString(record.intent, 220);
      const imageAttachments = normalizePreviewCommentImageAttachments(record.imageAttachments);
      const commentContext = record.commentContext === 'query' ? 'query' : 'context';
      const comment = commentContext === 'query'
        ? ''
        : cleanString(record.comment) || intent || imageOnlyCommentFallback(imageAttachments.length);
      const selectionKind =
        record.selectionKind === 'visual' ? 'visual' : record.selectionKind === 'pod' ? 'pod' : 'element';
      if (!filePath || !elementId) return null;
      if (selectionKind !== 'visual' && !selector) return null;
      if (selectionKind === 'visual' && !screenshotPath) return null;
      const podMembers = selectionKind === 'pod' ? normalizeAttachmentPodMembers(record.podMembers) : [];
      const memberCount =
        selectionKind === 'pod'
          ? (podMembers.length > 0
              ? podMembers.length
              : isFiniteNumber(record.memberCount)
                ? Math.max(0, Math.round(record.memberCount))
                : 0)
          : 0;
      return {
        id: cleanString(record.id) || `comment-${index + 1}`,
        order: isFiniteNumber(record.order)
          ? Math.max(1, Math.round(record.order))
          : index + 1,
        filePath,
        elementId,
        selector,
        label,
        comment,
        currentText: compactString(record.currentText, 160),
        pagePosition: normalizeAttachmentPosition(record.pagePosition),
        htmlHint: compactString(record.htmlHint, 180),
        style: normalizeAnnotationStyle(record.style),
        selectionKind,
        memberCount,
        podMembers,
        screenshotPath: selectionKind === 'visual' ? screenshotPath : undefined,
        markKind: selectionKind === 'visual' ? markKind : undefined,
        intent: selectionKind === 'visual'
          ? intent || visualAnnotationIntent(markKind)
          : undefined,
        imageAttachments: imageAttachments.length > 0 ? imageAttachments : undefined,
        commentContext,
        source: record.source === 'board-batch' ? 'board-batch' : 'saved-comment',
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => a.order - b.order);
}

export function renderCommentAttachmentHint(
  commentAttachments: ReturnType<typeof normalizeCommentAttachments>,
) {
  if (!commentAttachments.length) return '';
  const lines = [
    '',
    '',
    '<attached-preview-comments>',
    "Hard scope: change ONLY the elements identified below by selector / position / pod members. Do NOT modify sibling sub-pages, parent layout, global CSS, design tokens, or unrelated rules even if you notice issues there — surface those as a follow-up note in your reply instead of editing them. If the user's request cannot be satisfied without touching outside this scope, ask the user before proceeding. For visual marks, inspect the screenshot and modify the marked region first.",
  ];
  for (const item of commentAttachments) {
    const targetKind =
      item.selectionKind === 'visual' ? 'visual' : item.selectionKind === 'pod' ? 'pod' : 'element';
    lines.push(
      '',
      `${item.order}. ${item.elementId}`,
      `targetKind: ${targetKind}`,
      `file: ${item.filePath}`,
      `label: ${item.label || '(unlabeled)'}`,
      `position: ${formatAttachmentPosition(item.pagePosition)}`,
      `currentText: ${item.currentText || '(empty)'}`,
      `htmlHint: ${item.htmlHint || '(none)'}`,
      `computedStyle: ${formatAnnotationStyle(item.style) || '(none)'}`,
    );
    if (item.comment && item.commentContext !== 'query') {
      lines.push(`comment: ${item.comment}`);
    }
    if (targetKind === 'visual') {
      lines.push(
        `screenshot: ${item.screenshotPath}`,
        `markKind: ${item.markKind || 'stroke'}`,
        `intent: ${item.intent || visualAnnotationIntent(item.markKind || 'stroke')}`,
      );
      if (item.selector) lines.push(`selector: ${item.selector}`);
    } else {
      lines.splice(lines.length - 4, 0, `selector: ${item.selector}`);
    }
    if (targetKind === 'pod') {
      lines.push(`memberCount: ${item.memberCount || item.podMembers.length || 0}`);
      item.podMembers.slice(0, 8).forEach((member, memberIndex) => {
        lines.push(
          `member.${memberIndex + 1}: ${member.elementId} | ${member.label || '(unlabeled)'} | ${member.selector}`,
        );
        const memberStyle = formatAnnotationStyle(member.style);
        if (memberStyle) lines.push(`member.${memberIndex + 1}.computedStyle: ${memberStyle}`);
      });
    }
    const imageAttachments = normalizePreviewCommentImageAttachments(item.imageAttachments);
    if (imageAttachments.length > 0) {
      lines.push(`imageAttachments: ${imageAttachments.length}`);
      imageAttachments.forEach((attachment, attachmentIndex) => {
        lines.push(`image.${attachmentIndex + 1}: ${attachment.path} | ${attachment.name}`);
      });
    }
  }
  lines.push('</attached-preview-comments>');
  return lines.join('\n');
}

function cleanString(value: InputValue) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePreviewCommentImageAttachments(
  input: readonly PreviewCommentImageAttachmentInput[] | null | undefined,
) {
  if (!Array.isArray(input)) return [];
  const out: Array<{ path: string; name: string }> = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const record = item;
    const imagePath = cleanString(record.path);
    if (!imagePath || seen.has(imagePath)) continue;
    seen.add(imagePath);
    const name = cleanString(record.name) || imagePath.split('/').pop() || imagePath;
    out.push({ path: imagePath, name });
    if (out.length >= 20) break;
  }
  return out;
}

function imageOnlyCommentFallback(count: number) {
  if (count <= 0) return '';
  return count > 1
    ? `Use the ${count} attached images as the comment reference.`
    : 'Use the attached image as the comment reference.';
}

function normalizeVisualMarkKind(value: InputValue) {
  return value === 'click' || value === 'click+stroke' || value === 'stroke'
    ? value
    : 'stroke';
}

function visualAnnotationIntent(markKind: InputValue) {
  if (markKind === 'click') {
    return 'The screenshot has a blue focus box around the picked element; modify that picked part first.';
  }
  if (markKind === 'click+stroke') {
    return 'The screenshot has a blue focus box and red strokes; together they identify the part the user wants changed.';
  }
  return 'The screenshot has red strokes that identify the visual region the user wants changed.';
}

function compactString(value: InputValue, max: number) {
  const text = cleanString(value).replace(/\s+/g, ' ');
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function normalizeAttachmentPosition(input: InputValue) {
  const value = isInputRecord(input) ? input : {};
  return {
    x: finiteAttachmentNumber(value.x),
    y: finiteAttachmentNumber(value.y),
    width: finiteAttachmentNumber(value.width),
    height: finiteAttachmentNumber(value.height),
  };
}

function normalizeAttachmentPodMembers(input: readonly CommentAttachmentPodMemberInput[] | null | undefined) {
  if (!Array.isArray(input)) return [];
  return input
    .map((member) => {
      if (!member || typeof member !== 'object') return null;
      const record = member;
      const elementId = cleanString(record.elementId);
      const selector = cleanString(record.selector);
      const label = cleanString(record.label);
      if (!elementId || !selector) return null;
      return {
        elementId,
        selector,
        label,
        text: compactString(record.text, 160),
        position: normalizeAttachmentPosition(record.position),
        htmlHint: compactString(record.htmlHint, 180),
        style: normalizeAnnotationStyle(record.style),
      };
    })
    .filter((member): member is NonNullable<typeof member> => Boolean(member));
}

function normalizeAnnotationStyle(input: InputValue) {
  if (!isInputRecord(input)) return undefined;
  const record = input;
  const style: Record<string, string> = {};
  for (const key of ANNOTATION_STYLE_KEYS) {
    const value = record[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (trimmed) style[key] = trimmed.slice(0, 120);
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

function formatAnnotationStyle(style: Record<string, string> | undefined) {
  if (!style || typeof style !== 'object') return '';
  return ANNOTATION_STYLE_KEYS
    .map((key) => {
      const value = style[key];
      return value ? `${key}: ${value}` : null;
    })
    .filter(Boolean)
    .join('; ');
}

const ANNOTATION_STYLE_KEYS = [
  'color',
  'backgroundColor',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'textAlign',
  'fontFamily',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderRadius',
];

function finiteAttachmentNumber(value: InputValue) {
  return isFiniteNumber(value) ? Math.round(value) : 0;
}

function isFiniteNumber(value: InputValue): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isInputRecord(value: InputValue): value is InputRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const DESIGN_FILES_HINT_FOLDER_LIMIT = 40;
const DESIGN_FILES_HINT_FILE_LIMIT = 80;
type DesignFilesHintEntry = {
  name?: string;
  path?: string;
  kind?: string;
  type?: string;
  size?: number;
};

function formatAttachmentPosition(position: { x: number; y: number; width: number; height: number }) {
  return `x=${position.x}, y=${position.y}, width=${position.width}, height=${position.height}`;
}

function isPathWithin(base: string, target: string) {
  const relativePath = path.relative(path.resolve(base), path.resolve(target));
  return (
    relativePath === '' ||
    (relativePath.length > 0 &&
      !relativePath.startsWith('..') &&
      !path.isAbsolute(relativePath))
  );
}

export function resolveSafeProjectAttachments(
  cwd: string | null | undefined,
  attachments: readonly string[] | null | undefined,
  opts: {
    pathImpl?: typeof path;
    existsSync?: (path: string) => boolean;
  } = {},
) {
  if (!cwd || !Array.isArray(attachments)) return [];
  const pathImpl = opts.pathImpl ?? path;
  const existsSync = opts.existsSync ?? fs.existsSync;
  const root = pathImpl.resolve(cwd);
  const out: string[] = [];

  for (const attachment of attachments) {
    if (typeof attachment !== 'string' || attachment.length === 0) continue;
    try {
      const abs = pathImpl.resolve(root, attachment);
      const relativePath = pathImpl.relative(root, abs);
      const withinRoot =
        relativePath === '' ||
        (relativePath.length > 0 &&
          !relativePath.startsWith('..') &&
          !pathImpl.isAbsolute(relativePath));
      if (withinRoot && existsSync(abs)) out.push(attachment);
    } catch {
      // Drop malformed paths; attachments are advisory prompt context.
    }
  }

  return out;
}

export function formatProjectAttachmentHint(attachments: readonly string[] | null | undefined) {
  if (!Array.isArray(attachments) || attachments.length === 0) return '';
  return [
    '',
    '',
    'Attached project files in user-visible order:',
    ...attachments.map((p, index) => `${index + 1}. \`${p}\``),
    '',
    'When the user says "first attachment", "second file", or similar, map those references to the numbered list above.',
  ].join('\n');
}

function formatProjectEntrySize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size < 1024) return `${Math.round(size)} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDesignFilesEntryLine(entry: DesignFilesHintEntry | null | undefined, fallbackKind?: string) {
  const entryPath =
    typeof entry?.path === 'string' && entry.path
      ? entry.path
      : typeof entry?.name === 'string'
        ? entry.name
        : '';
  if (!entry || !entryPath) return null;
  const kind = fallbackKind || entry.kind || entry.type || 'file';
  const size = kind === 'folder' ? '' : formatProjectEntrySize(Number(entry.size));
  return `- \`${entryPath}\` (${[kind, size].filter(Boolean).join(', ')})`;
}

export function formatDesignFilesWorkspaceHint(
  cwd: string | null | undefined,
  files: DesignFilesHintEntry[] = [],
  folders: DesignFilesHintEntry[] = [],
) {
  if (typeof cwd !== 'string' || cwd.trim().length === 0) return '';
  const safeFolders = Array.isArray(folders) ? folders : [];
  const safeFiles = Array.isArray(files) ? files : [];
  const folderLines = safeFolders
    .slice(0, DESIGN_FILES_HINT_FOLDER_LIMIT)
    .map((folder) => formatDesignFilesEntryLine(folder, 'folder'))
    .filter((line): line is string => Boolean(line));
  const fileLines = safeFiles
    .slice(0, DESIGN_FILES_HINT_FILE_LIMIT)
    .map((file) => formatDesignFilesEntryLine(file, file.kind || 'file'))
    .filter((line): line is string => Boolean(line));
  const totalFolders = safeFolders.length;
  const totalFiles = safeFiles.length;
  const omittedFolders = Math.max(0, totalFolders - folderLines.length);
  const omittedFiles = Math.max(0, totalFiles - fileLines.length);

  const lines = [
    '',
    '',
    '## Design Files workspace',
    `The Design Files panel is backed by your current working directory: \`${cwd}\`. Write project files relative to this directory (for example \`index.html\` or \`assets/x.png\`). The user can browse these files in real time.`,
    'The selected/attached files for a turn are only a shortcut for priority and ordering. If the user did not attach any file, do not assume there are no relevant Design Files.',
    'When the request refers to existing files, asks you to choose a file, says "current", "this design", "the deck", "the image", "the folder", or depends on project state, inspect/search/read this workspace before answering or editing. Prefer project-relative paths, use the active workspace context as the default target, and ask only if multiple plausible targets remain after inspection.',
    'For non-trivial inspection or edits, surface progress through visible planning/status/tool events instead of silently guessing.',
    '',
    `Current Design Files snapshot: ${totalFolders} folder${totalFolders === 1 ? '' : 's'}, ${totalFiles} file${totalFiles === 1 ? '' : 's'}.`,
  ];

  if (folderLines.length > 0) {
    lines.push('', 'Folders:', ...folderLines);
    if (omittedFolders > 0) lines.push(`- ... ${omittedFolders} more folder${omittedFolders === 1 ? '' : 's'} omitted`);
  }

  if (fileLines.length > 0) {
    lines.push('', 'Files:', ...fileLines);
    if (omittedFiles > 0) lines.push(`- ... ${omittedFiles} more file${omittedFiles === 1 ? '' : 's'} omitted`);
  }

  if (folderLines.length === 0 && fileLines.length === 0) {
    lines.push('', 'No user-visible Design Files exist yet. Create clear project-relative files when the task requires output.');
  }

  return lines.join('\n');
}

export function resolveSafePromptImagePaths(
  imagePaths: readonly string[] | null | undefined,
  opts: {
    pathImpl?: typeof path;
    existsSync?: (path: string) => boolean;
    statSync?: (path: string) => { isFile(): boolean; size?: number };
    uploadDir?: string;
    maxBytes?: number;
  } = {},
) {
  if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
    return { safeImages: [], oversizedImages: [], failedImages: [] };
  }
  const pathImpl = opts.pathImpl ?? path;
  const existsSync = opts.existsSync ?? fs.existsSync;
  const statSync = opts.statSync ?? fs.statSync;
  const uploadDir = pathImpl.resolve(opts.uploadDir ?? UPLOAD_DIR);
  const maxBytes = Number.isFinite(opts.maxBytes)
    ? Number(opts.maxBytes)
    : MAX_CHAT_IMAGE_BYTES;
  const safeImages: string[] = [];
  const oversizedImages: Array<{ path: string; sizeBytes: number }> = [];
  const failedImages: Array<{ path: string; error: string }> = [];

  for (const inputPath of imagePaths) {
    if (typeof inputPath !== 'string' || inputPath.length === 0) continue;
    let resolved;
    try {
      resolved = pathImpl.resolve(inputPath);
    } catch {
      // Drop malformed path input; we cannot even resolve it to a location.
      continue;
    }
    if (!isPathWithin(uploadDir, resolved) || !existsSync(resolved)) continue;
    // Past the within-UPLOAD_DIR + existence gate the path points at a real
    // upload. A statSync failure here (EACCES/EPERM, a file that vanished
    // mid-run) is an infrastructure error, not bad input — surface it so the
    // run fails loudly instead of silently dropping required prompt context.
    let stat;
    try {
      stat = statSync(resolved);
    } catch (err) {
      failedImages.push({
        path: inputPath,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    if (!stat.isFile()) continue;
    if (typeof stat.size === 'number' && stat.size > maxBytes) {
      oversizedImages.push({ path: inputPath, sizeBytes: stat.size });
      continue;
    }
    safeImages.push(inputPath);
  }

  return { safeImages, oversizedImages, failedImages };
}

export function selectPromptImagePaths(
  agentId: string | null | undefined,
  safeImages: string[],
  amrStagedImages: string[],
) {
  return agentId === 'amr' ? amrStagedImages : safeImages;
}
