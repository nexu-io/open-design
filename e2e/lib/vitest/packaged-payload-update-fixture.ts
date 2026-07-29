import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { basename } from 'node:path';

export type PackagedPayloadUpdateFixture = {
  close: () => Promise<void>;
  info: {
    metadataUrl: string;
    payloadPath: string;
    payloadSha256: string;
    payloadUrl: string;
    version: string;
  };
};

export async function startPackagedPayloadUpdateFixture(options: {
  channel: 'beta' | 'nightly' | 'preview' | 'stable';
  payloadPath: string;
  platform: 'mac' | 'win';
  version: string;
}): Promise<PackagedPayloadUpdateFixture> {
  const payloadStat = await stat(options.payloadPath);
  if (!payloadStat.isFile() || payloadStat.size <= 0) {
    throw new Error(`payload update fixture requires a non-empty payload file: ${options.payloadPath}`);
  }
  const payloadSha256 = await sha256File(options.payloadPath);
  const payloadName = basename(options.payloadPath);
  const platformKey = options.platform === 'win' ? 'win' : 'mac';
  const arch = options.platform === 'win' ? 'x64' : 'arm64';
  const contentType = options.platform === 'win' ? 'application/x-7z-compressed' : 'application/zip';

  let origin = '';
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', origin).pathname;
    if (path === `/${options.channel}/latest/metadata.json`) {
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({
        betaNumber: betaNumber(options.version),
        betaVersion: options.version,
        channel: options.channel,
        generatedAt: new Date().toISOString(),
        platforms: {
          [platformKey]: {
            arch,
            artifacts: {
              payload: {
                contentType,
                name: payloadName,
                sha256Url: `${origin}/${options.channel}/versions/${options.version}/${payloadName}.sha256`,
                size: payloadStat.size,
                url: `${origin}/${options.channel}/versions/${options.version}/${payloadName}`,
              },
            },
            channel: options.channel,
            enabled: true,
            label: options.platform === 'win' ? 'Windows x64' : 'macOS arm64',
            platform: platformKey,
            platformKey,
            signed: false,
          },
        },
        version: 1,
      }));
      return;
    }

    if (path === `/${options.channel}/versions/${options.version}/${payloadName}.sha256`) {
      response.setHeader('content-type', 'text/plain; charset=utf-8');
      response.end(`${payloadSha256}  ${payloadName}\n`);
      return;
    }

    if (path === `/${options.channel}/versions/${options.version}/${payloadName}`) {
      response.setHeader('accept-ranges', 'bytes');
      response.setHeader('content-length', String(payloadStat.size));
      response.setHeader('content-type', contentType);
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      createReadStream(options.payloadPath).pipe(response);
      return;
    }

    response.statusCode = 404;
    response.end('not found');
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('payload update fixture did not bind to a TCP port');
  }
  origin = `http://127.0.0.1:${address.port}`;

  return {
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error == null ? resolveClose() : rejectClose(error)));
      }),
    info: {
      metadataUrl: `${origin}/${options.channel}/latest/metadata.json`,
      payloadPath: options.payloadPath,
      payloadSha256,
      payloadUrl: `${origin}/${options.channel}/versions/${options.version}/${payloadName}`,
      version: options.version,
    },
  };
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  hash.update(await readFile(path));
  return hash.digest('hex');
}

function betaNumber(version: string): number | null {
  const match = /-beta\.(\d+)$/.exec(version);
  return match?.[1] == null ? null : Number(match[1]);
}
