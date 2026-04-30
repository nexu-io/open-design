import net from 'node:net';

const HOST = '127.0.0.1';
const DEFAULT_PORT_SEARCH_RANGE = 50;

export function isPortFree(port, host = HOST) {
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
  start,
  label,
  { host = HOST, searchRange = DEFAULT_PORT_SEARCH_RANGE } = {},
) {
  for (let port = start; port < start + searchRange; port++) {
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
} = {}) {
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
