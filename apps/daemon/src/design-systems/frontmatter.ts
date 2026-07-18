// Minimal YAML front-matter parser. Handles the subset used by SKILL.md in
// our examples: scalar strings/numbers/booleans, block-literal (|) strings,
// and flat arrays ("- foo"). Keeps the daemon dep-free. If you need real
// YAML (nested objects, flow-style, anchors), swap for `yaml` or `js-yaml`.

export type FrontmatterScalar = string | number | boolean | null;
export type FrontmatterValue = FrontmatterScalar | FrontmatterArray | FrontmatterObject;
export interface FrontmatterArray extends Array<FrontmatterValue> {}
export interface FrontmatterObject extends Record<string, FrontmatterValue> {}
type FrontmatterContainer = FrontmatterObject | FrontmatterArray;
type StackEntry = {
  indent: number;
  container: FrontmatterContainer;
  key: string | null;
};

export function parseFrontmatter(src: string): { data: FrontmatterObject; body: string } {
  const text = src.replace(/^﻿/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return { data: {}, body: text };
  const yaml = match[1] ?? '';
  const body = match[2] ?? '';
  return { data: parseYamlSubset(yaml), body };
}

function parseYamlSubset(src: string): FrontmatterObject {
  const lines = src.split(/\r?\n/);
  const root: FrontmatterObject = {};
  const stack: StackEntry[] = [{ indent: -1, container: root, key: null }];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i] ?? '';
    if (/^\s*(#.*)?$/.test(raw)) {
      i++;
      continue;
    }
    const indent = raw.match(/^\s*/)?.[0].length ?? 0;
    const line = raw.slice(indent);

    // A block sequence may sit at the SAME indentation as its parent mapping
    // key (the flush-left `key:` / `- item` style). Such a `- ` item belongs
    // to the pending key placeholder at its own indent, so don't pop that
    // placeholder the way a normal dedent would — it is either the empty
    // object still awaiting a value or the array we already started for it.
    const isSeqItem = line.startsWith('- ');
    while (stack.length > 1 && indent <= (stack[stack.length - 1]?.indent ?? -1)) {
      const entry = stack[stack.length - 1];
      if (
        entry &&
        isSeqItem &&
        indent === entry.indent &&
        entry.key !== null &&
        (Array.isArray(entry.container) || Object.keys(entry.container).length === 0)
      ) {
        break;
      }
      stack.pop();
    }
    const top = stack[stack.length - 1];
    if (!top) throw new Error('frontmatter parser stack invariant violated');

    // Array item
    if (line.startsWith('- ')) {
      const value = line.slice(2).trim();
      let container = top.container;
      if (!Array.isArray(container)) {
        // Convert the pending key's value to an array on first `-`.
        const parent = stack[stack.length - 2];
        if (parent && top.key) {
          if (Array.isArray(parent.container)) {
            throw new Error('invalid frontmatter array nesting');
          }
          parent.container[top.key] = [];
          container = parent.container[top.key] as FrontmatterArray;
          top.container = container;
        } else {
          i++;
          continue;
        }
      }
      if (value.includes(':')) {
        const obj: FrontmatterObject = {};
        const colonIdx = value.indexOf(':');
        const key = value.slice(0, colonIdx).trim();
        const valRaw = value.slice(colonIdx + 1).trim();
        if (valRaw) obj[key] = coerce(valRaw);
        if (!Array.isArray(container)) throw new Error('frontmatter array container expected');
        container.push(obj);
        stack.push({ indent, container: obj, key: null });
      } else {
        if (!Array.isArray(container)) throw new Error('frontmatter array container expected');
        container.push(coerce(value));
      }
      i++;
      continue;
    }

    // key: value or key: |
    const kv = /^([^:]+):\s*(.*)$/.exec(line);
    if (!kv) {
      i++;
      continue;
    }
    const key = (kv[1] ?? '').trim();
    const val = kv[2];

    if (val === '' || val === undefined) {
      if (Array.isArray(top.container)) throw new Error('frontmatter object container expected');
      top.container[key] = {};
      stack.push({ indent, container: top.container[key], key });
      i++;
      continue;
    }

    if (val === '|' || val === '|-' || val === '>' || val === '>-') {
      const collected = [];
      // YAML derives a block scalar's indentation from its first non-empty
      // content line, not a fixed key+2, so content indented deeper than
      // key+2 is stripped to its own base instead of keeping spurious
      // leading whitespace. Relative indentation deeper than the base is
      // preserved.
      let blockIndent = -1;
      i++;
      while (i < lines.length) {
        const next = lines[i] ?? '';
        if (/^\s*$/.test(next)) {
          collected.push('');
          i++;
          continue;
        }
        const nIndent = next.match(/^\s*/)?.[0].length ?? 0;
        if (nIndent <= indent) break;
        if (blockIndent === -1) blockIndent = nIndent;
        if (nIndent < blockIndent) break;
        collected.push(next.slice(blockIndent));
        i++;
      }
      if (Array.isArray(top.container)) throw new Error('frontmatter object container expected');
      top.container[key] = collected.join('\n').trimEnd();
      continue;
    }

    if (val === '[]') {
      if (Array.isArray(top.container)) throw new Error('frontmatter object container expected');
      top.container[key] = [];
      i++;
      continue;
    }

    if (val.startsWith('[') && val.endsWith(']')) {
      if (Array.isArray(top.container)) throw new Error('frontmatter object container expected');
      top.container[key] = splitInlineArrayItems(val.slice(1, -1))
        .map((s) => coerce(s.trim()))
        .filter((v) => v !== '');
      i++;
      continue;
    }

    if (Array.isArray(top.container)) throw new Error('frontmatter object container expected');
    top.container[key] = coerce(val);
    i++;
  }

  return root;
}

// Split an inline-array body (`a, "b,c", 'd'`) on top-level commas only, so a
// comma inside a quoted element is not treated as a separator. A quote only
// opens a quoted element when it is that element's first non-whitespace
// character; a quote mid-token (e.g. the apostrophe in `don't`) is a literal
// plain-scalar character. Escaping inside quotes is out of scope, matching the
// rest of this minimal parser.
function splitInlineArrayItems(inner: string): string[] {
  const items: string[] = [];
  let buf = '';
  let quote: '"' | "'" | null = null;
  for (const ch of inner) {
    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
    } else if ((ch === '"' || ch === "'") && buf.trim() === '') {
      quote = ch;
      buf += ch;
    } else if (ch === ',') {
      items.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  items.push(buf);
  return items;
}

function coerce(raw: string | undefined): FrontmatterValue {
  if (raw === undefined) return '';
  let v = raw.trim();
  // Require at least two characters so a lone quote (`"`), whose first and
  // last char are the same, isn't mistaken for an empty quoted string.
  if (
    v.length >= 2 &&
    ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
  ) {
    return v.slice(1, -1);
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  // Coerce base-10 numeric scalars to Number, matching the YAML 1.2 core-schema
  // int/float resolution (including leading-zero decimals like `01234`).
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d*\.\d+$/.test(v)) return Number(v);
  return v;
}
