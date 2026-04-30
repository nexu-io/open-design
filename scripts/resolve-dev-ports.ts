import net from 'node:net';

const HOST = '127.0.0.1';
const DEFAULT_PORT_SEARCH_RANGE = 50;

export interface PortSearchOptions {
  host?: string;
  searchRange?: number;
}

export interface ResolveDevPortsOptions extends PortSearchOptions {
  daemonStart?: number;
  appStart?: number;
  appLabel?: string;
}

export interface ResolvedDevPorts {
  daemonPort: number;
  appPort: number;
}

export function isPortFree(port: number, host = HOST): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

export async function findFreePort(
  start: number,
  label: string,
  { host = HOST, searchRange = DEFAULT_PORT_SEARCH_RANGE }: PortSearchOptions = {},
): Promise<number> {
  for (let port = start; port < start + searchRange; port += 1) {
    if (await isPortFree(port, host)) return port;
  }
  throw new Error(
    `[dev:all] could not find a free ${label} port near ${start} (tried ${searchRange})`,
  );
}

export async function resolveDevPorts({
  daemonStart = 7456,
  appStart = 5173,
  appLabel = 'app',
  host = HOST,
  searchRange = DEFAULT_PORT_SEARCH_RANGE,
}: ResolveDevPortsOptions = {}): Promise<ResolvedDevPorts> {
  const daemonPort = await findFreePort(daemonStart, 'daemon', {
    host,
    searchRange,
  });
  const appPort = await findFreePort(appStart, appLabel, {
    host,
    searchRange,
  });

  return { daemonPort, appPort };
}
