import { createServer } from 'node:http';

/** Holds an official Responses apply_patch input open until the consumer sees its file preview. */
export async function createCodexPatchProvider(input: string) {
  const argumentsJson = input;
  const userAgents: string[] = [];
  let releaseArguments!: () => void;
  const released = new Promise<void>((resolve) => { releaseArguments = resolve; });
  let signalStarted!: () => void;
  const started = new Promise<void>((resolve) => { signalStarted = resolve; });
  let first = true;
  const timing = { argumentsStartedAt: 0, argumentsDoneAt: 0 };
  const server = createServer(async (req, res) => {
    userAgents.push(String(req.headers['user-agent'] ?? ''));
    // Consume the request before replying; subsequent requests contain the real tool result.
    for await (const _ of req) { /* No developer credentials or request content are stored. */ }
    if (req.url === '/v1/models') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ data: [{ id: 'gpt-5.4' }] }));
      return;
    }
    if (req.method !== 'POST' || req.url !== '/v1/responses') {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader('content-type', 'text/event-stream');
    res.flushHeaders();
    const send = (event: Record<string, unknown>) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    send({ type: 'response.created', response: { id: 'resp-tools', status: 'in_progress', output: [] } });
    if (first) {
      first = false;
      const item = {
        type: 'custom_tool_call', id: 'fc-long-write', call_id: 'call-long-write',
        name: 'apply_patch', input: '', status: 'in_progress',
      };
      send({ type: 'response.output_item.added', output_index: 0, item });
      timing.argumentsStartedAt = Date.now();
      const split = Math.floor(argumentsJson.length / 2);
      const deltaType = 'response.custom_tool_call_input.delta';
      send({ type: deltaType, output_index: 0, item_id: item.id, call_id: item.call_id, delta: argumentsJson.slice(0, split) });
      signalStarted();
      await released;
      timing.argumentsDoneAt = Date.now();
      send({ type: deltaType, output_index: 0, item_id: item.id, call_id: item.call_id, delta: argumentsJson.slice(split) });
      send({ type: 'response.output_item.done', output_index: 0, item: {
        ...item, input: argumentsJson, status: 'completed',
      } });
    } else {
      const item = {
        type: 'message', id: 'msg-tools-done', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: 'LONG_WRITE_DONE', annotations: [] }],
      };
      send({ type: 'response.output_item.done', output_index: 0, item });
    }
    send({ type: 'response.completed', response: {
      id: 'resp-tools', status: 'completed', output: [],
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    } });
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('tool provider received no port');
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`, started, releaseArguments, timing, userAgents,
    async close(): Promise<void> {
      releaseArguments();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
