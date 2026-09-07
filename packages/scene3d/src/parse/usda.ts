/**
 * Structure-only USDA tokenizer + parser.
 *
 * Reads the subset of USDA that matters for scene management: the stage
 * header, prim specifications (def/over/class/scope), typed attributes,
 * rels, references, payloads, and sublayers. It deliberately does NOT
 * resolve composition arcs or compute attribute values — the Blender runner
 * is the composition oracle. The parse tree feeds the linter (structure
 * rules) and the manifest (part tree) without ever invoking Blender, which
 * keeps lint fast and CI-safe on any machine.
 *
 * Every statement records its line number so issues can point at the
 * offending source line.
 */

import { UsdaPrim, UsdaPrimTree } from "../types.js";

export interface StageMetadata {
  defaultPrim?: string;
  metersPerUnit?: number;
  upAxis?: "Y" | "Z";
  subLayers: string[];
  startTimeCode?: number;
  endTimeCode?: number;
  /** Whether the stage header carries an `assetInfo` dictionary. Captured so
   *  the stage linter can judge its presence from the parse (string-safe)
   *  rather than a raw-text regex a decoy in a doc string could satisfy. */
  hasAssetInfo?: boolean;
}

interface Token {
  kind: "ident" | "string" | "number" | "path" | "punct" | "eof";
  value: string;
  line: number;
}

// `:` carries timeSamples keys (`1: 0.5`) — present in EVERY animated
// export now that the master carries animation; `;` separates layer-offset
// fields in reference metadata. Both are legal USDA the lexer must pass
// through rather than crash on (found by adversarial review — a crash here
// blinded the model-hierarchy rules on exactly the rigged scenes that most
// need them).
const PUNCT = new Set(["{", "}", "(", ")", "[", "]", "=", ",", ":", ";"]);

export class UsdaParseError extends Error {
  readonly line: number;
  readonly file: string;

  constructor(message: string, line: number, file: string) {
    super(`${file}:${line}: ${message}`);
    this.name = "UsdaParseError";
    this.line = line;
    this.file = file;
  }
}

class Lexer {
  private pos = 0;
  private readonly src: string;
  private readonly file: string;
  /** Tokens minted ahead of the cursor by the bulk-array fast path. */
  private readonly pending: Token[] = [];
  line = 1;

  constructor(src: string, file: string) {
    this.src = src;
    this.file = file;
  }

  tokens(): Token[] {
    const out: Token[] = [];
    for (;;) {
      if (this.pending.length > 0) {
        out.push(this.pending.shift()!);
        continue;
      }
      this.skipWsAndComments();
      const t = this.next();
      out.push(t);
      if (t.kind === "eof") break;
    }
    return out;
  }

  private skipWsAndComments(): void {
    for (;;) {
      // charCodeAt, not a regex per character: this loop visits every byte
      // of the stage, and a real (mesh-heavy) master is hundreds of MB.
      while (this.pos < this.src.length) {
        const c = this.src.charCodeAt(this.pos);
        if (c === 10 /* \n */) {
          this.line++;
        } else if (c !== 32 /* space */ && c !== 9 /* \t */ && c !== 13 /* \r */ && c !== 12 /* \f */ && c !== 11 /* \v */) {
          break;
        }
        this.pos++;
      }
      if (this.src.startsWith("//", this.pos)) {
        while (this.pos < this.src.length && this.src[this.pos] !== "\n") this.pos++;
        continue;
      }
      if (this.src[this.pos] === "#") {
        while (this.pos < this.src.length && this.src[this.pos] !== "\n") this.pos++;
        continue;
      }
      if (this.src.startsWith("/*", this.pos)) {
        const end = this.src.indexOf("*/", this.pos + 2);
        if (end === -1) throw new UsdaParseError("unterminated block comment", this.line, this.file);
        const segment = this.src.slice(this.pos, end + 2);
        this.line += (segment.match(/\n/g) ?? []).length;
        this.pos = end + 2;
        continue;
      }
      return;
    }
  }

