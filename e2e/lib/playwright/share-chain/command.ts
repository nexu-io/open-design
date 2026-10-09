import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { resolve } from 'node:path';
import { runShareChainProbe } from './probe.js';

/** Called only by the approved Playwright auxiliary command, never at import time. */
export async function runShareChainProbeCommand(args: string[]): Promise<void> {
  if (args[0] !== '--execute' || process.env.SHARE_CHAIN_DISPATCHED !== '1') {
    console.error('PREPARED ONLY. Requires later explicit dispatch: SHARE_CHAIN_DISPATCHED=1 ... playwright.ts share-chain-probe --execute <real-url> <evidence-directory>');
    process.exitCode = 2;
    return;
  }
  const [_, url, output] = args;
  const cdp = process.env.SHARE_CHAIN_CDP;
  const webOrigin = process.env.SHARE_CHAIN_WEB_ORIGIN;
  const namespace = process.env.SHARE_CHAIN_NAMESPACE;
  if (!url || !output || !cdp || !webOrigin || !namespace || namespace === 'default' || !stdin.isTTY) {
    throw new Error('Need URL, new evidence directory, SHARE_CHAIN_CDP, independently configured SHARE_CHAIN_WEB_ORIGIN, isolated SHARE_CHAIN_NAMESPACE, and interactive terminal. No defaults or fixture fallback.');
  }
  const readline = createInterface({ input: stdin, output: stdout });
  try {
    const steps = await runShareChainProbe({
      url, cdp, webOrigin, outputDir: resolve(output),
      ...(process.env.SHARE_CHAIN_PG_SERVICE ? { pgService: process.env.SHARE_CHAIN_PG_SERVICE } : {}),
      checkpoint: async instruction => { await readline.question(`${instruction}\nPress Enter after the UI action (this is NOT a verdict): `); },
    });
    console.log(steps.map(step => `${step.step}. ${step.verdict} — ${step.title}`).join('\n'));
    process.exitCode = steps.some(step => step.verdict === 'FAIL') ? 1 : steps.some(step => step.verdict === 'UNKNOWN') ? 2 : 0;
  } finally { readline.close(); }
}
