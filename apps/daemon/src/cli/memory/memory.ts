// @ts-nocheck
/** @module cli/memory/memory
 * Implements the od memory command dispatcher for user memory management (tree, profile, rule, verify, config).
 * Memory is the daemon's personal knowledge store (user profile, rules, verified artifacts, settings).
 * Collaborators: cliDaemonBaseUrl from core; fetch-based HTTP (GET/POST/PATCH/DELETE).
 */
import { cliDaemonBaseUrl, parseFlags, readMemoryBodyFromFlags, structuredHttpFailure, surfaceFetchError } from '../core/index.js';

/**
 * @internal Whitelist of string flags for memory subcommands.
 * Includes --field (repeatable, scanned manually), --prompt-file (for long-form input), and structured fields for rules/profile.
 */
const MEMORY_STRING_FLAGS = new Set([
  'daemon-url', 'name', 'description', 'type', 'body', 'body-file',
  // `od memory profile set` reads structured fields verbatim and/or a prose
  // body; `--field "Label=Value"` is repeatable (scanned manually below since
  // parseFlags collapses duplicate keys). `--prompt-file <path|->` mirrors the
  // long-prose embeddability contract used by `od automation`/`od brand`.
  'field', 'prompt-file', 'assertion', 'check', 'rationale',
  // `od memory rule suggest` distils annotations into rule proposals: a single
  // `--note` plus optional target context, or a `--prompt-file` carrying a JSON
  // array of annotations / newline-separated notes.
  'note', 'target', 'file', 'current-text',
  // `od memory config` toggles accept true|false values (string, not boolean)
  // so an agent can set OR clear a hook in one shape: `--profile false`.
  'enabled', 'profile', 'rewrite', 'verify', 'extraction',
]);

/**
 * @internal Whitelist of boolean flags (--help, --json).
 */
const MEMORY_BOOLEAN_FLAGS = new Set([
  'help', 'h', 'json',
]);

/**
 * @internal Prints full help for all od memory subcommands.
 */
function printMemoryHelp() {
  console.log(`Usage:
  od memory tree list [--json]
      List derived memory-tree folders and entry nodes.

  od memory tree view <id> [--json]
      Print one folder node or entry body.

  od memory tree edit <id> [--name <title>] [--description <text>]
                       [--type user|feedback|project|reference]
                       [--body <markdown> | --body-file <path|->] [--json]
      Patch an editable entry node. Folder nodes are derived from entry types.

  od memory tree move <id> --type user|feedback|project|reference [--json]
      Move an entry node to a different memory bucket while preserving its id.

  od memory profile show [--json]
      Print the singleton structured user profile (the PRE-loop reads this to
      expand a short query into a brief), or "no profile yet" when unset.

  od memory profile set [--field "Label=Value" ...] [--prompt-file <path|->]
                        [--description <text>] [--json]
      Upsert the user_profile entry. --field merges by label into the existing
      profile body; --prompt-file (path or - for stdin) replaces the body
      verbatim. Combine both: --prompt-file seeds the body, --field overrides.

  od memory rule list [--json]
      List verified rule memories (name + description). The POST loop enforces
      these as scorecard rubric items.

  od memory rule add --name <name> --assertion <text> --check <text>
                     [--description <text>] [--rationale <text>]
                     [--prompt-file <path|->] [--json]
      Add a rule. The body is "Assertion: …\nCheck: …" (plus an optional
      Rationale line), or the verbatim --prompt-file content when supplied.

  od memory rule suggest --note <text> [--target <label>] [--file <path>]
                         [--current-text <text>] [--json]
  od memory rule suggest --prompt-file <path|-> [--json]
      Distil annotations into candidate rule proposals (display-only). Pass one
      annotation via --note, or a JSON array of annotations / one note per line
      via --prompt-file. Keep one with: od memory rule add.

  od memory verify [list] [--json]
      List recent POST self-verify enforcement outcomes (pass/fail/missing) the
      daemon recorded for artifact turns with active rules.
  od memory verify clear [--json]
      Drop the in-memory verification history.

  od memory config [--enabled true|false] [--extraction true|false]
                   [--profile true|false] [--rewrite true|false]
                   [--verify true|false] [--json]
      With no toggle flags, print every memory switch. With flags, PATCH the
      config and print the result. --profile/--rewrite/--verify map to the
      profile/rewrite/verify hooks; --extraction maps to chatExtractionEnabled.

Common options:
  --daemon-url <url>   Open Design daemon HTTP base.`);
}

