import { randomUUID } from 'node:crypto';
import { load, type CheerioAPI } from 'cheerio';
import { Parser } from 'htmlparser2';
import {
  COMMENT_ID_ATTRIBUTE, isCommentUuid,
  type PrepareCommentIdentityRequest, type PrepareCommentIdentityResponse, type ProjectMetadata,
} from '@open-design/contracts';
import { readProjectFile, writeProjectFile } from '../projects.js';
import { withProjectFileVersionLock, readProjectFileVersion } from '../project-file-versions.js';
import { normalizeArtifactRuntimeImports } from '../artifacts/runtime-compat.js';

export class CommentPreparationError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 409) { super(message); }
}
const excluded = 'head,script,style,template,title,meta,link,base,noscript';
function validatedParsedIds($: CheerioAPI): Set<string> {
  const ids = new Set<string>();
  for (const node of $(`[${COMMENT_ID_ATTRIBUTE}]`).toArray()) {
    const id = $(node).attr(COMMENT_ID_ATTRIBUTE);
    if (!isCommentUuid(id) || ids.has(id)) {
      throw new CommentPreparationError('COMMENT_IDENTITY_INVALID', 'Malformed or duplicate comment identity');
    }
    ids.add(id);
  }
  return ids;
}
/** Mask only parse5-authored raw-text content in the secondary tokenizer input.
 * Original tags/attributes remain visible. Preserve UTF-16 length and CR/LF so
 * secondary token offsets still address the untouched source, including astral text.
 */
function authoredTokenizationInput(source: string, $: CheerioAPI): string {
  const ranges = $('script,style,title,textarea,xmp,iframe,noembed,noframes,noscript,plaintext').contents().toArray().flatMap((node) => {
    if (node.type !== 'text') return [];
    const location = (node as typeof node & { sourceCodeLocation?: { startOffset: number; endOffset: number } }).sourceCodeLocation;
    return location ? [location] : [];
  });
  const chunks: string[] = [];
  let cursor = 0;
  for (const range of ranges.sort((a, b) => a.startOffset - b.startOffset)) {
    if (range.endOffset <= cursor) continue;
    const start = Math.max(cursor, range.startOffset);
    // Deliberately no Unicode regex flag: each surrogate is one source code unit.
    chunks.push(source.slice(cursor, start), source.slice(start, range.endOffset).replace(/[^\r\n]/g, ' '));
    cursor = range.endOffset;
  }
  chunks.push(source.slice(cursor));
  return chunks.join('');
}

/** Validate every authored opening token, not only nodes surviving tree construction.
 * Public onattribute callbacks retain repetitions before attribute-map deduplication;
 * public name spans use HTML ASCII delimiters rather than JavaScript whitespace.
 */
function validatedAuthoredTags(source: string, $: CheerioAPI): { ids: Set<string>; nameEnds: Map<number, number> } {
  const ids = new Set<string>();
  const nameEnds = new Map<number, number>();
  let start = -1;
  let nameEnd = -1;
  let identitySeen = false;
  const parser = new Parser({
    onopentagname() {
      start = parser.startIndex;
      nameEnd = parser.endIndex;
      identitySeen = false;
    },
    onattribute(name, value) {
      if (name !== COMMENT_ID_ATTRIBUTE) return;
      if (identitySeen || !isCommentUuid(value) || ids.has(value)) {
        throw new CommentPreparationError('COMMENT_IDENTITY_INVALID', 'Malformed or duplicate authored comment identity');
      }
      identitySeen = true;
      ids.add(value);
    },
    onopentag(_name, _attributes, implied) {
      if (!implied) nameEnds.set(start, nameEnd);
    },
  }, { xmlMode: false, decodeEntities: true });
  // Filtering callbacks is too late: apparent tags would already change lexer
  // state and hide later real tags. Mask content before the tokenizer sees it.
  parser.end(authoredTokenizationInput(source, $));
  return { ids, nameEnds };
}

/** Insert attributes using parser source offsets: never serialize/reformat authored HTML.
 * Validate the whole authored document before indexing, including non-selectable nodes.
 */
