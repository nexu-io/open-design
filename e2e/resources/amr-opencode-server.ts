import { appendFileSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { continuationFrames, type RuntimeScenario } from './amr-continuation-frames.ts';

const port = Number(process.argv[process.argv.indexOf('--port') + 1]);
const scenario = process.env.OD_CONTRACT_SCENARIO as RuntimeScenario;
const ledger = process.env.OD_CONTRACT_LEDGER!;
const streams = new Set<ServerResponse>();
const record = (entry: Record<string, unknown>) => appendFileSync(ledger, `${JSON.stringify({ atNs: process.hrtime.bigint().toString(), ...entry })}\n`);
const server = createServer(async (req, res) => {
  const url = new URL(req.url!, 'http://127.0.0.1');
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
  record({ phase: 'request', method: req.method, path: url.pathname, body });
  res.on('finish', () => record({ phase: 'response-complete', method: req.method, path: url.pathname }));
  res.setHeader('Content-Type', 'application/json');
  if (url.pathname === '/global/health') return void res.end(JSON.stringify({ healthy: true, version: 'synthetic-contract-fixture' }));
  if (url.pathname === '/event') {
    res.setHeader('Content-Type', 'text/event-stream');
    res.flushHeaders();
    res.write('data: {"type":"server.connected","properties":{}}\n\n');
    streams.add(res);
    res.on('close', () => streams.delete(res));
    return;
  }
  if (url.pathname === '/session' || url.pathname === '/session/oc-contract-session') return void res.end(JSON.stringify({ id: 'oc-contract-session' }));
  if (url.pathname === '/session/oc-contract-session/prompt_async') {
    res.writeHead(204).end();
    const frames = continuationFrames(body.messageID ?? 'user-original', scenario);
    for (const frame of frames) {
      for (const stream of streams) stream.write(`data: ${JSON.stringify(frame)}\n\n`);
    }
    if (scenario !== 'write-stall') for (const stream of streams) stream.end();
    return;
  }
  if (url.pathname === '/session/oc-contract-session/abort') {
    for (const stream of streams) stream.end();
    return void res.end('true');
  }
  if (url.pathname === '/session/oc-contract-session/message') return void res.end(JSON.stringify([
    { info: { id: 'user-original', role: 'user' } }, { info: { id: 'user-continuation', role: 'user' } },
  ]));
  if (url.pathname === '/session/oc-contract-session/continue') {
    if (body.userMessageID !== 'user-continuation' || body.assistantMessageID !== 'assistant-continuation' || Object.keys(body).length !== 2) {
      res.writeHead(409).end('{"error":"cursor mismatch"}'); return;
    }
    res.end('{}');
    const sessionID = 'oc-contract-session';
    const info = { id: 'assistant-final', parentID: 'user-continuation', sessionID, role: 'assistant' };
    const frames = [
      { type: 'message.updated', properties: { info } },
      { type: 'message.part.updated', properties: { part: { id: 'final-text', sessionID, messageID: 'assistant-final', type: 'text', text: 'Continued without another Write.' } } },
      { type: 'message.part.updated', properties: { part: { id: 'final-step', sessionID, messageID: 'assistant-final', type: 'step-finish', reason: 'stop' } } },
      { type: 'session.idle', properties: { sessionID } },
    ];
    for (const frame of frames) for (const stream of streams) stream.write(`data: ${JSON.stringify(frame)}\n\n`);
    for (const stream of streams) stream.end();
    return;
  }
  res.writeHead(404).end(JSON.stringify({ error: 'unexpected fixture request' }));
});
server.listen(port, '127.0.0.1', () => process.stdout.write(`opencode server listening on http://127.0.0.1:${port}\n`));
function stop() { for (const stream of streams) stream.end(); server.close(() => process.exit(0)); server.closeAllConnections(); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
