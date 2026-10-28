import type { ProjectShareHistoryResponse } from '@open-design/contracts';
import { hasEverShared } from '@open-design/contracts';
import { ensurePrivateVelaTeamProject } from './vela-cli-team-projects.js';
import type { PublicFilePublicationScope } from './public-file-publication-store.js';
import { readVelaControlApiContext } from '../integrations/vela.js';
import { fetchVelaWorkspaceDirectory } from './vela-workspace-context.js';
import { velaCommandFailureDetail } from './public-file-failure.js';
import { runPinnedVelaCommand } from './vela-pinned-command.js';
import { parseAmrShareLink, type AmrShareLink } from './public-share-viewer-url.js';

/** Project share history plus, per active publication, what AMR said about its
 * address. `amrLink` is daemon-internal: HTTP responses built from this state
 * present the link through the Viewer link rule instead of echoing it. */
export interface ProjectShareState extends ProjectShareHistoryResponse {
  publications: Array<ProjectShareHistoryResponse['publications'][number] & { amrLink?: AmrShareLink }>;
}
export type ReadProjectShareState = (scope: Omit<PublicFilePublicationScope, 'filePath'>) => Promise<ProjectShareState>;
export function createVelaProjectShareState(options: {
  dataRoot: string;
  configuredEnv?: Record<string, string> | (() => Record<string, string>);
  readSession?: typeof readVelaControlApiContext;
  fetchDirectory?: typeof fetchVelaWorkspaceDirectory;
  runCommand?: typeof runPinnedVelaCommand;
  /** Persisted local authorship, never inferred from the current reader. */
  resolveLocalProjectOwner?: (projectId: string, workspaceId: string) => string | null;
  /** Read-only status probes must never create a missing creator catalog row. */
  registerLocallyOwnedProject?: boolean;
}): ReadProjectShareState {
  return async scope => {
    const identity = Object.freeze({ ...scope });
    const configuredEnv = { ...(typeof options.configuredEnv === 'function' ? options.configuredEnv() : options.configuredEnv ?? {}) };
    const current = (options.readSession ?? readVelaControlApiContext)(process.env, configuredEnv);
    if (!current?.controlKey || !current.apiUrl || !options.dataRoot) throw new Error('SHARE_STATE_UNAVAILABLE');
    const session = Object.freeze({ ...current });
    const directory = await (options.fetchDirectory ?? fetchVelaWorkspaceDirectory)({ readSession: () => session });
    const workspace = directory.ok ? directory.items.find(item => item.workspaceId === identity.resourceTeamId
      && item.workspaceMemberId === identity.ownerMemberId && item.memberStatus === 'active'
      && item.lifecycleState === 'active') : undefined;
    if (!workspace) throw new Error('SHARE_STATE_UNAVAILABLE');
    // A locally owned project can lack a catalog before its first share in
    // either workspace type. Register proven authorship, never content or
    // sharing intent; omitted sync/version/metadata preserve existing state.
    if (options.registerLocallyOwnedProject !== false
      && options.resolveLocalProjectOwner?.(identity.projectId, identity.resourceTeamId) === identity.ownerMemberId) {
      // Ensure returns the retained root, including identities established by
      // earlier paired clients. Never replace it with a locally derived ID.
      await ensurePrivateVelaTeamProject(identity.projectId,
        { teamId: identity.resourceTeamId, memberId: identity.ownerMemberId,
          role: workspace.role, lifecycleState: workspace.lifecycleState },
        args => (options.runCommand ?? runPinnedVelaCommand)({
          args, session, workspaceId: identity.resourceTeamId, dataRoot: options.dataRoot, configuredEnv,
        }));
    }
    let output: string;
    try {
      output = await (options.runCommand ?? runPinnedVelaCommand)({
        args: ['share', 'project-status', identity.projectId, '--json'], session,
        workspaceId: identity.resourceTeamId, dataRoot: options.dataRoot, configuredEnv,
      });
    } catch (error) {
      // The CLI exits non-zero while its stdout still carries the structured
      // 404 body. A cloud "no share record" answer for this project is the
      // authoritative empty history — never-shared projects (including ones
      // created before workspace attribution began registering them) must
      // stay deletable instead of surfacing SHARE_STATE_UNAVAILABLE.
      if (!isShareNotFoundFailure(error)) throw error;
      return neverSharedProjectShareState(identity.projectId);
    }
    return parseProjectShareState(output, identity.projectId);
  };
}

/** The CLI reports a project with no cloud share record as a structured 404
 * ("errorCode":"share_not_found") — on stdout with a non-zero exit code, or,
 * if a future revision makes the command exit zero, as the parsed body. */
