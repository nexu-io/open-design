import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  extractFromMessage,
  listMemoryEntries,
  readMemoryConfig,
  writeMemoryConfig,
} from '../src/memory.js';

let dataDir = '';

beforeEach(async () => {
  dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-memory-default-'));
});

afterEach(async () => {
  await fsp.rm(dataDir, { recursive: true, force: true });
});

describe('chat auto-extraction default', () => {
  it('defaults chatExtractionEnabled to OFF when no config exists', async () => {
    const cfg = await readMemoryConfig(dataDir);
    expect(cfg.enabled).toBe(true);
    expect(cfg.chatExtractionEnabled).toBe(false);
    // Injection-side hooks stay on: memory the user typed still reaches
    // the prompt; only the extraction pipelines are retired.
    expect(cfg.profileEnabled).toBe(true);
  });

  it('defaults chatExtractionEnabled to OFF for configs written before the flag existed', async () => {
    await fsp.mkdir(path.join(dataDir, 'memory'), { recursive: true });
    await fsp.writeFile(
      path.join(dataDir, 'memory', '.config.json'),
      JSON.stringify({ enabled: true }),
    );
    const cfg = await readMemoryConfig(dataDir);
    expect(cfg.chatExtractionEnabled).toBe(false);
  });

  it('writes nothing for marker-looking chat messages under the default config', async () => {
    // Real production false positives from the retired regex pack: the
    // progressive-aspect "我在…" and the form round-trip both minted junk
    // "user location" / "user goal" entries.
    const changed = await extractFromMessage(
      dataDir,
      '别问了，给我在首屏补一张决定性 hero 图，直接开做：',
    );
    expect(changed).toEqual([]);
    expect(await listMemoryEntries(dataDir)).toEqual([]);
  });

  it('still honors an explicit opt-in', async () => {
    await writeMemoryConfig(dataDir, { chatExtractionEnabled: true });
    const changed = await extractFromMessage(dataDir, '记住：主色永远用品牌绿');
    expect(changed.length).toBeGreaterThan(0);
  });

  it('round-trips an explicit opt-in through writeMemoryConfig', async () => {
    await writeMemoryConfig(dataDir, { chatExtractionEnabled: true });
    expect((await readMemoryConfig(dataDir)).chatExtractionEnabled).toBe(true);
    // Patching an unrelated flag must not silently re-enable extraction.
    await writeMemoryConfig(dataDir, { verifyEnabled: false });
    expect((await readMemoryConfig(dataDir)).chatExtractionEnabled).toBe(true);
    await writeMemoryConfig(dataDir, { chatExtractionEnabled: false });
    expect((await readMemoryConfig(dataDir)).chatExtractionEnabled).toBe(false);
  });
});
