// Minimal YAML front-matter parser. Handles the subset used by SKILL.md in
// our examples: scalar strings/numbers/booleans, block-literal (|) strings,
// and flat arrays ("- foo"). Keeps the daemon dep-free. If you need real
// YAML (nested objects, flow-style, anchors), swap for `yaml` or `js-yaml`.

export function parseFrontmatter(src) {
  const text = src.replace(/^﻿/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return { data: {}, body: text };
  const [, yaml, body] = match;
  return { data: parseYamlSubset(yaml), body };
}

function parseYamlSubset(src) {
  const lines = src.split(/\r?\n/);
  const root = {};
  const stack = [{ indent: -1, container: root, key: null }];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    if (/^\s*(#.*)?$/.test(raw)) {
      i++;
      continue;
    }
    const indent = raw.match(/^\s*/)[0].length;

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const top = stack[stack.length - 1];
    const line = raw.slice(indent);

    // Array item
    if (line.startsWith('- ')) {
      const value = line.slice(2).trim();
      let container = top.container;
      if (!Array.isArray(container)) {
        // Convert the pending key's value to an array on first `-`.
        const parent = stack[stack.length - 2];
        if (parent && top.key) {
          parent.container[top.key] = [];
          container = parent.container[top.key];
          top.container = container;
        } else {
          i++;
          continue;
        }
      }
      if (value.includes(':')) {
        const obj = {};
        const colonIdx = value.indexOf(':');
        const key = value.slice(0, colonIdx).trim();
        const valRaw = value.slice(colonIdx + 1).trim();
        if (valRaw) obj[key] = coerce(valRaw);
        container.push(obj);
        stack.push({ indent, container: obj, key: null });
      } else {
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
    const key = kv[1].trim();
    const val = kv[2];

    if (val === '' || val === undefined) {
      top.container[key] = {};
      stack.push({ indent, container: top.container[key], key });
      i++;
      continue;
    }

    if (val === '|' || val === '|-' || val === '>' || val === '>-') {
      const collected = [];
      const childIndent = indent + 2;
      i++;
      while (i < lines.length) {
        const next = lines[i];
        if (/^\s*$/.test(next)) {
          collected.push('');
          i++;
          continue;
        }
        const nIndent = next.match(/^\s*/)[0].length;
        if (nIndent < childIndent) break;
        collected.push(next.slice(childIndent));
        i++;
      }
      top.container[key] = collected.join('\n').trimEnd();
      continue;
    }

    if (val === '[]') {
      top.container[key] = [];
      i++;
      continue;
    }

    if (val.startsWith('[') && val.endsWith(']')) {
      top.container[key] = val
        .slice(1, -1)
        .split(',')
        .map((s) => coerce(s.trim()))
        .filter((v) => v !== '');
      i++;
      continue;
    }

    top.container[key] = coerce(val);
    i++;
  }

  return root;
}

function coerce(raw) {
  if (raw === undefined) return '';
  let v = raw.trim();
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
