import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

export type MockOpenAiRequest = {
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  method: string;
  path: string;
  receivedAt: string;
};

export type MockOpenAiServer = {
  baseUrl: string;
  close: () => Promise<void>;
  requests: () => MockOpenAiRequest[];
};

export type MockOpenAiServerOptions = {
  model: string;
  reply?: string;
};

export async function createMockOpenAiServer(options: MockOpenAiServerOptions): Promise<MockOpenAiServer> {
  const requests: MockOpenAiRequest[] = [];
  const reply = options.reply ?? 'ok';

  const server = createServer(async (req, res) => {
    const path = req.url ?? '/';
    const body = await readJsonBody(req);
    requests.push({
      body,
      headers: redactHeaders(req.headers),
      method: req.method ?? 'GET',
      path,
      receivedAt: new Date().toISOString(),
    });

    if (req.method === 'GET' && path === '/v1/models') {
      return sendJson(res, 200, {
        data: [{ id: options.model, object: 'model' }],
        object: 'list',
      });
    }

    if (req.method === 'POST' && path === '/v1/chat/completions') {
      return sendJson(res, 200, {
        choices: [
          {
            finish_reason: 'stop',
            index: 0,
            message: { content: reply, role: 'assistant' },
          },
        ],
        id: 'chatcmpl-e2e-smoke',
        model: options.model,
        object: 'chat.completion',
      });
    }

    return sendJson(res, 404, {
      error: {
        message: `unexpected mock OpenAI path: ${req.method ?? 'GET'} ${path}`,
        type: 'not_found',
      },
    });
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => resolveListen());
  });

  const address = server.address();
  if (address == null || typeof address === 'string') {
    await closeServer(server);
    throw new Error('mock OpenAI server did not receive a TCP port');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: () => closeServer(server),
    requests: () => requests.slice(),
  };
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(value));
}

function redactHeaders(headers: IncomingMessage['headers']): Record<string, string | string[] | undefined> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      key.toLowerCase() === 'authorization' || key.toLowerCase() === 'x-api-key' || key.toLowerCase() === 'api-key'
        ? '[REDACTED]'
        : value,
    ]),
  );
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => (error == null ? resolveClose() : rejectClose(error)));
  });
}