/**
 * @internal Extracts positional arguments from argv, skipping flag values.
 */
function memoryPositionals(values) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (!value) continue;
    if (value.startsWith('--')) {
      const eq = value.indexOf('=');
      const key = eq >= 0 ? value.slice(2, eq) : value.slice(2);
      if (eq < 0 && MEMORY_STRING_FLAGS.has(key)) i++;
      continue;
    }
    out.push(value);
  }
  return out;
}

/**
 * @internal Formats memory tree node as tab-separated row (id, parentId, path, kind, type, scope, name).
 */
function formatMemoryTreeRow(node) {
  return [
    node.id,
    node.parentId ?? '-',
    node.path,
    node.kind,
    node.type ?? '-',
    node.scope,
    node.name,
  ].join('\t');
}

/**
 * @internal Prints memory entry in human-readable form (name, id, type, description, body markdown).
 */
function printMemoryEntry(entry) {
  console.log(`# ${entry.name}`);
  console.log(`id: ${entry.id}`);
  console.log(`type: ${entry.type}`);
  console.log(`description: ${entry.description || '-'}`);
  console.log('');
  process.stdout.write(`${entry.body ?? ''}\n`);
}

/**
 * @internal GETs /api/memory/tree; returns derived tree structure with folders and entry nodes.
 */
