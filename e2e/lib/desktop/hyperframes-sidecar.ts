import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  bootstrapSidecarProcess,
  isCurrentSidecarLauncher,
  readCurrentSidecarStamp,
  SidecarFactory,
} from '@open-design/sidecar';
import {
  SIDECAR_MESSAGES,
  type DesktopRenderFramesInput,
} from '@open-design/sidecar-proto';
import { PNG } from 'pngjs';

const capturePath = process.env.OD_TEST_CAPTURED_FRAME_DOCUMENT;
const dataRoot = process.env.OD_TEST_SIDECAR_DATA_ROOT;
const runtimeRoot = process.env.OD_TEST_SIDECAR_RUNTIME_ROOT;
if ([capturePath, dataRoot, runtimeRoot].some((value) => value == null || value.length === 0)) {
  throw new Error('HyperFrames desktop fixture paths are required');
}

const stamp = readCurrentSidecarStamp();
const resources = {
  dataRoot: dataRoot!,
  ownerPid: null,
  port: 0,
  runtimeRoot: runtimeRoot!,
};
if (isCurrentSidecarLauncher() && await bootstrapSidecarProcess(stamp, resources)) {
  process.exit(0);
}

const framePng = solidPng(320, 180);
const client = SidecarFactory.create({
  handlers: {
    async [SIDECAR_MESSAGES.RENDER_FRAMES](rawInput) {
      const input = rawInput as DesktopRenderFramesInput;
      await Promise.all([
        mkdir(input.outputDir, { recursive: true }),
        writeFile(capturePath!, input.html, 'utf8'),
      ]);
      for (let frame = 0; frame < 3; frame += 1) {
        await writeFile(
          join(input.outputDir, `frame-${String(frame).padStart(8, '0')}.png`),
          framePng,
        );
      }
      return {
        duration: 0.1,
        fps: 30,
        frameCount: 3,
        framePattern: join(input.outputDir, 'frame-%08d.png'),
        height: 180,
        ok: true,
        width: 320,
      };
    },
  },
  lifecycle: {
    async start() {
      return { pid: process.pid };
    },
    status(runtime) {
      return {
        capabilities: { frameRenderer: true },
        pid: runtime.pid,
        state: 'running',
        updatedAt: new Date().toISOString(),
        url: null,
        windowVisible: false,
      };
    },
    async stop() {},
  },
});

await client.start();
await client.waitUntilStopped();

function solidPng(width: number, height: number): Buffer {
  const image = new PNG({ width, height });
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data[offset] = 16;
    image.data[offset + 1] = 37;
    image.data[offset + 2] = 63;
    image.data[offset + 3] = 255;
  }
  return PNG.sync.write(image);
}