  private next(): Token {
    if (this.pos >= this.src.length) return { kind: "eof", value: "", line: this.line };
    const ch = this.src[this.pos]!;
    const line = this.line;

    // Bulk-array fast path — the fix for the one thing that made this
    // parser unusable on real masters. A mesh-heavy stage is hundreds of
    // MB of `point3f[] points = [(…), (…), …]`, and tokenizing it minted a
    // Token OBJECT per number and per comma: hundreds of millions of
    // allocations, multi-GB heaps, and a daemon OOM on a chess set (this
    // is a structure parser — none of those values are ever read). The
    // whole `[...]` payload is skipped in one charCode walk instead; the
    // things consumers DO read from arrays — `@asset@` refs, `<target>`
    // paths, quoted strings — are still minted, in order.
    if (ch === "[") return this.bulkArray(line);

    if (PUNCT.has(ch)) {
      this.pos++;
      return { kind: "punct", value: ch, line };
    }

    if (ch === '"') {
      // Triple-quoted (multi-line) strings are legal USDA and appear in
      // real doc/customData fields; treating the opening pair as an empty
      // string desynced the whole lexer (found by adversarial review).
      if (this.src.startsWith('"""', this.pos)) {
        const end = this.src.indexOf('"""', this.pos + 3);
        if (end === -1) throw new UsdaParseError("unterminated string", line, this.file);
        const value = this.src.slice(this.pos + 3, end);
        this.line += (value.match(/\n/g) ?? []).length;
        this.pos = end + 3;
        return { kind: "string", value, line };
      }
      let out = "";
      this.pos++;
      while (this.pos < this.src.length) {
        const c = this.src[this.pos]!;
        if (c === "\\" && this.pos + 1 < this.src.length) {
          out += this.src[this.pos + 1];
          this.pos += 2;
          continue;
        }
        if (c === '"') {
          this.pos++;
          return { kind: "string", value: out, line };
        }
        if (c === "\n") this.line++;
        out += c;
        this.pos++;
      }
      throw new UsdaParseError("unterminated string", line, this.file);
    }

if (ch === "@") {
      const end = this.src.indexOf("@", this.pos + 1);
      if (end === -1) throw new UsdaParseError("unterminated reference path", line, this.file);
      const value = this.src.slice(this.pos, end + 1);
      this.line += (this.src.slice(this.pos, end + 1).match(/\n/g) ?? []).length;
      this.pos = end + 1;
      return { kind: "path", value, line };
    }

    if (ch === "<") {
      const end = this.src.indexOf(">", this.pos + 1);
      if (end === -1) throw new UsdaParseError("unterminated target path", line, this.file);
      const value = this.src.slice(this.pos, end + 1);
      this.pos = end + 1;
      return { kind: "path", value, line };
    }

if (/[A-Za-z_]/.test(ch)) {
      const start = this.pos;
      let j = start;
      while (j < this.src.length && /[A-Za-z0-9_:.]/.test(this.src[j]!)) j++;
      this.pos = j;
      return { kind: "ident", value: this.src.slice(start, j), line };
    }

    if (/[0-9.\-+]/.test(ch)) {
      let j = this.pos;
      while (j < this.src.length && /[0-9a-zA-Z.eE\-+]/.test(this.src[j]!)) j++;
      const value = this.src.slice(this.pos, j);
      this.pos = j;
      return { kind: "number", value, line };
    }

    throw new UsdaParseError(`unexpected character '${ch}'`, line, this.file);
  }

