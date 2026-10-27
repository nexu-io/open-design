import { createServer } from 'node:http';

/** Local Messages fixture: holds incomplete tool arguments until explicitly released. */
export async function createAnthropicToolProvider(toolName: string, input: Record<string, string>) {
  const target = input.file_path ?? input.filePath;
  if (!target) throw new Error('Messages fixture requires a target file path');
  let releaseArguments!: () => void;
  const released = new Promise<void>(resolve => { releaseArguments = resolve; });
  let signalStarted!: () => void;
  const started = new Promise<void>(resolve => { signalStarted = resolve; });
  const timing = { argumentsStartedAt: 0, argumentsDoneAt: 0 };
  const requests: Array<{ path: string; userAgent: string; tools: string[]; model: string }> = [];
  let sentTool = false;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    const tools: string[] = (body.tools ?? []).map((tool: { name: string }) => tool.name);
    requests.push({ path: req.url ?? '', userAgent: String(req.headers['user-agent'] ?? ''), tools, model: body.model });
    if (req.url?.includes('count_tokens')) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ input_tokens: 100 }));
      return;
    }
    if (!req.url?.startsWith('/v1/messages')) { res.statusCode = 404; res.end(); return; }
    const message = {
      id: `msg_${requests.length}`, type: 'message', role: 'assistant', model: body.model,
      content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 1 },
    };
    if (!body.stream) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ...message, content: [{ type: 'text', text: 'Long file test' }], stop_reason: 'end_turn' }));
      return;
    }
    res.setHeader('content-type', 'text/event-stream');
    res.flushHeaders();
    const send = (event: Record<string, unknown>) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    send({ type: 'message_start', message });
    // Capability probes may also call Messages. Only the acceptance prompt
    // can consume the write; otherwise a probe steals the held tool response.
    const write = !sentTool && tools.includes(toolName) && JSON.stringify(body.messages).includes(target);
    if (write) {
      sentTool = true;
      const json = JSON.stringify(input);
      const split = Math.floor(json.length / 2);
      send({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_long_write', name: toolName, input: {} } });
      timing.argumentsStartedAt = Date.now();
      send({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: json.slice(0, split) } });
      signalStarted();
      await released;
      timing.argumentsDoneAt = Date.now();
      send({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: json.slice(split) } });
    } else {
      send({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
      send({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'LONG_WRITE_DONE' } });
    }
    send({ type: 'content_block_stop', index: 0 });
    send({ type: 'message_delta', delta: { stop_reason: write ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 100 } });
    send({ type: 'message_stop' });
    res.end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No Messages fixture port');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`, started, timing, requests, releaseArguments,
    async close(): Promise<void> {
      releaseArguments();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}
