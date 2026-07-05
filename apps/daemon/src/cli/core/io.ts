// @ts-nocheck
/** @module cli/core/io
 * Long-form input intake shared across domains: `--body/--body-file` and
 * `--prompt/--prompt-file` readers with `-` meaning stdin. This is the
 * embeddability contract that keeps heredoc/pipe-driven callers clean.
 * Foundation kernel: imports no sibling subdirectory.
 */

/**
 * Reads a memory body from `--body` (inline) or `--body-file` (path, or `-`
 * for stdin). Returns `undefined` when neither flag is present so callers can
 * distinguish "not provided" from an intentionally empty body. Used by both
 * the memory and automation domains.
 */
export async function readMemoryBodyFromFlags(flags) {
  if (typeof flags.body === 'string') return flags.body;
  if (typeof flags['body-file'] !== 'string') return undefined;
  const path = flags['body-file'];
  if (path === '-') {
    let body = '';
    for await (const chunk of process.stdin) body += chunk;
    return body;
  }
  const { readFile } = await import('node:fs/promises');
  return await readFile(path, 'utf8');
}

/**
 * Reads a prompt from `--prompt` (inline) or `--prompt-file` (path, or `-`
 * for stdin), preferring the inline form. Returns `null` when neither is
 * given. This is the long-prose intake used by the figma, brand, project,
 * and automation domains, per the repo's `--prompt-file <path|->` CLI rule.
 */
export async function readPromptFromFlags(flags) {
  if (typeof flags.prompt === 'string' && flags.prompt.length > 0) {
    return flags.prompt;
  }
  if (typeof flags['prompt-file'] === 'string' && flags['prompt-file'].length > 0) {
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
  return null;
}
