// Executes tool calls parsed from the API model output.
// Read / Write / Bash are forwarded to the daemon's project endpoints;
// TodoWrite is a no-op (the parsed JSON is rendered as a todo card by the UI).

import type { ParsedToolCall } from './tool-call-parser';

export interface ToolResult {
  toolUseId: string;
  name: string;
  content: string;
  isError: boolean;
}

const MAX_TOOL_OUTPUT_BYTES = 100_000;
const MAX_LOOP_ROUNDS = 25;

let loopRound = 0;
export function resetToolLoopCounter(): void {
  loopRound = 0;
}
export function getToolLoopRound(): number {
  return loopRound;
}
export function isMaxRoundsReached(): boolean {
  return loopRound >= MAX_LOOP_ROUNDS;
}

async function readFile(
  baseUrl: string,
  projectId: string,
  filePath: string,
): Promise<string> {
  const encoded = encodeURIComponent(filePath);
  const resp = await fetch(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/files/${encoded}`, {
    headers: { 'Accept': 'text/plain, application/json' },
  });
  if (!resp.ok) {
    throw new Error(`Read failed: ${resp.status} ${await resp.text().catch(() => '')}`);
  }
  return resp.text();
}

async function writeFile(
  baseUrl: string,
  projectId: string,
  filePath: string,
  content: string,
): Promise<string> {
  const resp = await fetch(
    `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/files`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: filePath, content }),
    },
  );
  if (!resp.ok) {
    throw new Error(`Write failed: ${resp.status} ${await resp.text().catch(() => '')}`);
  }
  const body = await resp.json() as { file?: { name?: string } };
  return `File written: ${body.file?.name ?? filePath}`;
}

async function runBash(
  baseUrl: string,
  projectId: string,
  command: string,
  timeout: number,
): Promise<string> {
  const resp = await fetch(
    `${baseUrl}/api/projects/${encodeURIComponent(projectId)}/bash`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, timeout }),
    },
  );
  if (!resp.ok) {
    throw new Error(`Bash failed: ${resp.status} ${await resp.text().catch(() => '')}`);
  }
  const body = await resp.json() as { stdout?: string; stderr?: string; exitCode?: number };
  const out = body.stdout ?? '';
  const err = body.stderr ?? '';
  const parts: string[] = [];
  if (out) parts.push(out);
  if (err) parts.push(`[stderr]\n${err}`);
  if (!out && !err) parts.push(`(exit ${body.exitCode ?? 0})`);
  return parts.join('\n').slice(0, MAX_TOOL_OUTPUT_BYTES);
}

export async function executeToolCall(
  call: ParsedToolCall,
  baseUrl: string,
  projectId: string,
): Promise<ToolResult> {
  const toolUseId = `${call.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const name = call.name;

  try {
    let content: string;

    switch (name) {
      case 'Read': {
        const fp = typeof call.parameters.file_path === 'string'
          ? call.parameters.file_path
          : '';
        if (!fp) throw new Error('Read requires file_path');
        content = await readFile(baseUrl, projectId, fp);
        break;
      }
      case 'Write':
      case 'Edit': {
        const fp = typeof call.parameters.file_path === 'string'
          ? call.parameters.file_path
          : '';
        const ct = typeof call.parameters.content === 'string'
          ? call.parameters.content
          : JSON.stringify(call.parameters);
        if (!fp) throw new Error(`${name} requires file_path`);
        content = await writeFile(baseUrl, projectId, fp, ct);
        break;
      }
      case 'Bash': {
        const cmd = typeof call.parameters.command === 'string'
          ? call.parameters.command
          : '';
        if (!cmd) throw new Error('Bash requires command');
        const timeout = typeof call.parameters.timeout === 'number'
          ? call.parameters.timeout
          : 30_000;
        content = await runBash(baseUrl, projectId, cmd, timeout);
        break;
      }
      case 'TodoWrite':
        // TodoWrite is a virtual tool — the UI renders the todos from the
        // parsed JSON block. Nothing to execute.
        content = 'TodoWrite received.';
        break;
      default:
        content = `Unknown tool: ${name}`;
    }

    return { toolUseId, name, content, isError: false };
  } catch (err) {
    return {
      toolUseId,
      name,
      content: err instanceof Error ? err.message : String(err),
      isError: true,
    };
  }
}

export async function executeToolCalls(
  calls: ParsedToolCall[],
  baseUrl: string,
  projectId: string,
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  for (const call of calls) {
    results.push(await executeToolCall(call, baseUrl, projectId));
  }
  loopRound += 1;
  return results;
}

export function formatToolResultsAsXml(results: ToolResult[]): string {
  return results
    .map((r) => {
      const errorAttr = r.isError ? ' is_error="true"' : '';
      return `<tool_result${errorAttr} tool_call_id="${r.toolUseId}">\n${r.content}\n</tool_result>`;
    })
    .join('\n');
}
