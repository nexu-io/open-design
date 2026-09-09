/**
 * Unit tests for the one-shot OD Next default adoption. Hermetic: every test
 * runs against a fresh mkdtemp() data root, so none of them can touch a real
 * install.
 *
 * Two properties carry the whole feature and each has its own case here:
 *
 *   1. An installation that saved a mode under the opt-in switch is started
 *      on the default once, whatever that mode was.
 *   2. It happens exactly once. A user who turns the switch off afterwards
 *      finds it off on every later boot — including the boot right after the
 *      adoption, and including a fresh install that had nothing to clear.
 *
 * The second property is the one worth guarding: without the marker, or with
 * a marker written only when something was actually cleared, the migration
 * would eat the user's next opt-out instead of their previous one.
 *
 * @see apps/daemon/src/migration/od-next-default-on.ts
 */
import * as fs from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import * as os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readAppConfig } from '../src/app-config.js';
import { migrateOdNextDefaultOnSync } from '../src/migration/index.js';
import { readOdNextRolloutControlStatus } from '../src/strategies/od-next/rollout.js';

const MARKER = '.od-next-default-on';

interface CapturingLogger {
  info(message: string): void;
  warn(message: string): void;
  readonly entries: { level: 'info' | 'warn'; message: string }[];
}

function makeLogger(): CapturingLogger {
  const entries: { level: 'info' | 'warn'; message: string }[] = [];
  return {
    entries,
    info: (m) => entries.push({ level: 'info', message: m }),
    warn: (m) => entries.push({ level: 'warn', message: m }),
  };
}

let dataDir: string;

function configPath(): string {
  return path.join(dataDir, 'app-config.json');
}

function writeConfig(body: unknown): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(body, null, 2), 'utf8');
}

function readConfigRaw(): string {
  return fs.readFileSync(configPath(), 'utf8');
}

function markerExists(): boolean {
  return fs.existsSync(path.join(dataDir, MARKER));
}

/** One boot of a daemon that carries this migration. */
function boot(logger = makeLogger()) {
  return { result: migrateOdNextDefaultOnSync({ dataDir, logger }), logger };
}