  /**
   * Consume a whole `[ ... ]` payload, minting only its structural shell
   * plus the items consumers actually read — `@asset@` refs, `<target>`
   * paths, quoted strings. Everything else (the numeric bulk) is skipped
   * in a single charCode walk with no per-item allocation. Nested
   * brackets are swallowed as data; strings and refs are scanned with the
   * same escape rules as the main lexer, so a bracket inside a quoted
   * value can never end the array early.
   */
  private bulkArray(line: number): Token {
    const src = this.src;
    this.pos++; // the '['
    let depth = 1;
    while (this.pos < src.length) {
      const c = src.charCodeAt(this.pos);
      if (c === 91 /* [ */) {
        depth++;
        this.pos++;
        continue;
      }
      if (c === 93 /* ] */) {
        depth--;
        this.pos++;
        if (depth === 0) {
          this.pending.push({ kind: "punct", value: "]", line: this.line });
          return { kind: "punct", value: "[", line };
        }
        continue;
      }
      if (c === 10 /* \n */) {
        this.line++;
        this.pos++;
        continue;
      }
      if (c === 34 /* " */) {
        const tokenLine = this.line;
        if (src.startsWith('"""', this.pos)) {
          const end = src.indexOf('"""', this.pos + 3);
          if (end === -1) throw new UsdaParseError("unterminated string", tokenLine, this.file);
          const value = src.slice(this.pos + 3, end);
          for (let k = 0; k < value.length; k++) if (value.charCodeAt(k) === 10) this.line++;
          this.pos = end + 3;
          this.pending.push({ kind: "string", value, line: tokenLine });
          continue;
        }
        let out = "";
        this.pos++;
        let closed = false;
        while (this.pos < src.length) {
          const s = src.charCodeAt(this.pos);
          if (s === 92 /* \ */ && this.pos + 1 < src.length) {
            out += src[this.pos + 1];
            this.pos += 2;
            continue;
          }
          if (s === 34 /* " */) {
            this.pos++;
            closed = true;
            break;
          }
          if (s === 10 /* \n */) this.line++;
          out += src[this.pos];
          this.pos++;
        }
        if (!closed) throw new UsdaParseError("unterminated string", tokenLine, this.file);
        this.pending.push({ kind: "string", value: out, line: tokenLine });
        continue;
      }
      if (c === 64 /* @ */) {
        const tokenLine = this.line;
        const end = src.indexOf("@", this.pos + 1);
        if (end === -1) throw new UsdaParseError("unterminated reference path", tokenLine, this.file);
        const value = src.slice(this.pos, end + 1);
        for (let k = 0; k < value.length; k++) if (value.charCodeAt(k) === 10) this.line++;
        this.pos = end + 1;
        this.pending.push({ kind: "path", value, line: tokenLine });
        continue;
      }
      if (c === 60 /* < */) {
        const end = src.indexOf(">", this.pos + 1);
        if (end === -1) throw new UsdaParseError("unterminated target path", this.line, this.file);
        this.pending.push({ kind: "path", value: src.slice(this.pos, end + 1), line: this.line });
        this.pos = end + 1;
        continue;
      }
      /* COMMENTS, with the same three spellings the main lexer skips: a
         bracket (or an unpaired quote) inside `# note ]` used to count
         toward the depth walk and close the array early — everything after
         it misparsed, in a file that was perfectly legal USDA. */
      if (c === 35 /* # */) {
        while (this.pos < src.length && src.charCodeAt(this.pos) !== 10) this.pos++;
        continue;
      }
      if (c === 47 /* / */ && src.charCodeAt(this.pos + 1) === 47) {
        while (this.pos < src.length && src.charCodeAt(this.pos) !== 10) this.pos++;
        continue;
      }
      if (c === 47 /* / */ && src.charCodeAt(this.pos + 1) === 42 /* * */) {
        const end = src.indexOf("*/", this.pos + 2);
        if (end === -1) throw new UsdaParseError("unterminated block comment", this.line, this.file);
        for (let k = this.pos; k < end; k++) if (src.charCodeAt(k) === 10) this.line++;
        this.pos = end + 2;
        continue;
      }
      this.pos++;
    }
    throw new UsdaParseError("unterminated array", line, this.file);
  }
}

const SPECIFIERS = new Set(["def", "over", "class", "scope"]);

/** Recursion ceiling for nested prims — a controlled parse error past this,
 *  rather than a stack overflow that crashes the parse (and the daemon). Far
 *  above any real hierarchy; the DEPTH_LIMIT lint rule flags single digits. */
const MAX_PRIM_NESTING = 1024;

