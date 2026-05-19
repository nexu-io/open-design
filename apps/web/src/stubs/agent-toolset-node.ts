// Browser stub — replaces @anthropic-ai/sdk/tools/agent-toolset/node in the
// web bundle via turbopack.resolveAlias. Prevents Turbopack from statically
// tracing node:fs / node:child_process into the browser bundle. The daemon
// imports the real Node.js implementation at runtime.

function notBrowser(): never {
  throw new Error('@anthropic-ai/sdk agent toolset requires Node.js — not available in browser environments');
}

export function betaAgentToolset20260401(): never { return notBrowser(); }
export function resolvePath(): never { return notBrowser(); }
export function betaBashTool(): never { return notBrowser(); }
export function betaReadTool(): never { return notBrowser(); }
export function betaWriteTool(): never { return notBrowser(); }
export function betaEditTool(): never { return notBrowser(); }
export function betaGlobTool(): never { return notBrowser(); }
export function betaGrepTool(): never { return notBrowser(); }
export function setupSkills(): never { return notBrowser(); }
export function resolveSkillVersion(): never { return notBrowser(); }
export function extractSkillArchive(): never { return notBrowser(); }
export class BashSession { constructor() { notBrowser(); } }
