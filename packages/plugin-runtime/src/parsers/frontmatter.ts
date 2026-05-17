// Minimal YAML front-matter parser. Mirrors the subset accepted by
// `apps/daemon/src/frontmatter.ts` so the plugin-runtime package can decode
// SKILL.md frontmatter without leaving the pure-TS contract layer. Handles:
//
// - scalar strings / numbers / booleans / null
// - block-literal (|) strings
// - inline arrays (`[a, b, c]`)
// - dash-prefixed arrays of scalars or single-line objects
//
// Anything more exotic (anchors, flow-style nested objects, multi-line
// folded scalars) is out of scope; SKILL.md authors should add an
// `open-design.json` sidecar for richer metadata instead.

type FrontmatterScalar = string | number | boolean | null;
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

    while (stack.length > 1 && indent <= (stack[stack.length - 1]?.indent ?? -1)) {
      stack.pop();
    }
    const top = stack[stack.length - 1];
    if (!top) throw new Error('frontmatter parser stack invariant violated');
    const line = raw.slice(indent);

    if (line.startsWith('- ')) {
      const value = line.slice(2).trim();
      let container = top.container;
      if (!Array.isArray(container)) {
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
      stack.push({ indent, container: top.container[key] as FrontmatterObject, key });
      i++;
      continue;
    }

    if (val === '|' || val === '|-' || val === '>' || val === '>-') {
      const collected: string[] = [];
      const childIndent = indent + 2;
      i++;
      while (i < lines.length) {
        const next = lines[i] ?? '';
        if (/^\s*$/.test(next)) {
          collected.push('');
          i++;
          continue;
        }
        const nIndent = next.match(/^\s*/)?.[0].length ?? 0;
        if (nIndent < childIndent) break;
        collected.push(next.slice(childIndent));
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
      top.container[key] = val
        .slice(1, -1)
        .split(',')
        .map((s) => coerce(s.trim()))
        .filter((v): v is FrontmatterValue => v !== '');
      i++;
      continue;
    }

    if (Array.isArray(top.container)) throw new Error('frontmatter object container expected');
    top.container[key] = coerce(val);
    i++;
  }

  return root;
}

function coerce(raw: string | undefined): FrontmatterValue {
  if (raw === undefined) return '';
  const v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d*\.\d+$/.test(v)) return Number(v);
  return v;
}
