import { createInterface } from 'node:readline';
import { rpc, mcpRegistry } from '../mcp.ts';
import { WorkspaceStore } from '../workspace.ts';
const store = new WorkspaceStore(), connection = { selection: {} }, registry = mcpRegistry('legacy');
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  if (!line.trim()) continue;
  const response = await rpc(JSON.parse(line), store, registry, connection);
  if (response) process.stdout.write(JSON.stringify(response) + '\n');
}