export function parseUsda(source: string, file = "<usda>"): UsdaPrimTree {
  const tokens = new Lexer(source, file).tokens();
  const tree: UsdaPrimTree = {
    stage: {
      subLayers: [],
    },
    root: {
      name: "$stage",
      kind: "scope",
      typeName: null,
      parent: null,
      children: [],
      attributes: new Map(),
      metadata: new Map(),
      references: [],
      payloads: [],
      line: 1,
      sourceFile: file,
    },
    prims: [],
  };

  let i = 0;

  const expectPunct = (value: string, line: number) => {
    const t = tokens[i];
    if (!t || t.kind !== "punct" || t.value !== value) {
      throw new UsdaParseError(`expected '${value}'`, line ?? t?.line ?? 0, file);
    }
    i++;
  };

  const skipParenBlock = (line: number) => {
    expectPunct("(", line);
    let depth = 1;
    while (i < tokens.length && depth > 0) {
      const t = tokens[i++]!;
      if (t.kind === "punct" && t.value === "(") depth++;
      if (t.kind === "punct" && t.value === ")") depth--;
    }
    if (depth !== 0) throw new UsdaParseError("unterminated metadata block", line, file);
  };

  /**
   * Skip a brace-balanced block whose contents this structure-only parser does
   * not model. Strings and paths are already single tokens, so counting punct
   * braces cannot be fooled by a `{` inside a doc string.
   */
  const skipBraceBlock = (line: number) => {
    expectPunct("{", line);
    let depth = 1;
    while (i < tokens.length && depth > 0) {
      const t = tokens[i++]!;
      if (t.kind === "punct" && t.value === "{") depth++;
      if (t.kind === "punct" && t.value === "}") depth--;
    }
    if (depth !== 0) throw new UsdaParseError("unterminated variantSet block", line, file);
  };

  /**
   * A `variantSet "name" = { "v1" {...} "v2" {...} }` introduces alternate
   * opinions, not the composed result. Descending into it would put the
   * alternates' prims into the tree as if they coexisted; throwing on it (the
   * old behaviour — the variant name is a string, not an attribute) blinded
   * the WHOLE lint stage for any file that used one, which production and
   * USDView-saved libraries routinely do. So it is recognised and skipped.
   * Returns false when the current token does not open a variantSet.
   */
  const skipVariantSet = (): boolean => {
    const t = tokens[i];
    if (!t || t.kind !== "ident" || t.value !== "variantSet") return false;
    const line = t.line;
    i++; // variantSet
    if (tokens[i]?.kind === "string") i++; // the variant set's name
    if (tokens[i]?.kind === "punct" && tokens[i]?.value === "=") i++; // optional '='
    if (tokens[i]?.kind === "punct" && tokens[i]?.value === "{") skipBraceBlock(line);
    return true;
  };

  /**
   * Read one attribute's value.
   *
   * `startLine` terminates it. A USDA statement occupies one line unless a
   * bracket, paren or brace is open, and without that rule the scan ran on
   * into whatever followed: a valueless declaration such as the
   * `token outputs:surface` that every UsdShade Shader ends with was
   * swallowed into the PREVIOUS attribute's value, so `inputs:specular`
   * came back as "0.5 token outputs:surface" and the output declaration
   * vanished from the tree. It only failed quietly because something always
   * happened to precede it; first in a body, it threw outright.
   */
  const readAttributeValue = (startLine: number): string => {
    const parts: string[] = [];
    let parenDepth = 0;
    let bracketDepth = 0;
    /*
     * Braces are counted too, because a metadata value can be a DICTIONARY:
     *
     *   assetInfo = {
     *       string name = "crate"
     *   }
     *
     * Without this the scan stopped at `name`, whose next token is `=`, and
     * treated the rest of the dictionary as further statements. The stage
     * header parse then derailed and every field AFTER the dictionary —
     * defaultPrim, metersPerUnit, upAxis — came back undefined, silently.
     * The compiler authors that very block on export, so it was blinding its
     * own parser on every scene it built; nothing caught it because the
     * stage linter reads those fields by regex instead, and the surviving
     * path masked the dead one.
     */
    let braceDepth = 0;
    while (i < tokens.length) {
      const t = tokens[i]!;
      if (t.kind === "eof") break;
      // A line break at depth zero ends the statement.
      if (
        t.line !== startLine &&
        parenDepth === 0 &&
        bracketDepth === 0 &&
        braceDepth === 0 &&
        parts.length > 0
      ) {
        break;
      }
      if (t.kind === "punct") {
        if (t.value === "(") parenDepth++;
        if (t.value === "[") bracketDepth++;
        if (t.value === "{") braceDepth++;
        if (t.value === ")" && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) break;
        // A closing brace ends the value only when it is not the dictionary's
        // own: at depth zero it belongs to the enclosing prim body.
        if (t.value === "}" && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) break;
        if (t.value === ")") parenDepth--;
        if (t.value === "]") bracketDepth--;
        if (t.value === "}") braceDepth--;
      }
      if (t.kind === "ident") {
        const next = tokens[i + 1];
        if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
          if (next && next.kind === "punct" && (next.value === "=" || next.value === "[")) break;
          if (next && next.kind === "ident" && SPECIFIERS.has(next.value)) break;
          if (SPECIFIERS.has(t.value)) break;
        }
      }
parts.push(t.value);
      i++;
    }
    return parts.join(" ").replace(/\s*([,()[\]])\s*/g, "$1");
  };

  const readStatement = (): { name: string; value: string; line: number } | null => {
    const t = tokens[i];
    if (!t || t.kind === "eof") return null;
    if (t.kind === "punct" && t.value === "}") return null;
    if (t.kind === "punct" && t.value === ")") return null;
    if (t.kind === "ident" && SPECIFIERS.has(t.value)) return null;
    if (t.kind !== "ident") throw new UsdaParseError(`expected attribute name, got '${t.value}'`, t.line, file);
    const line = t.line;
    i++;
    // Skip qualifiers (uniform/custom/varying/rel/type tokens incl. `float3[]`).
    // GUARDED to the declaration's own line: a USDA statement's type qualifiers
    // are always on one line, so an ident on the NEXT line is the start of the
    // next statement, not a qualifier. Without the guard the loop crossed the
    // newline after a valueless declaration (`token outputs:surface`) and
    // swallowed the following statement's tokens — the output vanished and the
    // next attribute was misattributed. Values may still span lines; that is
    // readAttributeValue's job, not this loop's.
    let eq = tokens[i];
    for (;;) {
      if (eq && eq.kind === "ident" && eq.line === line) {
        i++;
        eq = tokens[i];
        continue;
      }
      if (
        eq &&
        eq.kind === "punct" &&
        eq.value === "[" &&
        eq.line === line &&
        tokens[i + 1]?.kind === "punct" &&
        tokens[i + 1]?.value === "]"
      ) {
        i += 2;
        eq = tokens[i];
        continue;
      }
      break;
    }
    if (eq && eq.kind === "punct" && eq.value === "(") {
      skipParenBlock(line);
      return null;
    }
    if (!eq || eq.kind !== "punct" || eq.value !== "=") {
      /*
       * A declaration with no value — `token outputs:surface`, which is how
       * UsdShade declares an output and how any attribute is declared
       * without authoring one. Throwing here meant a Material or Shader
       * whose body OPENED with an output could not be parsed at all. The
       * declaration is real and its name is worth recording; it simply has
       * no value.
       */
      return { name: tokens[i - 1]?.value ?? "?", value: "", line };
    }
    i++;
    const nameIdx = i;
    const value = readAttributeValue(tokens[i]?.line ?? line);
    /* An attribute may carry its own metadata block on the following lines
       (`interpolation = "faceVarying"` under a primvar). The value now stops
       at the line break, so that block is consumed here instead of being
       mistaken for the next statement. */
    if (tokens[i]?.kind === "punct" && tokens[i]?.value === "(") skipParenBlock(tokens[i]!.line);
    return { name: tokenNameAt(tokens, nameIdx), value, line };
  };

  /** The statement name is the identifier two tokens before the first value
   *  token (tokens: [.. name '=' value ..]). */
  const tokenNameAt = (toks: Token[], nameIdx: number): string => {
    let j = nameIdx - 2;
    while (j >= 0 && toks[j]!.kind === "punct" && toks[j]!.value === "]") j -= 2;
    if (j >= 0 && toks[j]!.kind === "ident") return toks[j]!.value;
    return toks[Math.max(0, nameIdx - 2)]?.value ?? "?";
  };

  const collectRefs = (value: string): string[] => {
    const refs: string[] = [];
    // `[^@\n]` not `[^@\s]`: real downloads ship asset paths with spaces
    // (`@./my asset.usda@`), and stopping at the first space silently dropped
    // the sublayer/reference. A newline cannot appear inside a single `@...@`
    // span, so it remains the terminator that keeps two paths from merging.
    for (const m of value.matchAll(/@([^@\n]+)@/g)) refs.push(m[1]!.trim());
    return refs;
  };

  const parseStageMetadata = () => {
    while (i < tokens.length) {
      const t = tokens[i];
      if (!t || t.kind === "eof") return;
      if (t.kind === "ident" && SPECIFIERS.has(t.value)) return;
      if (t.kind === "punct" && t.value === "(") {
        i++;
        for (;;) {
          const st = readStatement();
          if (!st) break;
          if (st.name === "defaultPrim") tree.stage.defaultPrim = unquote(st.value);
          else if (st.name === "metersPerUnit") tree.stage.metersPerUnit = Number(st.value);
          else if (st.name === "upAxis") tree.stage.upAxis = unquote(st.value) as "Y" | "Z";
          else if (st.name === "subLayers") tree.stage.subLayers.push(...collectRefs(st.value));
          else if (st.name === "startTimeCode") tree.stage.startTimeCode = Number(st.value);
          else if (st.name === "endTimeCode") tree.stage.endTimeCode = Number(st.value);
          else if (st.name === "assetInfo") tree.stage.hasAssetInfo = true;
        }
        continue;
      }
      if (t.kind === "string") {
        i++;
        continue;
      }
      // Anything else at top level is unexpected but tolerated for forward compat.
      i++;
    }
  };

  const parsePrim = (parent: UsdaPrim, parentPath: string, defLine: number, depth: number): void => {
    // Bound the recursion so a pathological or malicious file — thousands of
    // nested `def`s — fails as a controlled parse error instead of a stack
    // overflow. An overflow is uncatchable enough to crash the worker (and the
    // daemon runs parseUsda on every compile), and a crash blinds the whole
    // lint stage. The floor is far above any real scene: the DEPTH_LIMIT lint
    // rule flags a hierarchy past single digits, so nothing legitimate is near.
    if (depth > MAX_PRIM_NESTING) {
      throw new UsdaParseError(`prim nesting deeper than ${MAX_PRIM_NESTING}`, defLine, file);
    }
    const specTok = tokens[i];
    if (!specTok || specTok.kind === "eof") return;
    if (specTok.kind === "punct" && specTok.value === "}") return;
    if (specTok.kind !== "ident" || !SPECIFIERS.has(specTok.value)) {
      throw new UsdaParseError(`expected prim specifier, got '${specTok.value}'`, specTok.line, file);
    }
    const specifier = specTok.value as UsdaPrim["kind"];
    i++;
    let typeName: string | null = null;
    let name = "(anonymous)";
    const nameTok = tokens[i];
    if (nameTok && nameTok.kind === "string") {
      name = nameTok.value;
      i++;
    } else if (nameTok && nameTok.kind === "ident" && isTypeToken(nameTok.value)) {
      typeName = nameTok.value;
      i++;
      const nameTok2 = tokens[i];
      if (nameTok2 && nameTok2.kind === "string") {
        name = nameTok2.value;
        i++;
      }
    }
    let primMeta = "";
    /*
     * Prim metadata, keyed.
     *
     * This block used to be flattened to one string and read only for
     * reference paths, so `kind`, `assetInfo` and `customData` were
     * invisible to every consumer of the tree — which is why the stage
     * linter reads `kind` with a regex over the raw file instead. Keeping
     * the joined string for collectRefs and ALSO recording the pairs means
     * there is one parse to trust rather than a parser and a regex that can
     * disagree about the same file.
     */
    const metadata = new Map<string, string>();
    if (tokens[i] && tokens[i].kind === "punct" && tokens[i].value === "(") {
      const metaLine = tokens[i]!.line;
      i++;
      let depth = 1;
      const parts: string[] = [];
      let key: string | null = null;
      let value: string[] = [];
      // Nesting WITHIN a value, so a dictionary's inner `key = ...` pairs
      // are kept as part of their parent's value rather than promoted to
      // top-level metadata of the prim.
      let valueDepth = 0;
      const flush = () => {
        if (key !== null) metadata.set(key, value.join(" ").trim());
        key = null;
        value = [];
      };
      while (i < tokens.length && depth > 0) {
        const t = tokens[i++]!;
        if (t.kind === "punct" && t.value === "(") depth++;
        if (t.kind === "punct" && t.value === ")") {
          depth--;
          if (depth === 0) break;
        }
        parts.push(t.value);
        if (t.kind === "punct" && (t.value === "{" || t.value === "[")) valueDepth++;
        else if (t.kind === "punct" && (t.value === "}" || t.value === "]")) valueDepth--;
        if (
          valueDepth === 0 &&
          t.kind === "ident" &&
          tokens[i]?.kind === "punct" &&
          tokens[i]?.value === "="
        ) {
          flush();
          key = t.value;
          i++;
          continue;
        }
        if (key !== null) value.push(t.value);
      }
      flush();
      if (depth !== 0) throw new UsdaParseError("unterminated prim metadata block", metaLine, file);
      primMeta = parts.join(" ");
    }
/* Payload arcs OUT of the reference list: the catch-all over the
       joined metadata string scooped `payload = @heavy.usda@` into
       `references` and left `payloads` empty, so a consumer that
       distinguishes lazy payload loading from eager references saw a
       composition that does not exist. The keyed metadata pairs say which
       arc each path belongs to; everything else in the metadata (assetInfo
       paths and the like) keeps riding `references` as the catch-all it
       always was. */
    const payloadArcs = [...metadata.entries()]
      .filter(([k]) => k === "payload" || k === "payloads")
      .flatMap(([, v]) => collectRefs(v));
    const prim: UsdaPrim = {
      name,
      kind: specifier === "scope" || typeName === "Scope" ? "scope" : (specifier as UsdaPrim["kind"]),
      typeName,
      parent: parent.name === "$stage" ? null : parent.name,
      children: [],
      attributes: new Map(),
      metadata,
      references: collectRefs(primMeta).filter((r) => !payloadArcs.includes(r)),
      payloads: payloadArcs,
      line: defLine,
      sourceFile: file,
    };
    parent.children.push(prim);
    tree.prims.push(prim);
    const path = parentPath === "" ? name : `${parentPath}/${name}`;
    const open = tokens[i];
    if (open && open.kind === "punct" && open.value === "{") {
      i++;
      for (;;) {
        const t = tokens[i];
        if (!t || t.kind === "eof") throw new UsdaParseError(`unterminated prim '${path}'`, defLine, file);
        if (t.kind === "punct" && t.value === "}") {
          i++;
          return;
        }
        if (t.kind === "ident" && SPECIFIERS.has(t.value)) {
          parsePrim(prim, path, t.line, depth + 1);
          continue;
        }
        if (skipVariantSet()) continue;
        const before = i;
        const st = readStatement();
        if (!st) {
          // readStatement can return null WITHOUT consuming a token — a stray
          // `)` inside a prim body is the case fuzzing found. `continue`-ing
          // then spins on the same token forever, wedging the parse (and the
          // daemon, which parses on every compile). If nothing advanced, the
          // body holds a token that cannot begin a statement: fail as a
          // controlled parse error instead of hanging.
          if (i === before) {
            throw new UsdaParseError(
              `unexpected '${tokens[i]?.value ?? "?"}' in prim body '${path}'`,
              tokens[i]?.line ?? defLine,
              file,
            );
          }
          continue;
        }
        if (st.name === "references" || st.name === "reference") {
          prim.references.push(...collectRefs(st.value));
        } else if (st.name === "payload") {
          prim.payloads.push(...collectRefs(st.value));
        }
        prim.attributes.set(st.name, st.value);
      }
    }
  };

  parseStageMetadata();
  while (i < tokens.length) {
    const t = tokens[i];
    if (!t || t.kind === "eof") break;
    if (t.kind === "ident" && SPECIFIERS.has(t.value)) {
      parsePrim(tree.root, "", t.line, 0);
      continue;
    }
    // Tolerate stray top-level content (e.g. version comment leftovers).
    i++;
  }

  return tree;
}