const SHARE_NOT_FOUND_ERROR_CODE = 'share_not_found';

function isShareNotFoundReply(value: unknown): boolean {
  return !!value && typeof value === 'object' && 'errorCode' in value
    && (value as { errorCode?: unknown }).errorCode === SHARE_NOT_FOUND_ERROR_CODE;
}

function isShareNotFoundFailure(error: unknown): boolean {
  // The pinned runner replaces CLI failures with a sanitized error that keeps
  // only classified tokens; the share_not_found verdict survives there, not in
  // the discarded stdout. Unsantized rejections (injected tests, alternative
  // runners) still fall back to inspecting the raw channels.
  const failure = velaCommandFailureDetail(error);
  if (failure) {
    return failure.reason === 'upstream_http' && failure.upstreamStatus === 404
      && failure.upstreamCode === SHARE_NOT_FOUND_ERROR_CODE;
  }
  const stdout = (error as { stdout?: unknown } | null | undefined)?.stdout;
  const stderr = (error as { stderr?: unknown } | null | undefined)?.stderr;
  return [stdout, stderr, error instanceof Error ? error.message : String(error)]
    .some(channel => typeof channel === 'string' && isShareNotFoundReply(safeJsonParse(channel)));
}

function safeJsonParse(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}

function neverSharedProjectShareState(projectId: string): ProjectShareState {
  return { projectId, bindingExists: false, hasEverShared: hasEverShared({ bindingExists: false }), publications: [] };
}

/** Missing/unauthorized/error replies never become an empty history — except
 * the explicit structured share_not_found 404, which IS the empty history. */
export function parseProjectShareState(output: string, projectId: string): ProjectShareState {
  let value: unknown;
  try { value = JSON.parse(output); }
  catch { throw new Error('SHARE_STATE_INVALID'); }
  if (isShareNotFoundReply(value)) return neverSharedProjectShareState(projectId);
  if (!value || typeof value !== 'object' || !('projectId' in value) || value.projectId !== projectId
    || !('bindingExists' in value) || typeof value.bindingExists !== 'boolean'
    || !('publications' in value) || !Array.isArray(value.publications)) throw new Error('SHARE_STATE_INVALID');
  const seen = new Set<string>();
  const publications = value.publications.map((item: unknown): ProjectShareState['publications'][number] => {
    if (!item || typeof item !== 'object' || !('sourceFilePath' in item) || typeof item.sourceFilePath !== 'string'
      || item.sourceFilePath.includes('\\') || item.sourceFilePath.includes('\0')
      || item.sourceFilePath.split('/').some(part => !part || part === '.' || part === '..')
      || !('slug' in item) || typeof item.slug !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.slug)
      || !('status' in item) || (item.status !== 'active' && item.status !== 'stopped')
      || ('sourceFileId' in item && (typeof item.sourceFileId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.sourceFileId)))
      || seen.has(item.slug)) throw new Error('SHARE_STATE_INVALID');
    seen.add(item.slug);
    // Only an active publication has an address; a stopped one carries none.
    const amrLink = item.status === 'active' ? parseAmrShareLink(item, projectId, item.slug) : null;
    return { sourceFilePath: item.sourceFilePath, ...('sourceFileId' in item ? { sourceFileId: item.sourceFileId as string } : {}), slug: item.slug, status: item.status, ...(amrLink ? { amrLink } : {}) };
  });
  if (value.bindingExists !== (publications.length > 0)) throw new Error('SHARE_STATE_INVALID');
  return { projectId, bindingExists: value.bindingExists, hasEverShared: hasEverShared({ bindingExists: value.bindingExists }), publications };
}

export class UnboundFileShareIdentityError extends Error {
  constructor() { super('SHARE_FILE_IDENTITY_UNAVAILABLE'); }
}

/** History contains retired aliases at reused paths. Only the current lifetime
 * may drive file status/resume; an unbound live share is neither absence nor
 * authority to infer/migrate its identity. Existing project history/stop stays usable. */
export function currentFileSharePublication(history: ProjectShareState, filePath: string, sourceFileId?: string) {
  if (sourceFileId && history.publications.some(item => item.sourceFilePath === filePath
    && item.sourceFileId === undefined && item.status === 'active')) throw new UnboundFileShareIdentityError();
  const matches = history.publications.filter(item => item.sourceFilePath === filePath
    && (sourceFileId ? item.sourceFileId === sourceFileId : item.sourceFileId === undefined));
  return matches.length === 1 ? matches[0] : undefined;
}
