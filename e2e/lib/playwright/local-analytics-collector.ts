import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { gunzipSync, inflateSync } from 'node:zlib';
import { assertAnalyticsPayloadPrivacy, type AnalyticsPrivacyOptions } from '../analytics/payload-privacy.js';

type CapturedRecord = {
  at: string;
  path: string;
  contentType: string;
  sha256: string;
  bodyBase64: string;
  decoded: unknown;
  decodeError: string | null;
};

type CapturedEvent = { event: string; properties?: Record<string, unknown>; timestamp?: string };

export async function startLocalAnalyticsCollector() {
  const records: CapturedRecord[] = [];
  const server = createServer(async (req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    res.setHeader('access-control-allow-headers', '*');
    res.setHeader('content-type', 'application/json');
    if (req.method === 'OPTIONS') { res.end('{}'); return; }
    const chunks: Buffer[] = [];
    for await (const part of req) chunks.push(Buffer.from(part));
    const body = Buffer.concat(chunks);
    let decoded: unknown = null;
    let decodeError: string | null = null;
    try {
      let bytes = body;
      if (bytes[0] === 31 && bytes[1] === 139) bytes = gunzipSync(bytes);
      else if (req.headers['content-encoding'] === 'deflate') bytes = inflateSync(bytes);
      const text = bytes.toString('utf8');
      if (text) {
        try { decoded = JSON.parse(text); }
        catch {
          const data = new URLSearchParams(text).get('data');
          if (!data) throw new Error('Unknown analytics encoding');
          decoded = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
        }
      }
    } catch (error) {
      decodeError = error instanceof Error ? error.message : 'Unknown encoding';
    }
    if (req.method === 'POST') records.push({
      at: new Date().toISOString(), path: req.url ?? '/',
      contentType: req.headers['content-type'] ?? '',
      sha256: createHash('sha256').update(body).digest('hex'),
      bodyBase64: body.toString('base64'), decoded, decodeError,
    });
    res.end(JSON.stringify({ status: 1, featureFlags: {}, errorsWhileComputingFlags: false, supportedCompression: [] }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing local collector address');

  function events(): CapturedEvent[] {
    return records.flatMap(record => {
      const value = record.decoded as { batch?: unknown[]; event?: unknown } | unknown[] | null;
      if (Array.isArray(value)) return value;
      if (value && typeof value === 'object') {
        if (Array.isArray(value.batch)) return value.batch;
        if ('event' in value) return [value];
      }
      return [];
    }) as CapturedEvent[];
  }

  return {
    host: `http://127.0.0.1:${address.port}`, records, events,
    auditPrivacy(options: AnalyticsPrivacyOptions) {
      return assertAnalyticsPayloadPrivacy(records, options);
    },
    async close() {
      server.closeIdleConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}