export function prepareStaticCommentSource(source: string): { source: string; preparedTargets: number } {
  const $ = load(source, { sourceCodeLocationInfo: true });
  const authored = validatedAuthoredTags(source, $);
  const seen = new Set([...authored.ids, ...validatedParsedIds($)]);
  // parse5 exposes template content through a detached fragment; parentElement
  // traversal alone cannot identify that inert authored subtree.
  const excludedRanges = $(excluded).toArray().flatMap((node) => {
    const location = (node as typeof node & { sourceCodeLocation?: { startOffset: number; endOffset: number } }).sourceCodeLocation;
    return location ? [location] : [];
  });
  const insertions: number[] = [];
  let preparedTargets = 0;
  for (const node of $('*').toArray()) {
    const location = (node as typeof node & { sourceCodeLocation?: { startTag?: { startOffset: number; endOffset: number } } }).sourceCodeLocation;
    const start = location?.startTag;
    if (!start) continue; // synthetic html/body nodes are not source targets
    const id = $(node).attr(COMMENT_ID_ATTRIBUTE);
    if (('name' in node && (node.name === 'html' || node.name === 'body')) || $(node).is(excluded) ||
        excludedRanges.some((range) => start.startOffset >= range.startOffset && start.startOffset < range.endOffset)) continue;
    preparedTargets++;
    if (id === undefined) {
      // Insert after the tag name: a trailing slash in an unquoted value is
      // data, not necessarily self-closing syntax (<img src=a/> means src=a/).
      const nameEnd = authored.nameEnds.get(start.startOffset);
      if (nameEnd === undefined) throw new CommentPreparationError('COMMENT_SOURCE_INVALID', 'Source tag cannot be prepared');
      insertions.push(nameEnd);
    }
  }
  let prepared = source;
  for (const offset of insertions.sort((a, b) => b - a)) {
    let id: string;
    do { id = randomUUID(); } while (seen.has(id));
    seen.add(id);
    prepared = prepared.slice(0, offset) + ` ${COMMENT_ID_ATTRIBUTE}="${id}"` + prepared.slice(offset);
  }
  // HTML's adoption-agency algorithm can reconstruct a second DOM node from
  // one source tag. Never declare the result ready if that cloned an identity.
  if (prepared !== source) validatedParsedIds(load(prepared));
  return { source: prepared, preparedTargets };
}

/** Locally serialized preparation, NOT an atomic filesystem transaction or global CAS.
 * Saves participating in withProjectFileVersionLock serialize. External writers can race after any read; observed
 * changes are rejected, but no lock here can exclude an external OS writer.
 * Failure never rolls source back (a rollback could destroy a later edit).
 */
export async function prepareCommentIdentity(
  projectsRoot: string, projectId: string, fileName: string,
  request: PrepareCommentIdentityRequest, metadata?: ProjectMetadata,
  editingBusy: () => boolean = () => false,
): Promise<PrepareCommentIdentityResponse> {
  if (request?.editingSettled !== true || editingBusy()) {
    throw new CommentPreparationError('COMMENT_EDITING_UNSETTLED', 'Settle edits and generation before preparing');
  }
  if (typeof request.expectedSource !== 'string' || !/\.html?$/iu.test(fileName)) {
    throw new CommentPreparationError('BAD_REQUEST', 'HTML source expectation required', 400);
  }
  // Resolve canonical file name first so aliases use the same existing version lock.
  const initial = await readProjectFile(projectsRoot, projectId, fileName, metadata);
  return withProjectFileVersionLock(projectsRoot, projectId, initial.name, metadata, async (lock) => {
    const read = () => readProjectFile(projectsRoot, projectId, initial.name, metadata);
    const current = await read();
    if (editingBusy() || !current.buffer.equals(Buffer.from(request.expectedSource, 'utf8'))) {
      throw new CommentPreparationError('COMMENT_SOURCE_CONFLICT', 'Source changed; reload and explicitly retry');
    }
    const prepared = prepareStaticCommentSource(request.expectedSource);
    const changed = prepared.source !== request.expectedSource;
    const bytes = Buffer.from(prepared.source, 'utf8');
    const normalized = normalizeArtifactRuntimeImports(initial.name, bytes);
    if (!Buffer.isBuffer(normalized) || !normalized.equals(bytes)) {
      throw new CommentPreparationError('COMMENT_SOURCE_NORMALIZATION_REQUIRED', 'Save runtime import normalization before preparing');
    }
    const beforeWrite = await read();
    if (editingBusy() || !beforeWrite.buffer.equals(current.buffer)) {
      throw new CommentPreparationError('COMMENT_SOURCE_CONFLICT', 'Source changed during preparation');
    }
    if (changed) await writeProjectFile(projectsRoot, projectId, initial.name, bytes, {}, metadata);
    if (!(await read()).buffer.equals(bytes)) {
      throw new CommentPreparationError('COMMENT_SOURCE_CONFLICT', 'Source readback differs; source has not been rolled back');
    }
    const version = await lock.ensureCurrentVersion(prepared.source, {
      source: 'manual', promptSource: 'manual', label: 'Prepare comment identities',
    });
    if (!version) throw new CommentPreparationError('COMMENT_VERSION_UNCONFIRMED', 'Prepared source version could not be confirmed', 500);
    const saved = await readProjectFileVersion(projectsRoot, projectId, initial.name, version.id, metadata);
    if (saved.content !== prepared.source || !(await read()).buffer.equals(bytes)) {
      throw new CommentPreparationError('COMMENT_SOURCE_CONFLICT', 'Source/version readback changed; explicitly retry');
    }
    return { ...prepared, changed, version };
  });
}