function unquote(value: string): string {
  return value.replace(/^"|"$/g, "");
}

/** Type tokens look like `float3[]`, `token`, `bool`, `rel`, `custom`, etc. */
function isTypeToken(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]*(\[\])?$/.test(value) && value !== "def" && value !== "over";
}

/** Depth-first walk over prims. */
export function walkPrims(prim: UsdaPrim, visit: (prim: UsdaPrim, depth: number) => void, depth = 0): void {
  visit(prim, depth);
  for (const child of prim.children) walkPrims(child, visit, depth + 1);
}

/** Resolve a `/A/B/C` path against the tree; returns undefined when missing. */
export function primByPath(tree: UsdaPrimTree, path: string): UsdaPrim | undefined {
  if (path === "/") return tree.root;
  const parts = path.split("/").filter(Boolean);
  let current: UsdaPrim | undefined = tree.root;
  for (const part of parts) {
    current = current?.children.find((c) => c.name === part);
    if (!current) return undefined;
  }
  return current;
}

export function primPath(tree: UsdaPrimTree, prim: UsdaPrim): string {
  const segments: string[] = [];
  let current: UsdaPrim | undefined = prim;
  while (current && current !== tree.root) {
    segments.unshift(current.name);
    current = tree.prims.find((p) => p.children.includes(current!));
  }
  return `/${segments.join("/")}`;
}
export { Lexer };