async function fetchMemoryTree(base) {
  let resp;
  try {
    resp = await fetch(`${base}/api/memory/tree`);
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  return await resp.json();
}

/**
 * @internal PATCHes /api/memory/tree/{id} with partial update (name, description, type, body).
 */
async function patchMemoryTreeNode(base, id, body) {
  let resp;
  try {
    resp = await fetch(`${base}/api/memory/tree/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  return await resp.json();
}

// GET /api/memory/:id, returning the MemoryEntry or null on a 404. Used by the
// profile/rule subcommands so they can read-before-write (merge) without
// crashing when the entry doesn't exist yet.
/**
 * @internal GETs /api/memory/{id}; returns null on 404 (entry not found yet).
 * Used by profile/rule handlers for read-before-write merging.
 */
async function fetchMemoryEntry(base, id) {
  let resp;
  try {
    resp = await fetch(`${base}/api/memory/${encodeURIComponent(id)}`);
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (resp.status === 404) return null;
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  return data.entry ?? data;
}

// Read the verbatim prose body for `od memory profile set` / `rule add`.
// Accepts `--prompt-file <path>` or `--prompt-file -` (stdin). Returns
// undefined when neither is supplied so the caller can fall back to flags.
/**
 * @internal Reads --prompt-file (path or - for stdin); returns undefined if flag is missing.
 */
async function readMemoryPromptFile(flags) {
  if (typeof flags['prompt-file'] !== 'string' || flags['prompt-file'].length === 0) {
    return undefined;
  }
  const path = flags['prompt-file'];
  if (path === '-') {
    return await new Promise((resolve, reject) => {
      let buf = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => { buf += chunk; });
      process.stdin.on('end', () => resolve(buf));
      process.stdin.on('error', reject);
    });
  }
  const { readFile } = await import('node:fs/promises');
  return await readFile(path, 'utf8');
}

// Collect repeated `--field "Label=Value"` flags from the raw argv slice.
// parseFlags collapses duplicate keys, so we scan manually like `--input`
// in `od plugin apply`. Returns an ordered list of {label, value} pairs.
/**
 * @internal Manually scans argv for repeated --field "Label=Value" pairs (parseFlags collapses duplicates).
 */
function collectMemoryFieldFlags(rest) {
  const out = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] !== '--field') continue;
    const raw = rest[i + 1];
    if (typeof raw !== 'string') continue;
    i += 1;
    const eq = raw.indexOf('=');
    if (eq <= 0) continue;
    const label = raw.slice(0, eq).trim();
    const value = raw.slice(eq + 1).trim();
    if (label) out.push({ label, value });
  }
  return out;
}

// The profile body is the canonical flat "- Label: value" markdown list shared
// by the web Profile panel and the daemon onboarding-capture path
// (apps/daemon/src/memory.ts). We parse it back into label→value so `--field`
// upserts can merge by label rather than blindly appending, then re-render in
// the same plain shape so a CLI-written profile round-trips through the UI.
// A legacy "- **Label:** value" line is tolerated on read. Lines that don't
// match (free prose, blank lines, headings) are preserved verbatim ahead of
// the list.
/**
 * @internal Parses profile markdown body into label→value map.
 * Preserves preamble (free prose, headings); tolerates legacy **Label:** bold format.
 * Returns `{labels, byLabel, preamble}` for use by renderProfileBody.
 */
function parseProfileBody(body) {
  const labels = [];
  const byLabel = new Map();
  const preamble = [];
  for (const line of (body ?? '').split('\n')) {
    const match = /^\s*-\s+(.+?):\s*(.*)$/.exec(line);
    if (match) {
      const label = match[1].replace(/\*\*/g, '').trim();
      const value = match[2].replace(/^\*\*\s*/, '').replace(/\s*\*\*$/, '').trim();
      if (!byLabel.has(label)) labels.push(label);
      byLabel.set(label, value);
    } else if (line.trim().length > 0) {
      preamble.push(line);
    }
  }
  return { labels, byLabel, preamble };
}

/**
 * @internal Renders parsed profile back to markdown list format (preserving preamble).
 */
function renderProfileBody(parsed) {
  const lines = [];
  if (parsed.preamble.length > 0) {
    lines.push(...parsed.preamble, '');
  }
  for (const label of parsed.labels) {
    lines.push(`- ${label}: ${parsed.byLabel.get(label) ?? ''}`);
  }
  return lines.join('\n');
}

/**
 * @internal Prints profile entry or 'no profile yet' if null.
 */
function printMemoryProfile(entry) {
  if (!entry) {
    console.log('no profile yet');
    return;
  }
  printMemoryEntry(entry);
}

// `od memory config` reads every switch off GET /api/memory (the master
// `enabled`, the extraction hook `chatExtractionEnabled`, and the three new
// loop hooks). The new flags may be absent from older daemons / before the
// route patch lands, so we coalesce missing booleans to a printable dash.
/**
 * @internal Formats boolean config value as 'on' / 'off' / '-' (for missing/unimplemented).
 */
function formatMemoryConfigSwitch(value) {
  if (value === true) return 'on';
  if (value === false) return 'off';
  return '-';
}

/**
 * Main dispatcher for `od memory` subcommands (tree, profile, rule, verify, config).
 * Tree is default; tree view/edit/move are nested verbs under tree.
 */
export async function runMemory(args) {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    printMemoryHelp();
    process.exit(args.length === 0 ? 2 : 0);
  }
  const topic = args[0];
  if (
    topic !== 'tree'
    && topic !== 'profile'
    && topic !== 'rule'
    && topic !== 'config'
    && topic !== 'verify'
  ) {
    console.error(`unknown subcommand: od memory ${topic}`);
    printMemoryHelp();
    process.exit(2);
  }
  // `od memory config` takes no inner action verb; the others are
  // `<topic> <action>` and re-scan positionals below for the verb.
  const rest = args.slice(1);
  let flags;
  try {
    flags = parseFlags(rest, {
      string: MEMORY_STRING_FLAGS,
      boolean: MEMORY_BOOLEAN_FLAGS,
    });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const base = await cliDaemonBaseUrl(flags);
  const writeJson = (data) =>
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');

  if (topic === 'profile') {
    return runMemoryProfile(base, rest, flags, writeJson);
  }
  if (topic === 'rule') {
    return runMemoryRule(base, rest, flags, writeJson);
  }
  if (topic === 'verify') {
    return runMemoryVerify(base, rest, flags, writeJson);
  }
  if (topic === 'config') {
    return runMemoryConfig(base, rest, flags, writeJson);
  }

  const parts = memoryPositionals(rest);
  const action = parts[0] ?? 'list';

  if (action === 'list') {
    const data = await fetchMemoryTree(base);
    if (flags.json) return writeJson(data);
    const tree = data.tree ?? [];
    if (tree.length === 0) {
      console.log('No memory tree nodes.');
      return;
    }
    console.log('# id\tparent\tpath\tkind\ttype\tscope\tname');
    for (const node of tree) console.log(formatMemoryTreeRow(node));
    return;
  }

  if (action === 'view') {
    const id = parts[1];
    if (!id) {
      console.error('Usage: od memory tree view <id>');
      process.exit(2);
    }
    const treeData = await fetchMemoryTree(base);
    const node = (treeData.tree ?? []).find((item) => item.id === id);
    if (!node) {
      console.error(`memory tree node not found: ${id}`);
      process.exit(4);
    }
    if (node.kind === 'folder') {
      if (flags.json) return writeJson({ node });
      console.log(`${node.path}\t${node.name}\t${node.childrenCount ?? 0} children`);
      return;
    }
    let resp;
    try {
      resp = await fetch(`${base}/api/memory/${encodeURIComponent(id)}`);
    } catch (err) {
      surfaceFetchError(err, base);
      process.exit(3);
    }
    if (!resp.ok) return structuredHttpFailure(resp);
    const data = await resp.json();
    if (flags.json) return writeJson(data);
    printMemoryEntry(data.entry ?? data);
    return;
  }

  if (action === 'edit') {
    const id = parts[1];
    if (!id) {
      console.error('Usage: od memory tree edit <id> [--name ...] [--description ...] [--type ...] [--body ...|--body-file ...]');
      process.exit(2);
    }
    const body = {};
    if (typeof flags.name === 'string') body.name = flags.name;
    if (typeof flags.description === 'string') body.description = flags.description;
    if (typeof flags.type === 'string') body.type = flags.type;
    const nextBody = await readMemoryBodyFromFlags(flags);
    if (typeof nextBody === 'string') body.body = nextBody;
    if (Object.keys(body).length === 0) {
      console.error('nothing to edit; pass --name, --description, --type, --body, or --body-file');
      process.exit(2);
    }
    const data = await patchMemoryTreeNode(base, id, body);
    if (flags.json) return writeJson(data);
    console.log(`[memory] updated ${data.entry?.id ?? id}`);
    return;
  }

  if (action === 'move') {
    const id = parts[1];
    const type = flags.type ?? parts[2];
    if (!id || !type) {
      console.error('Usage: od memory tree move <id> --type user|feedback|project|reference');
      process.exit(2);
    }
    const data = await patchMemoryTreeNode(base, id, { type });
    if (flags.json) return writeJson(data);
    console.log(`[memory] moved ${data.entry?.id ?? id} to ${data.entry?.type ?? type}`);
    return;
  }

  console.error(`unknown subcommand: od memory tree ${action}`);
  printMemoryHelp();
  process.exit(2);
}

// `od memory profile <show|set>` — the singleton structured user profile the
// PRE loop (intent gateway) reads to expand a short query into a full brief.
// Same store as every other memory entry; the well-known id is `user_profile`.
/**
 * @internal Handles `od memory profile show|set`.
 * Show prints singleton user_profile entry; set merges --field pairs and/or --prompt-file body.
 * @async
 * @param {string} base - Daemon base URL.
 * @param {Array<any>} rest - Raw arguments (scanned for positionals).
 * @param {object} flags - Parsed flags.
 * @param {Function} writeJson - JSON output helper.
 * @returns {Promise<void>}
 */
async function runMemoryProfile(base, rest, flags, writeJson) {
  const parts = memoryPositionals(rest);
  const action = parts[0] ?? 'show';
  const PROFILE_ID = 'user_profile';

  if (action === 'show') {
    const entry = await fetchMemoryEntry(base, PROFILE_ID);
    if (flags.json) return writeJson(entry ?? null);
    printMemoryProfile(entry);
    return;
  }

  if (action === 'set') {
    const fields = collectMemoryFieldFlags(rest);
    const promptBody = await readMemoryPromptFile(flags);
    if (fields.length === 0 && typeof promptBody !== 'string') {
      console.error('Usage: od memory profile set [--field "Label=Value" ...] [--prompt-file <path|->] [--description <text>]');
      process.exit(2);
    }
    const existing = await fetchMemoryEntry(base, PROFILE_ID);
    // --prompt-file replaces the body verbatim; otherwise we merge --field
    // pairs by label into the existing profile body.
    const parsed = typeof promptBody === 'string'
      ? parseProfileBody(promptBody)
      : parseProfileBody(existing?.body ?? '');
    for (const { label, value } of fields) {
      if (!parsed.byLabel.has(label)) parsed.labels.push(label);
      parsed.byLabel.set(label, value);
    }
    const nextBody = renderProfileBody(parsed);
    const payload = {
      type: 'profile',
      name: existing?.name || 'Work profile',
      description: typeof flags.description === 'string'
        ? flags.description
        : (existing?.description ?? 'How I work — read by the intent gateway.'),
      body: nextBody,
    };
    let resp;
    try {
      resp = await fetch(`${base}/api/memory/${encodeURIComponent(PROFILE_ID)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      surfaceFetchError(err, base);
      process.exit(3);
    }
    if (!resp.ok) return structuredHttpFailure(resp);
    const data = await resp.json();
    if (flags.json) return writeJson(data.entry ?? data);
    console.log(`[memory] saved profile ${data.entry?.id ?? PROFILE_ID}`);
    printMemoryProfile(data.entry ?? data);
    return;
  }

  console.error(`unknown subcommand: od memory profile ${action}`);
  printMemoryHelp();
  process.exit(2);
}

// `od memory rule <list|add>` — verified rules (assertion + check) the POST
// self-verify loop enforces as scorecard rubric items.
/**
 * @internal Handles `od memory rule list|add|suggest`.
 * List shows verified rules; add stores Assertion+Check+Rationale; suggest distils annotations into proposals (display-only).
 * @async
 * @param {string} base - Daemon base URL.
 * @param {Array<any>} rest - Raw arguments.
 * @param {object} flags - Parsed flags.
 * @param {Function} writeJson - JSON output helper.
 * @returns {Promise<void>}
 */
async function runMemoryRule(base, rest, flags, writeJson) {
  const parts = memoryPositionals(rest);
  const action = parts[0] ?? 'list';

  if (action === 'list') {
    let resp;
    try {
      resp = await fetch(`${base}/api/memory`);
    } catch (err) {
      surfaceFetchError(err, base);
      process.exit(3);
    }
    if (!resp.ok) return structuredHttpFailure(resp);
    const data = await resp.json();
    const rules = (data.entries ?? []).filter((e) => e.type === 'rule');
    if (flags.json) return writeJson({ rules });
    if (rules.length === 0) {
      console.log('No rule memories.');
      return;
    }
    for (const rule of rules) {
      console.log(`${rule.id}\t${rule.name}\t${rule.description || '-'}`);
    }
    return;
  }

  if (action === 'add') {
    const name = flags.name;
    if (typeof name !== 'string' || name.length === 0) {
      console.error('Usage: od memory rule add --name <name> --assertion <text> --check <text> [--description <text>] [--rationale <text>] [--prompt-file <path|->]');
      process.exit(2);
    }
    // --prompt-file content becomes the rule body verbatim; otherwise we
    // compose "Assertion: …\nCheck: …" (+ optional Rationale) from flags.
    const promptBody = await readMemoryPromptFile(flags);
    let body;
    if (typeof promptBody === 'string') {
      body = promptBody;
    } else {
      const assertion = flags.assertion;
      const check = flags.check;
      if (typeof assertion !== 'string' || typeof check !== 'string') {
        console.error('rule add needs --assertion and --check (or --prompt-file for the body)');
        process.exit(2);
      }
      const lines = [`Assertion: ${assertion}`, `Check: ${check}`];
      if (typeof flags.rationale === 'string' && flags.rationale.length > 0) {
        lines.push(`Rationale: ${flags.rationale}`);
      }
      body = lines.join('\n');
    }
    const payload = {
      type: 'rule',
      name,
      description: typeof flags.description === 'string' ? flags.description : '',
      body,
    };
    let resp;
    try {
      resp = await fetch(`${base}/api/memory`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      surfaceFetchError(err, base);
      process.exit(3);
    }
    if (!resp.ok) return structuredHttpFailure(resp);
    const data = await resp.json();
    if (flags.json) return writeJson(data.entry ?? data);
    console.log(`[memory] added rule ${data.entry?.id ?? name}`);
    return;
  }

  if (action === 'suggest') {
    // Distil annotations into rule proposals (THREAD 1). Display-only: the
    // daemon never writes; the user Keeps a proposal (web) or pipes it into
    // `od memory rule add` (CLI) to commit it. Annotations come from a single
    // --note (+ optional --target/--file/--current-text) or a --prompt-file
    // carrying a JSON array of annotation objects or newline-separated notes.
    const annotations = await collectDistillAnnotations(flags);
    if (annotations.length === 0) {
      console.error('Usage: od memory rule suggest --note <text> [--target <label>] [--file <path>] [--current-text <text>]');
      console.error('   or: od memory rule suggest --prompt-file <path|->   (JSON array of annotations, or one note per line)');
      process.exit(2);
    }
    let resp;
    try {
      resp = await fetch(`${base}/api/memory/rules/suggest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ annotations }),
      });
    } catch (err) {
      surfaceFetchError(err, base);
      process.exit(3);
    }
    if (!resp.ok) return structuredHttpFailure(resp);
    const data = await resp.json();
    if (flags.json) return writeJson(data);
    const proposals = data.proposals ?? [];
    if (proposals.length === 0) {
      console.log('No rule proposals distilled from these annotations.');
      return;
    }
    console.log(`[memory] ${proposals.length} rule proposal(s) (source: ${data.source}, llm: ${data.attemptedLLM ? 'yes' : 'no'})`);
    for (const p of proposals) {
      console.log(`\n${p.name}`);
      if (p.description) console.log(`  ${p.description}`);
      console.log(`  Assertion: ${p.assertion}`);
      console.log(`  Check: ${p.check}`);
      if (p.rationale) console.log(`  Rationale: ${p.rationale}`);
    }
    console.log('\nTo keep one: od memory rule add --name "<name>" --assertion "<...>" --check "<...>"');
    return;
  }

  console.error(`unknown subcommand: od memory rule ${action}`);
  printMemoryHelp();
  process.exit(2);
}

// Collect annotation inputs for `od memory rule suggest` from either a single
// --note (+ optional target context) or a --prompt-file. The prompt-file may
// hold a JSON array of annotation objects, or plain text with one note per
// line — both keep the --prompt-file embeddability contract clean for jobs
// that pipe through xargs/jq/heredoc.
/**
 * @internal Collects annotation inputs for rule suggest from --note (+ context) or --prompt-file (JSON array or line-delimited).
 * @async
 * @param {object} flags - Parsed flags.
 * @returns {Promise<Array<object>>} Annotation objects.
 */
async function collectDistillAnnotations(flags) {
  const annotations = [];
  if (typeof flags.note === 'string' && flags.note.trim()) {
    annotations.push({
      note: flags.note,
      ...(typeof flags.target === 'string' ? { targetLabel: flags.target } : {}),
      ...(typeof flags.file === 'string' ? { filePath: flags.file } : {}),
      ...(typeof flags['current-text'] === 'string'
        ? { currentText: flags['current-text'] }
        : {}),
    });
  }
  const promptBody = await readMemoryPromptFile(flags);
  if (typeof promptBody === 'string' && promptBody.trim()) {
    const trimmed = promptBody.trim();
    let parsedJson = null;
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        parsedJson = JSON.parse(trimmed);
      } catch {
        parsedJson = null;
      }
    }
    if (Array.isArray(parsedJson)) {
      for (const item of parsedJson) {
        const note = item && typeof item.note === 'string' ? item.note : '';
        if (!note.trim()) continue;
        annotations.push({
          note,
          ...(typeof item.targetLabel === 'string' ? { targetLabel: item.targetLabel } : {}),
          ...(typeof item.filePath === 'string' ? { filePath: item.filePath } : {}),
          ...(typeof item.currentText === 'string' ? { currentText: item.currentText } : {}),
          ...(typeof item.selectionKind === 'string' ? { selectionKind: item.selectionKind } : {}),
          ...(typeof item.htmlHint === 'string' ? { htmlHint: item.htmlHint } : {}),
        });
      }
    } else if (parsedJson && typeof parsedJson === 'object' && typeof parsedJson.note === 'string') {
      annotations.push({ note: parsedJson.note });
    } else {
      for (const line of trimmed.split(/\r?\n/)) {
        const note = line.trim();
        if (note) annotations.push({ note });
      }
    }
  }
  return annotations;
}

// `od memory verify <list|clear>` — inspect or wipe the POST self-verify
// enforcement history (THREAD 2). `list` prints recent enforcement outcomes
// (`pass` / `fail` / `missing`) the daemon recorded for artifact turns with
// active rules; `clear` drops the in-memory buffer.
/**
 * @internal Handles `od memory verify list|clear`.
 * List prints recent POST self-verify outcomes; clear drops in-memory buffer.
 * @async
 * @param {string} base - Daemon base URL.
 * @param {Array<any>} rest - Raw arguments.
 * @param {object} flags - Parsed flags.
 * @param {Function} writeJson - JSON output helper.
 * @returns {Promise<void>}
 */
async function runMemoryVerify(base, rest, flags, writeJson) {
  const parts = memoryPositionals(rest);
  const action = parts[0] ?? 'list';

  if (action === 'list') {
    let resp;
    try {
      resp = await fetch(`${base}/api/memory/verifications`);
    } catch (err) {
      surfaceFetchError(err, base);
      process.exit(3);
    }
    if (!resp.ok) return structuredHttpFailure(resp);
    const data = await resp.json();
    if (flags.json) return writeJson(data);
    const verifications = data.verifications ?? [];
    if (verifications.length === 0) {
      console.log('No verification records yet.');
      return;
    }
    console.log('# status\trules\tcovered\trowsFail\tat\trunId');
    for (const v of verifications) {
      const at = new Date(v.at).toISOString();
      console.log(
        `${v.status}\t${v.rulesActive}\t${v.rulesCovered}\t${v.rowsFailed}\t${at}\t${v.runId ?? '-'}`,
      );
      if (Array.isArray(v.uncoveredRules) && v.uncoveredRules.length > 0) {
        console.log(`  uncovered: ${v.uncoveredRules.join(', ')}`);
      }
    }
    return;
  }

  if (action === 'clear') {
    let resp;
    try {
      resp = await fetch(`${base}/api/memory/verifications`, { method: 'DELETE' });
    } catch (err) {
      surfaceFetchError(err, base);
      process.exit(3);
    }
    if (!resp.ok) return structuredHttpFailure(resp);
    const data = await resp.json();
    if (flags.json) return writeJson(data);
    console.log(`[memory] cleared ${data.removed ?? 0} verification record(s)`);
    return;
  }

  console.error(`unknown subcommand: od memory verify ${action}`);
  printMemoryHelp();
  process.exit(2);
}

// `od memory config` — inspect or toggle the master switch + the four hooks.
// No flags ⇒ print every switch (read off GET /api/memory). Toggle flags ⇒
// PATCH /api/memory/config and print the result. Flags accept true|false.
/**
 * @internal Handles `od memory config` with optional toggle flags (--enabled, --profile, --rewrite, --verify, --extraction).
 * No flags: read-only GET /api/memory listing every switch; with flags: PATCH /api/memory/config.
 * @async
 * @param {string} base - Daemon base URL.
 * @param {Array<any>} rest - Raw arguments.
 * @param {object} flags - Parsed flags.
 * @param {Function} writeJson - JSON output helper.
 * @returns {Promise<void>}
 */
async function runMemoryConfig(base, rest, flags, writeJson) {
  // Map CLI flag → config field. --extraction is the chat-extraction hook;
  // --profile/--rewrite/--verify are the new PRE/POST loop hooks.
  const TOGGLE_MAP = {
    enabled: 'enabled',
    extraction: 'chatExtractionEnabled',
    profile: 'profileEnabled',
    rewrite: 'rewriteEnabled',
    verify: 'verifyEnabled',
  };
  const parseBool = (raw, flagName) => {
    if (raw === 'true' || raw === true) return true;
    if (raw === 'false') return false;
    console.error(`--${flagName} expects true or false`);
    process.exit(2);
  };

  const patch = {};
  for (const [flagName, field] of Object.entries(TOGGLE_MAP)) {
    if (flagName in flags) {
      patch[field] = parseBool(flags[flagName], flagName);
    }
  }

  // No toggles → read-only listing of every switch off GET /api/memory.
  if (Object.keys(patch).length === 0) {
    let resp;
    try {
      resp = await fetch(`${base}/api/memory`);
    } catch (err) {
      surfaceFetchError(err, base);
      process.exit(3);
    }
    if (!resp.ok) return structuredHttpFailure(resp);
    const data = await resp.json();
    const view = {
      enabled: data.enabled,
      chatExtractionEnabled: data.chatExtractionEnabled,
      profileEnabled: data.profileEnabled,
      rewriteEnabled: data.rewriteEnabled,
      verifyEnabled: data.verifyEnabled,
    };
    if (flags.json) return writeJson(view);
    console.log(`enabled               ${formatMemoryConfigSwitch(view.enabled)}`);
    console.log(`chatExtractionEnabled ${formatMemoryConfigSwitch(view.chatExtractionEnabled)}`);
    console.log(`profileEnabled        ${formatMemoryConfigSwitch(view.profileEnabled)}`);
    console.log(`rewriteEnabled        ${formatMemoryConfigSwitch(view.rewriteEnabled)}`);
    console.log(`verifyEnabled         ${formatMemoryConfigSwitch(view.verifyEnabled)}`);
    return;
  }

  let resp;
  try {
    resp = await fetch(`${base}/api/memory/config`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch (err) {
    surfaceFetchError(err, base);
    process.exit(3);
  }
  if (!resp.ok) return structuredHttpFailure(resp);
  const data = await resp.json();
  if (flags.json) return writeJson(data);
  console.log(`enabled               ${formatMemoryConfigSwitch(data.enabled)}`);
  console.log(`chatExtractionEnabled ${formatMemoryConfigSwitch(data.chatExtractionEnabled)}`);
  console.log(`profileEnabled        ${formatMemoryConfigSwitch(data.profileEnabled)}`);
  console.log(`rewriteEnabled        ${formatMemoryConfigSwitch(data.rewriteEnabled)}`);
  console.log(`verifyEnabled         ${formatMemoryConfigSwitch(data.verifyEnabled)}`);
  return;
}
