import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const [scenario, directory, ...args] = process.argv.slice(2);
if (args.includes('--version')) { console.log('0.0.36-test'); process.exit(0); }
if (args[0] === 'model') {
  console.log(JSON.stringify({ source: args[1] === 'preset' ? 'preset' : 'remote', data: [{ id: 'deepseek-v4-flash', name: 'Test model' }] }));
  process.exit(0);
}
const log = (value: unknown) => appendFileSync(join(directory!, 'ledger.jsonl'), `${JSON.stringify(value)}\n`);
const send = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`);
const session = 'oc-durable-continuation';
const cursor = { version: 1, userMessageId: 'user-1', assistantMessageId: 'assistant-tool', toolResultsCommitted: true };
const error = (id: number, data: unknown) => send({ jsonrpc: '2.0', id, error: {
  code: -32600, message: 'opencode compaction continuation ended before prompt completion', data,
} });
const incomplete = {
  kind: 'opencode_continuation_incomplete', code: 'OPENCODE_COMPACTION_CONTINUATION_INCOMPLETE',
  runtime: 'opencode', phase: 'post_tool_resume', retryable: false, openCodeSessionId: session, continuation: cursor,
};
const update = (value: unknown) => send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'acp-1', update: value } });
let loaded = false;
const tool = () => {
  update({ sessionUpdate: 'tool_call', toolCallId: 'write-once', title: 'Write', kind: 'edit',
    status: 'in_progress', rawInput: { file_path: 'result.txt', content: 'once' } });
  if (scenario !== 'pending') update({ sessionUpdate: 'tool_call_update', toolCallId: 'write-once', status: 'completed',
    content: [{ type: 'content', content: { type: 'text', text: 'written' } }] });
};
createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line);
  log({ method: request.method, params: request.params, pid: process.pid });
  const result = (value: unknown) => send({ jsonrpc: '2.0', id: request.id, result: value });
  switch (request.method) {
    case 'initialize':
      result({ protocolVersion: 1, agentCapabilities: { loadSession: true,
        ...(scenario === 'legacy' ? {} : { _meta: { 'com.open-design.nativeSessionContinue': { version: 1 } } }) } });
      break;
    case 'session/new':
      result({ sessionId: 'acp-1', openCodeSessionId: session });
      break;
    case 'session/load':
      loaded = true;
      if (scenario === 'missing') {
        send({ jsonrpc: '2.0', id: request.id, error: { code: -32600, message: 'session gone',
          data: { kind: 'resume_failed', retryable: true } } });
      } else result({ sessionId: 'acp-1', openCodeSessionId: scenario === 'mismatch' ? 'wrong-session' : session });
      break;
    case 'session/set_model': case 'session/set_config_option': result({}); break;
    case 'session/prompt':
      appendFileSync(join(directory!, 'tool-executions'), 'write\n');
      writeFileSync(join(directory!, 'original-pid'), String(process.pid));
      tool();
      error(request.id, scenario === 'legacy' ? { kind: 'opencode_prompt_error' } : incomplete);
      break;
    case '_session/continue': {
      const previousPid = Number(readFileSync(join(directory!, 'original-pid'), 'utf8'));
      let previousAlive = false;
      try { process.kill(previousPid, 0); previousAlive = true; } catch { /* Expected after teardown. */ }
      if (!loaded || previousAlive || JSON.stringify(request.params.continuation) !== JSON.stringify(cursor) || 'prompt' in request.params) {
        send({ jsonrpc: '2.0', id: request.id, error: { code: -32600, message: 'unsafe continuation' } });
        break;
      }
      if (scenario === 'limit') { tool(); error(request.id, incomplete); break; }
      update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Recovered final reply.' } });
      result({ stopReason: 'end_turn' });
      break;
    }
  }
}).on('close', () => process.exit(0));
