import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from '@babel/parser';
import { load } from 'cheerio';
import type { DeliverableQualityCheck } from '@open-design/contracts';
import { checkDeliverableSyntax } from './deliverable-syntax.js';

/** Only deterministic native-event misuse; absence of direct bindings is not an error. */
export function inspectPrototypeScripts(file: string, source: string): DeliverableQualityCheck[] {
  const scripts = /\.html?$/i.test(file)
    ? load(source)('script:not([src])').toArray().map(node => load(source)(node).text()) : [source];
  const checks: DeliverableQualityCheck[] = [];
  for (const script of scripts) {
    let ast: unknown;
    try { ast = parse(script, { sourceType: 'unambiguous' }); } catch { continue; }
    const nodes: Record<string, unknown>[] = [];
    const visit = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) { value.forEach(visit); return; }
      const node = value as Record<string, unknown>;
      if (typeof node.type === 'string') nodes.push(node);
      Object.values(node).forEach(visit);
    };
    visit(ast);
    // Shadowed bindings are not sufficiently certain for this narrow native rule.
    if (nodes.some(n => ['FunctionDeclaration', 'ClassDeclaration', 'ImportSpecifier', 'ImportDefaultSpecifier', 'ImportNamespaceSpecifier'].includes(String(n.type)) && ((n.id as {name?: string})?.name === 'document' || (n.local as {name?: string})?.name === 'document'))
      || nodes.some(n => n.type === 'VariableDeclarator' && (n.id as {name?: string})?.name === 'document')
      || nodes.some(n => Array.isArray(n.params) && n.params.some(p => (p as {name?: string})?.name === 'document'))) continue;
    for (const node of nodes) {
      const callee = node.callee as {type?:string; object?:{type?:string;name?:string}; property?:{name?:string;value?:string};computed?:boolean} | undefined;
      const args = node.arguments as Array<{value?: unknown}> | undefined;
      if (node.type === 'CallExpression' && callee?.type === 'MemberExpression'
        && callee.object?.type === 'Identifier' && callee.object.name === 'document'
        && (callee.computed ? callee.property?.value : callee.property?.name) === 'addEventListener' && args?.[0]?.value === 'hashchange') {
        checks.push({ id: `native-hashchange-${createHash('sha256').update(file).digest('hex')}-${checks.length}`, kind: 'static', status: 'fail', file,
          reason: 'hashchange_requires_window', expected: 'window.addEventListener(hashchange)', observed: 'document.addEventListener(hashchange)' });
      }
    }
  }
  return checks;
}

export interface PrototypeSnapshot { files: Map<string, Buffer>; hash: string; }
/** Serve a bounded immutable local snapshot. Symlinks, escapes and remote dependencies never load. */
export async function freezePrototypeSnapshot(projectRoot: string, entryFile: string, relatedPaths: readonly string[]): Promise<PrototypeSnapshot> {
  const root = await fs.realpath(projectRoot);
  const files = new Map<string, Buffer>();
  const queue = [entryFile, ...relatedPaths];
  let bytes = 0;
  while (queue.length) {
    const name = queue.shift()!;
    const normalized = path.posix.normalize(name.replaceAll('\\', '/')).replace(/^\.\//, '');
    if (files.has(normalized)) continue;
    if (path.isAbsolute(normalized) || normalized.startsWith('../')) throw new Error('snapshot_path_outside_project');
    const absolute = await fs.realpath(path.resolve(root, normalized));
    if (!absolute.startsWith(root + path.sep)) throw new Error('snapshot_path_outside_project');
    const stat = await fs.stat(absolute);
    if (!stat.isFile()) throw new Error('snapshot_unsupported_file');
    if (files.size >= 100 || bytes + stat.size > 8 * 1024 * 1024 || stat.size > 2 * 1024 * 1024) throw new Error('snapshot_limit');
    const content = await fs.readFile(absolute);
    bytes += content.length;
    if (files.size >= 100 || bytes > 8 * 1024 * 1024 || content.length > 2 * 1024 * 1024) throw new Error('snapshot_limit');
    files.set(normalized, content);
    if (/\.html?$/i.test(normalized)) {
      const $ = load(content.toString());
      $('[src],link[href]').each((_i, node) => {
        const ref = $(node).attr('src') ?? $(node).attr('href');
        if (ref && !/^(?:[a-z]+:|\/\/|#)/i.test(ref)) queue.push(path.posix.join(path.posix.dirname(normalized), ref.split(/[?#]/)[0]!));
      });
    } else if (/\.(?:m?js|css)$/i.test(normalized)) {
      for (const match of content.toString().matchAll(/(?:from\s*|import\s*\(|url\(\s*)['"](\.\.?\/[^'"]+)['"]/g)) {
        queue.push(path.posix.join(path.posix.dirname(normalized), match[1]!.split(/[?#]/)[0]!));
      }
    }
  }
  const digest = createHash('sha256');
  for (const [name, content] of [...files].sort(([a], [b]) => a.localeCompare(b))) digest.update(name).update('\0').update(content).update('\0');
  return { files, hash: digest.digest('hex') };
}


export interface PrototypeStaticInput {
  projectRoot: string; entryFile: string; relatedPaths?: readonly string[] | undefined; mode?: 'check' | 'snapshot';
}
export interface PrototypeStaticResult extends PrototypeSnapshot { checks: DeliverableQualityCheck[]; }
/** This filesystem/parser work runs in the terminable worker, never on the daemon event loop. */
export async function collectPrototypeStatic(input: PrototypeStaticInput): Promise<PrototypeStaticResult> {
  const frozen = await freezePrototypeSnapshot(input.projectRoot, input.entryFile, input.relatedPaths ?? []);
  if (input.mode === 'snapshot') return { ...frozen, checks: [] };
  const syntax = await checkDeliverableSyntax({ projectRoot: input.projectRoot, entryFile: input.entryFile,
    relatedPaths: [...frozen.files.keys()], contentOverrides: frozen.files });
  const checks: DeliverableQualityCheck[] = [{ id: 'syntax', kind: 'syntax',
    status: syntax.status === 'pass' ? 'pass' : syntax.status === 'repairable' ? 'fail' : 'incomplete',
    ...(syntax.status !== 'pass' ? { reason: syntax.status === 'repairable' ? 'syntax_error' : 'syntax_check_incomplete' } : {}) }];
  for (const [file, content] of frozen.files) if (/\.(?:html?|m?js)$/i.test(file)) checks.push(...inspectPrototypeScripts(file, content.toString()));
  return { ...frozen, checks };
}
