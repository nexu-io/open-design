// Shared fixtures for the agent-process specs and their stand-in daemon.
import { createHash } from 'node:crypto';

/** Deterministic, line-numbered prompt so any truncation changes the digest. */
export function fixturePrompt(bytes: number): string {
  let text = '';
  for (let line = 0; text.length < bytes; line += 1) {
    text += `request ${String(line).padStart(8, '0')}: keep the latest work, never revert it\n`;
  }
  return text.slice(0, bytes);
}

export function sha256(text: string | Buffer): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * A fake agent CLI (CommonJS, run by `node`). Never a real agent. Behaviour is
 * driven by env so one script covers every spec:
 *
 * - FAKE_AGENT_MARKER: JSON `{ pid, grandchildPid }` written once started.
 * - FAKE_AGENT_GRANDCHILD=1: spawn a long-lived child in the agent's group.
 * - FAKE_AGENT_IGNORE_SIGTERM=1: ignore SIGTERM (agent and grandchild), so only
 *   a SIGKILL escalation can end them.
 * - FAKE_AGENT_READ_DELAY_MS + FAKE_AGENT_RESULT: wait, then read stdin to EOF
 *   and write `{ bytes, sha256, stdinIsFile }` (cursor-agent takes ~10s before
 *   it reads its prompt).
 */
export const FAKE_AGENT_SOURCE = `
const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const env = process.env;
if (env.FAKE_AGENT_IGNORE_SIGTERM === '1') process.on('SIGTERM', () => {});
let grandchildPid = null;
if (env.FAKE_AGENT_GRANDCHILD === '1') {
  const grandchild = spawn(process.execPath, ['-e', env.FAKE_AGENT_IGNORE_SIGTERM === '1'
    ? "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"
    : 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  grandchildPid = grandchild.pid;
}
if (env.FAKE_AGENT_MARKER) {
  fs.writeFileSync(env.FAKE_AGENT_MARKER, JSON.stringify({ pid: process.pid, grandchildPid }));
}
if (env.FAKE_AGENT_RESULT) {
  setTimeout(() => {
    const stdinIsFile = fs.fstatSync(0).isFile();
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      const body = Buffer.concat(chunks);
      fs.writeFileSync(env.FAKE_AGENT_RESULT, JSON.stringify({
        bytes: body.length,
        sha256: crypto.createHash('sha256').update(body).digest('hex'),
        stdinIsFile,
      }));
      process.exit(0);
    });
  }, Number(env.FAKE_AGENT_READ_DELAY_MS || 0));
}
setInterval(() => {}, 1000);
`;
