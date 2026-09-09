/**
 * One-shot adoption of the OD Next default.
 *
 * The Design Harness switch shipped opt-in: an installation that never
 * touched it had no saved mode, and `resolveRequestedMode` answered `off`.
 * The default is now `active`, so an installation with no saved mode adopts
 * OD Next on its next boot without any help from this module.
 *
 * What this module exists for is the installation that DOES have a saved
 * mode. `off` is a value the config carries, and it outranks the default in
 * every later release, so flipping the default alone leaves those users
 * behind. The product decision is that a new build starts every installation
 * on OD Next once, whatever the previous build left behind.
 *
 * "Once" is the whole design, and it is what the marker is for. Without it
 * the clear would run on every boot, and a user who turns the switch off
 * after adopting would find it back on after a restart — which is not a
 * default any more, it is a switch that does not work. So the marker is
 * written on the FIRST boot that runs this code, including a fresh install
 * with nothing to clear: from that moment on, whatever the config says is
 * the user's, permanently. Skipping the marker when there was nothing to
 * clear is the subtle version of the same bug, because the first opt-out
 * after that would be the thing the next boot cleared.
 *
 * The clear is a surgical rewrite of the raw JSON rather than a
 * `writeAppConfig` call, and that is deliberate. `writeAppConfig` reads
 * through `readAppConfig` first, so it drops every key this build does not
 * recognise and materialises the telemetry defaults into the file. Both are
 * fine as the side effect of a user changing a setting; neither is fine as
 * the side effect of an upgrade the user did not ask for. This touches one
 * key and leaves every other byte of the user's config alone.
 *
 * Sync by design: it runs at module import time in server.ts, before the
 * first request can read the config. `readAppConfig` is called per request,
 * so an async migration would race the first run of the session.
 *
 * This module has a shelf life, and it ends at a specific event: the release
 * that retires the Design Harness switch and stops `resolveRequestedMode`
 * from reading `odNextStrategyMode`. That key deciding the route is the only
 * reason this exists, so delete this module, its export, its call site and
 * its test IN THE SAME CHANGE that stops reading the key. Splitting the two
 * is wrong in both directions: removing this first leaves every installation
 * that upgrades during the gap on its old opt-out, and removing the key first
 * leaves this running as dead code against a value nothing consults.
 *
 * Keeping them together is also what makes a skipped-version upgrade safe. An
 * installation that saved `off` under the opt-in switch and does not update
 * until after this module is gone never gets its one-time clear — and does
 * not need one, because by then nothing reads what it saved.
 *
 * The marker file outlives the code and is meant to. It has no reader once
 * this module is gone, and clearing it would take a second one-time migration
 * carrying a second marker of its own, which is more machinery than a few
 * dozen stale bytes in a data directory are worth.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Written into the data root once this installation has adopted the default. */
const MARKER_FILE = '.od-next-default-on';

const CONFIG_FILE = 'app-config.json';

/** The one key this migration is allowed to touch. */
const MODE_KEY = 'odNextStrategyMode';

export type OdNextDefaultOnStatus =
  /** The marker was already there. Nothing was read and nothing was written. */
  | 'already_adopted'
  /** A saved mode was removed, so this installation now resolves to the default. */
  | 'cleared'
  /** No saved mode to remove (fresh install, unreadable config). Marker written. */
  | 'nothing_to_clear'
  /** The marker could not be written, so the clear was not attempted either. */
  | 'failed';

export interface OdNextDefaultOnResult {
  status: OdNextDefaultOnStatus;
  /** The mode that was removed, when one was. Diagnostic only. */
  clearedMode?: string;
  reason: string;
}

export interface MigrateOdNextDefaultOnOptions {
  /** Resolved current data root (RUNTIME_DATA_DIR). */
  dataDir: string;
  /** Optional logger. Defaults to console.log/console.warn. */
  logger?: {
    info(message: string): void;
    warn(message: string): void;
  };
  /**
   * Test seam, mirroring the one on `migrateLegacyDataDirSync`. The default
   * writes the marker with fs.writeFileSync; tests inject a function that
   * throws so the "marker failed, so do not clear" path can be exercised
   * without contriving a read-only directory, which behaves differently for
   * root and so cannot be relied on in every CI image. Production callers
   * should never pass this.
   * @internal
   */
  writeMarker?: (dataDir: string) => void;
}

