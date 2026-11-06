import { createServer } from 'node:http';

/** Chat Completions fixture for real Vela/OpenCode; no account or provider budget. */
export async function createAmrToolProvider() {
  type Gate = ReturnType<typeof prepareWrite>;
  let pending: Gate | undefined;
  const requests: Array<{ path: string; tools: string[]; model?: string }> = [];
  function prepareWrite(target: string, content: string) {
    let releaseArguments!: () => void;
    const released = new Promise<void>(resolve => { releaseArguments = resolve; });
    let signalStarted!: () => void;
    const started = new Promise<void>(resolve => { signalStarted = resolve; });
    return {
      target, sent: false, started, released, releaseArguments, signalStarted,
      timing: { argumentsStartedAt: 0, argumentsDoneAt: 0 },
      arguments: JSON.stringify({ patchText: `*** Begin Patch\n*** Add File: ${target}\n${content.replace(/\n$/, '').split('\n').map(line => '+' + line).join('\n')}\n*** End Patch` }),
    };
  }
  const server = createServer(async (req, res) => {
    const pathname = req.url?.split('?')[0] ?? '';
    if (pathname.endsWith('/models')) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'gpt-5.4-mini', object: 'model', owned_by: 'local' }] }));
      return;
    }
    if (!pathname.endsWith('/chat/completions')) { res.statusCode = 404; res.end(); return; }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const tools: string[] = (body.tools ?? []).map((tool: { function?: { name: string } }) => tool.function?.name);
    requests.push({ path: pathname, tools, model: body.model });
    if (!body.stream) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id: 'local', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: 'Long file test' }, finish_reason: 'stop' }] }));
      return;
    }
    res.setHeader('content-type', 'text/event-stream');
    res.flushHeaders();
    const send = (delta: Record<string, unknown>, finish_reason: string | null = null) => res.write(`data: ${JSON.stringify({ id: 'local', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
    const gate = pending;
    // Vela model probes and OpenCode title calls must not consume the held tool.
    if (gate && !gate.sent && tools.includes('apply_patch') && JSON.stringify(body.messages).includes(gate.target)) {
      gate.sent = true;
      const split = Math.floor(gate.arguments.length / 2);
      gate.timing.argumentsStartedAt = Date.now();
      send({ role: 'assistant', tool_calls: [{ index: 0, id: `amr_write_${requests.length}`, type: 'function', function: { name: 'apply_patch', arguments: gate.arguments.slice(0, split) } }] });
      gate.signalStarted();
      await gate.released;
      gate.timing.argumentsDoneAt = Date.now();
      send({ tool_calls: [{ index: 0, function: { arguments: gate.arguments.slice(split) } }] });
      send({}, 'tool_calls');
    } else {
      send({ role: 'assistant', content: 'LONG_WRITE_DONE' });
      send({}, 'stop');
    }
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No AMR fixture port');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`, requests,
    prepareWrite(target: string, content: string) {
      pending?.releaseArguments();
      pending = prepareWrite(target, content);
      return pending;
    },
    async close() {
      pending?.releaseArguments();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}
