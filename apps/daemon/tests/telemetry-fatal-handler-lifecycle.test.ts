import type http from 'node:http';
import { describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

describe('daemon fatal telemetry handler lifecycle', () => {
  it('removes process-wide fatal handlers when the server closes', async () => {
    const uncaughtBaseline = process.listenerCount('uncaughtException');
    const rejectionBaseline = process.listenerCount('unhandledRejection');
    const started = await startServer({ port: 0, returnServer: true }) as {
      server: http.Server;
      shutdown?: () => Promise<void> | void;
    };

    expect(process.listenerCount('uncaughtException')).toBe(uncaughtBaseline + 1);
    expect(process.listenerCount('unhandledRejection')).toBe(rejectionBaseline + 1);

    await Promise.resolve(started.shutdown?.());
    await new Promise<void>((resolve, reject) => {
      started.server.close((error) => error ? reject(error) : resolve());
    });

    expect(process.listenerCount('uncaughtException')).toBe(uncaughtBaseline);
    expect(process.listenerCount('unhandledRejection')).toBe(rejectionBaseline);
  });
});
