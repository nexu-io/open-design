import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { assertMotionExport } from '../../src/artifacts/motion-delivery.js';
import { generateMedia } from '../../src/media/index.js';
import { mediaTaskErrorFromFailure } from '../../src/media/task-error.js';

// Exercise the real Motion classification and native child-process adapter.
// Container/audio decoding has separate coverage in motion-audio-delivery.test;
// this replay neither starts a browser nor encodes a new video.
vi.mock('../../src/artifacts/motion-delivery.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/artifacts/motion-delivery.js')>(),
  assertMotionExport: vi.fn(),
}));

// All 451 merged progress lines from real task 3ce7338a-7227-48bb-91fb-453cfe35142c.
// Only the temporary absolute path, renderJobId and compositionHash were replaced.
// Stream assignments/chunking below are replay variants, not original provenance.
const badProgress = await readFile(new URL('../fixtures/hyperframes-main-readiness-timeout.sanitized.txt', import.meta.url), 'utf8');
const warningPrefix = '[WARN] Render completed capture with correctness warnings ';
const timeoutCode = 'sub_timeline_readiness_timeout';
const scriptCode = 'sub_timeline_script_failure';

describe('Motion native HyperFrames readiness', () => {
  let root: string;
  let projectsRoot: string;
  const envKeys = ['OD_MEDIA_ALLOW_STUBS', 'OD_HYPERFRAMES_BIN', 'OD_NODE_BIN', 'HYPERFRAMES_BROWSER_PATH'] as const;
  const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-hyperframes-readiness-'));
    projectsRoot = path.join(root, 'projects');
    process.env.OD_MEDIA_ALLOW_STUBS = '1';
    process.env.OD_NODE_BIN = process.execPath;
    process.env.HYPERFRAMES_BROWSER_PATH = '/explicit/replay-browser';
    vi.mocked(assertMotionExport).mockClear();
  });

  afterEach(async () => {
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    await rm(root, { recursive: true, force: true });
  });

  async function prepareReplay(log: string, stream: 'stdout' | 'stderr', motion = true) {
    const compRel = 'motion-source/film';
    const compDir = path.join(projectsRoot, 'project-1', compRel);
    await mkdir(compDir, { recursive: true });
    await writeFile(path.join(compDir, 'hyperframes.json'), '{}');
    await writeFile(path.join(compDir, 'meta.json'), '{}');
    await writeFile(path.join(compDir, 'index.html'), `<!doctype html>
${motion ? '<meta name="od-motion-output" content="video"><meta name="od-motion-audio" content="silent"><link rel="alternate" type="video/mp4" href="../../film.mp4">' : ''}
<main data-composition-id="main" data-duration="12" data-width="320" data-height="180"><aside data-composition-id="static-label" data-no-timeline></aside></main>
<script>window.__timelines={main:gsap.timeline({paused:true}).to({}, {duration:12}, 0)};</script>`);
    const logPath = path.join(root, 'replay.log');
    await writeFile(logPath, log);
    const fakeCli = path.join(root, 'fake-hyperframes.mjs');
    await writeFile(fakeCli, `
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
const log = await readFile(${JSON.stringify(logPath)}, 'utf8');
const target = process.${stream};
const other = process.${stream === 'stdout' ? 'stderr' : 'stdout'};
const start = log.indexOf(${JSON.stringify(warningPrefix)});
const points = start < 0 ? [7] : [start + 3, start + ${warningPrefix.length + 22}, log.indexOf('warningCodes', start) + 27];
let offset = 0;
for (const end of points) {
  target.write(log.slice(offset, end));
  // The other stream must not complete or corrupt a partially received JSON line.
  other.write('[Browser:WARN] replay interleaving\\r\\n');
  await setTimeout(10);
  offset = end;
}
target.write(log.slice(offset));
// Put the evidence well outside the daemon's stderr tail and finish with no LF.
for (let i = 0; i < 100; i++) target.write('later capture diagnostic ' + i + '\\r\\n');
target.write('final diagnostic without newline');
await writeFile(process.argv[process.argv.indexOf('--output') + 1], 'replayed-video-bytes');
`);
    process.env.OD_HYPERFRAMES_BIN = fakeCli;
    const output = path.join(projectsRoot, 'project-1', 'film.mp4');
    await writeFile(output, 'previous-delivery');
    return {
      output,
      args: {
        projectRoot: root, projectsRoot, projectId: 'project-1', surface: 'video' as const,
        model: 'hyperframes-html', output: 'film.mp4', compositionDir: compRel,
      },
    };
  }

  it.each([
    [timeoutCode, 'stdout', false], [timeoutCode, 'stderr', true],
    [scriptCode, 'stdout', true], [scriptCode, 'stderr', false],
  ] as const)('rejects %s on %s with onProgress=%s despite exit 0', async (code, stream, withProgress) => {
    const log = badProgress.replaceAll(timeoutCode, code);
    const { args, output } = await prepareReplay(log, stream);
    const progress: string[] = [];
    const error = await generateMedia({ ...args, ...(withProgress ? { onProgress: (line: string) => progress.push(line) } : {}) })
      .then(() => undefined, (failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect(mediaTaskErrorFromFailure(error, { model: args.model }).message).toContain(code);
    expect(String(error)).toContain('00000000-0000-4000-8000-000000000001');
    expect(assertMotionExport).not.toHaveBeenCalled();
    expect(await readFile(output, 'utf8')).toBe('previous-delivery');
    if (withProgress) {
      expect(progress).toContainEqual(expect.stringContaining(warningPrefix));
      expect(progress).toContain('final diagnostic without newline');
    }
  });

  it.each([
    ['normal static hold and no-timeline child', '[initSession:screenshot] pollSubCompositionTimelines complete (ready)\n', true],
    ['ordinary console warnings and asset 404', '[Browser:WARN] deprecated API\n[non-blocking] Failed to load resource: 404\n', true],
    ['other correctness warning', `${warningPrefix}{"renderJobId":"other","warningCodes":["media_readiness_timeout"]}\n`, true],
    ['unrelated JSON with the same code', `[Browser:ERROR] ${warningPrefix}{"warningCodes":["${timeoutCode}"]}\n`, true],
    ['malformed logger JSON', `${warningPrefix}{"warningCodes":["${timeoutCode}"]\n`, true],
    ['legacy HyperFrames with readiness warning', badProgress, false],
  ] as const)('preserves success for %s', async (_name, log, motion) => {
    const { args, output } = await prepareReplay(log, 'stderr', motion);
    await expect(generateMedia(args)).resolves.toMatchObject({ name: 'film.mp4', usedStubFallback: false });
    expect(await readFile(output, 'utf8')).toBe('replayed-video-bytes');
    expect(assertMotionExport).toHaveBeenCalledTimes(motion ? 1 : 0);
  });
});