beforeEach(() => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), 'od-next-default-on-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe('migrateOdNextDefaultOnSync', () => {
  it('clears an opt-out saved under the opt-in switch', () => {
    writeConfig({ agentId: 'codex', odNextStrategyMode: 'off' });

    const { result } = boot();

    expect(result).toMatchObject({ status: 'cleared', clearedMode: 'off' });
    expect(markerExists()).toBe(true);
    expect(JSON.parse(readConfigRaw())).toEqual({ agentId: 'codex' });
  });

  it('leaves the installation reading the default afterwards', async () => {
    writeConfig({ odNextStrategyMode: 'off' });

    boot();

    const config = await readAppConfig(dataDir);
    expect(config.odNextStrategyMode).toBeUndefined();
    expect(readOdNextRolloutControlStatus({}, config)).toMatchObject({
      requestedMode: 'active',
      requestedModeSource: 'default',
      effectiveMode: 'active',
    });
  });

  it.each(['off', 'observe', 'active'])(
    'clears a saved %s, because the new build starts everyone on the default once',
    (mode) => {
      writeConfig({ odNextStrategyMode: mode });

      const { result } = boot();

      expect(result).toMatchObject({ status: 'cleared', clearedMode: mode });
      expect(JSON.parse(readConfigRaw())).toEqual({});
    },
  );

  it('never runs twice, so an opt-out made after the adoption survives a restart', async () => {
    writeConfig({ agentId: 'codex', odNextStrategyMode: 'off' });

    expect(boot().result.status).toBe('cleared');

    // The user turns the switch off again on the adopted build.
    writeConfig({ agentId: 'codex', odNextStrategyMode: 'off' });

    // Every later boot.
    for (let restart = 0; restart < 3; restart += 1) {
      expect(boot().result.status).toBe('already_adopted');
    }

    const config = await readAppConfig(dataDir);
    expect(config.odNextStrategyMode).toBe('off');
    expect(readOdNextRolloutControlStatus({}, config)).toMatchObject({
      requestedMode: 'off',
      requestedModeSource: 'app_config',
    });
  });

  it('marks a fresh install too, so its first opt-out is not eaten on the next boot', async () => {
    const { result } = boot();

    expect(result.status).toBe('nothing_to_clear');
    expect(markerExists()).toBe(true);
    // A fresh install has nothing to migrate, so nothing is created for it.
    expect(fs.existsSync(configPath())).toBe(false);

    writeConfig({ odNextStrategyMode: 'off' });
    expect(boot().result.status).toBe('already_adopted');
    expect((await readAppConfig(dataDir)).odNextStrategyMode).toBe('off');
  });

  it('leaves every other setting byte-identical, including keys this build does not know', () => {
    const body = {
      agentId: 'codex',
      customInstructions: 'keep my tone',
      odNextStrategyMode: 'off',
      someKeyFromANewerBuild: { nested: [1, 2, 3] },
      designSystemId: 'brand-x',
    };
    writeConfig(body);

    boot();

    const after = JSON.parse(readConfigRaw()) as Record<string, unknown>;
    const { odNextStrategyMode: _dropped, ...expected } = body;
    expect(after).toEqual(expected);
    // Key order is part of "did not disturb the file".
    expect(Object.keys(after)).toEqual(Object.keys(expected));
  });

  it('does not materialise defaults the user never saved', () => {
    // Going through writeAppConfig would add a telemetry block here, because
    // its read path fills that default in. An upgrade step must not decide
    // settings the user has not touched.
    writeConfig({ agentId: 'codex', odNextStrategyMode: 'off' });

    boot();

    expect(JSON.parse(readConfigRaw())).not.toHaveProperty('telemetry');
  });

  it.skipIf(process.platform === 'win32')(
    'keeps the config file permissions it found',
    () => {
      // The file can hold agent API keys through `agentCliEnv`. A settings save
      // already resets its mode, but the user asked for that write; an upgrade
      // must not be what widens permissions on a file holding someone's key.
      writeConfig({ odNextStrategyMode: 'off' });
      fs.chmodSync(configPath(), 0o600);

      expect(boot().result.status).toBe('cleared');

      expect(fs.statSync(configPath()).mode & 0o777).toBe(0o600);
    },
  );

  it('leaves no temporary file behind', () => {
    writeConfig({ odNextStrategyMode: 'off' });

    boot();

    expect(fs.readdirSync(dataDir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('does not rewrite a config file it cannot parse', () => {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(configPath(), '{not valid json', 'utf8');

    const { result, logger } = boot();

    expect(result.status).toBe('nothing_to_clear');
    expect(readConfigRaw()).toBe('{not valid json');
    expect(markerExists()).toBe(true);
    expect(logger.entries.some((e) => e.level === 'warn')).toBe(true);
  });

  it('does not rewrite a config file whose body is not an object', () => {
    writeConfig([1, 2, 3]);

    const { result } = boot();

    expect(result.status).toBe('nothing_to_clear');
    expect(JSON.parse(readConfigRaw())).toEqual([1, 2, 3]);
  });

  it('leaves the saved mode alone when the marker cannot be written', () => {
    writeConfig({ odNextStrategyMode: 'off' });
    const logger = makeLogger();

    // Without a marker the clear would not be a one-time event, so it must not
    // happen at all. Missing one installation's adoption is a miss; clearing
    // with no marker would undo that user's next opt-out on the following boot.
    const result = migrateOdNextDefaultOnSync({
      dataDir,
      logger,
      writeMarker: () => {
        throw new Error('ENOSPC: simulated');
      },
    });

    expect(result.status).toBe('failed');
    expect(JSON.parse(readConfigRaw())).toEqual({ odNextStrategyMode: 'off' });
    expect(markerExists()).toBe(false);
    expect(logger.entries.some((e) => e.level === 'warn')).toBe(true);

    // And the next boot still gets its chance.
    expect(boot().result).toMatchObject({ status: 'cleared', clearedMode: 'off' });
  });

  it('does not create a data directory it was not given a reason to touch beyond the marker', () => {
    const missing = path.join(dataDir, 'not-yet');

    const result = migrateOdNextDefaultOnSync({ dataDir: missing, logger: makeLogger() });

    expect(result.status).toBe('nothing_to_clear');
    expect(fs.existsSync(path.join(missing, MARKER))).toBe(true);
    expect(fs.existsSync(path.join(missing, 'app-config.json'))).toBe(false);
  });
});