function readConfigObject(
  file: string,
): { present: false } | { present: true; body: Record<string, unknown> } | { present: true; body: null } {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    // ENOENT is the fresh-install case and the only one worth being quiet
    // about. Anything else (EACCES, EISDIR) means the daemon cannot read its
    // own config, which every other reader will report far more loudly than
    // an upgrade step should.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { present: false };
    return { present: true, body: null };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { present: true, body: null };
    }
    return { present: true, body: parsed as Record<string, unknown> };
  } catch {
    return { present: true, body: null };
  }
}

/**
 * Same atomic shape `writeAppConfig` uses: temp file in place, then rename.
 *
 * The mode is carried across because a rename swaps the inode, and the file it
 * replaces can hold agent API keys through `agentCliEnv`. A settings save
 * already resets the mode, but the user asked for that write; nobody asked for
 * this one, so an upgrade must not be the thing that widens the permissions on
 * a file holding someone's key.
 */
function writeJsonAtomically(file: string, body: Record<string, unknown>): void {
  let mode: number | undefined;
  try {
    mode = fs.statSync(file).mode & 0o777;
  } catch {
    mode = undefined;
  }
  const tmp = `${file}.${process.pid}-${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(body, null, 2), 'utf8');
    if (mode !== undefined) fs.chmodSync(tmp, mode);
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

/**
 * Start this installation on the OD Next default, exactly once.
 *
 * Never throws. A boot-time upgrade step that can take the daemon down is
 * worse than one that leaves an installation on the mode it already had, and
 * the user can still work the switch either way.
 */
export function migrateOdNextDefaultOnSync(
  options: MigrateOdNextDefaultOnOptions,
): OdNextDefaultOnResult {
  const log = options.logger ?? {
    info: (m: string) => console.log(`[od-next-default-on] ${m}`),
    warn: (m: string) => console.warn(`[od-next-default-on] ${m}`),
  };

  const dataDir = path.resolve(options.dataDir);
  const marker = path.join(dataDir, MARKER_FILE);
  if (fs.existsSync(marker)) {
    return { status: 'already_adopted', reason: 'marker already present' };
  }

  // The marker goes down before the clear, so the "exactly once" promise
  // cannot be broken by a partial run: a marker with no clear costs one
  // installation its adoption, while a clear with no marker would undo the
  // user's next opt-out on the following boot. The first is a miss, the
  // second is the switch not working.
  const writeMarker = options.writeMarker ?? ((dir: string) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, MARKER_FILE), `${new Date().toISOString()}\n`, 'utf8');
  });
  try {
    writeMarker(dataDir);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`could not write ${MARKER_FILE}, leaving the saved mode alone: ${message}`);
    return { status: 'failed', reason: `marker write failed: ${message}` };
  }

  const configFile = path.join(dataDir, CONFIG_FILE);
  const config = readConfigObject(configFile);
  if (!config.present) {
    return { status: 'nothing_to_clear', reason: 'no config file' };
  }
  if (config.body === null) {
    // A config that cannot be read is already resolving to the default, so
    // there is nothing here to clear — and rewriting it would replace a file
    // the user may still be able to repair by hand.
    log.warn('config file is unreadable; leaving it untouched');
    return { status: 'nothing_to_clear', reason: 'config file unreadable' };
  }
  if (!Object.prototype.hasOwnProperty.call(config.body, MODE_KEY)) {
    return { status: 'nothing_to_clear', reason: 'no saved mode' };
  }

  const clearedMode = String(config.body[MODE_KEY]);
  const next = { ...config.body };
  delete next[MODE_KEY];
  try {
    writeJsonAtomically(configFile, next);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`could not clear the saved mode: ${message}`);
    return { status: 'failed', reason: `config write failed: ${message}`, clearedMode };
  }
  log.info(`cleared saved mode "${clearedMode}"; this installation now runs the default`);
  return { status: 'cleared', clearedMode, reason: 'saved mode cleared' };
}
