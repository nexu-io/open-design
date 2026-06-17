import { createServer } from 'node:net';

import type { ToolsDevPortAllocation } from './types.ts';

export async function allocateToolsDevPorts(): Promise<ToolsDevPortAllocation> {
  const [daemonPort, webPort] = await Promise.all([reserveFreePort(), reserveFreePort()]);
  if (daemonPort.port === webPort.port) {
    await Promise.all([daemonPort.release(), webPort.release()]);
    return await allocateToolsDevPorts();
  }
  let released = false;
  return {
    daemonPort: daemonPort.port,
    webPort: webPort.port,
    async release() {
      if (released) return;
      released = true;
      await Promise.all([daemonPort.release(), webPort.release()]);
    },
  };
}

async function reserveFreePort(): Promise<{ port: number; release: () => Promise<void> }> {
  const server = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => resolveListen());
  });
  const address = server.address();
  if (address == null || typeof address === 'string') {
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => (error == null ? resolveClose() : rejectClose(error)));
    });
    throw new Error('failed to allocate a local TCP port');
  }
  let released = false;
  return {
    port: address.port,
    async release() {
      if (released) return;
      released = true;
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error == null ? resolveClose() : rejectClose(error)));
      });
    },
  };
}
