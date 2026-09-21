/**
 * A fake `vela` for the OD Next rounds that start a NEW process or a new task:
 * the cold-start build round, the form-answer round and the retry round. Each
 * scenario interrupts the round that matters with OpenCode's compaction
 * continuation failure after one committed tool write, then serves the
 * daemon's `_session/continue` exactly as `fake-vela-continuation.ts` does:
 * only once the previous process is gone, only on a loaded session, only with
 * the committed cursor, and never with a prompt.
 *
 * Scenarios (argv[0]):
 * - `cold-build`: the planning round yields no durable handle, so the build
 *   round is a fresh process on a Bundle; that round is interrupted.
 * - `answer`: the first round asks a `<question-form>`; the answered round
 *   (a new task continuing the session) is interrupted.
 * - `retry`: the first round fails outright; the user's retry (a new task)
 *   is interrupted.
 */
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
const durableSession = 'oc-durable-od-next';
const cursor = { version: 1, userMessageId: 'user-1', assistantMessageId: 'assistant-tool', toolResultsCommitted: true };
const incomplete = {
  kind: 'opencode_continuation_incomplete', code: 'OPENCODE_COMPACTION_CONTINUATION_INCOMPLETE',
  runtime: 'opencode', phase: 'post_tool_resume', retryable: false, openCodeSessionId: durableSession, continuation: cursor,
};
const update = (value: unknown) => send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'acp-1', update: value } });
const text = (value: string) => update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: value } });
const promptCountPath = join(directory!, 'prompt-count');
const promptCount = () => {
  try { return Number(readFileSync(promptCountPath, 'utf8')); } catch { return 0; }
};
let loaded = false;
const writeIndex = () => {
  appendFileSync(join(directory!, 'tool-executions'), 'write\n');
  update({ sessionUpdate: 'tool_call', toolCallId: 'write-index', title: 'Write', kind: 'edit',
    status: 'in_progress', rawInput: { file_path: 'index.html', content: '<!doctype html><title>Built</title>' } });
  update({ sessionUpdate: 'tool_call_update', toolCallId: 'write-index', status: 'completed',
    content: [{ type: 'content', content: { type: 'text', text: 'written' } }] });
};
const interrupt = (id: number) => {
  writeFileSync(join(directory!, 'original-pid'), String(process.pid));
  writeIndex();
  send({ jsonrpc: '2.0', id, error: {
    code: -32600, message: 'opencode compaction continuation ended before prompt completion', data: incomplete,
  } });
};
const promptText = (params: { prompt?: Array<{ type?: string; text?: string }> }) => (
  (params.prompt ?? []).filter((block) => block.type === 'text').map((block) => block.text ?? '').join('\n')
);
createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line);
  const result = (value: unknown) => send({ jsonrpc: '2.0', id: request.id, result: value });
  switch (request.method) {
    case 'initialize':
      log({ method: request.method, pid: process.pid });
      result({ protocolVersion: 1, agentCapabilities: { loadSession: true,
        _meta: { 'com.open-design.nativeSessionContinue': { version: 1 } } } });
      break;
    case 'session/new': {
      // The cold-build planning round leaves no durable handle behind, so the
      // build round cannot resume and starts a fresh process on a Bundle.
      const durable = !(scenario === 'cold-build' && promptCount() === 0);
      log({ method: request.method, pid: process.pid, durable });
      result({ sessionId: 'acp-1', ...(durable ? { openCodeSessionId: durableSession } : {}) });
      break;
    }
    case 'session/load':
      loaded = true;
      log({ method: request.method, pid: process.pid, sessionId: request.params?.sessionId });
      result({ sessionId: 'acp-1', openCodeSessionId: durableSession });
      break;
    case 'session/set_model': case 'session/set_config_option': result({}); break;
    case 'session/prompt': {
      const prompt = promptText(request.params ?? {});
      const index = promptCount();
      writeFileSync(promptCountPath, String(index + 1));
      log({ method: request.method, pid: process.pid, index, prompt });
      if (scenario === 'cold-build') {
        if (index === 0) {
          text('The plan is ready: one landing page in index.html.');
          result({ stopReason: 'end_turn' });
        } else {
          interrupt(request.id);
        }
      } else if (scenario === 'answer') {
        if (index === 0) {
          text('One choice first.\n<question-form id="od-next-amr-platform" title="Choose platform">'
            + '{"questions":[{"id":"platform","label":"Target platform","type":"radio",'
            + '"options":[{"label":"Desktop web","value":"desktop"}],"required":true}]}'
            + '</question-form>');
          result({ stopReason: 'end_turn' });
        } else {
          interrupt(request.id);
        }
      } else if (scenario === 'retry') {
        if (index === 0) {
          send({ jsonrpc: '2.0', id: request.id, error: {
            code: -32600, message: 'provider rejected the prompt', data: { kind: 'opencode_prompt_error' },
          } });
        } else {
          interrupt(request.id);
        }
      }
      break;
    }
    case '_session/continue': {
      const previousPid = Number(readFileSync(join(directory!, 'original-pid'), 'utf8'));
      let previousAlive = false;
      try { process.kill(previousPid, 0); previousAlive = true; } catch { /* Expected after teardown. */ }
      log({ method: request.method, pid: process.pid, loaded, previousAlive, hasPrompt: 'prompt' in (request.params ?? {}) });
      if (!loaded || previousAlive || JSON.stringify(request.params.continuation) !== JSON.stringify(cursor) || 'prompt' in request.params) {
        send({ jsonrpc: '2.0', id: request.id, error: { code: -32600, message: 'unsafe continuation' } });
        break;
      }
      text('Recovered and finished the page.');
      result({ stopReason: 'end_turn' });
      break;
    }
  }
}).on('close', () => process.exit(0));
