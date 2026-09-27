import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { AutomaticDiagnosticSource, LogSource } from '@open-design/diagnostics';

interface Offset { size: number; ino: number; birthtime: number }
interface ConsentState { enabled: boolean; since: number; offsets: Record<string, Offset> }

/** File watermarks prevent a later opt-in from backfilling text produced while opted out. */
export class DiagnosticConsentFence {
  needsBaseline = false;
  private state: ConsentState;
  private readonly file: string;
  constructor(directory: string, enabled: boolean) {
    this.file = join(directory, 'consent.json');
    try {
      this.state = JSON.parse(readFileSync(this.file, 'utf8')) as ConsentState;
      if (typeof this.state.enabled !== 'boolean' || !Number.isFinite(this.state.since) || !this.state.offsets || typeof this.state.offsets !== 'object') throw new Error('invalid consent fence');
    } catch {
      // A first install or corrupt fence must not retroactively upload old log contents.
      this.state = { enabled, since: Date.now(), offsets: {} };
      this.needsBaseline = enabled;
    }
    this.change(enabled);
    this.persist();
  }
  private persist(): void {
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.state), { mode: 0o600 });
    renameSync(`${this.file}.tmp`, this.file);
  }
  change(enabled: boolean): boolean {
    if (this.state.enabled === enabled) return false;
    this.state = { enabled, since: Date.now(), offsets: {} };
    this.persist();
    this.needsBaseline = enabled;
    return true;
  }
  async baseline(sources: LogSource[]): Promise<void> {
    const generation = this.state;
    for (const source of sources) {
      if (this.state !== generation || !generation.enabled) return;
      try {
        const info = await stat(source.absolutePath);
        generation.offsets[source.absolutePath] = { size: info.size, ino: info.ino, birthtime: info.birthtimeMs };
      } catch { /* a future file will be admitted only if created after the boundary */ }
    }
    if (this.state === generation) { this.persist(); this.needsBaseline = false; }
  }
  async apply(sources: LogSource[]): Promise<AutomaticDiagnosticSource[]> {
    const result: AutomaticDiagnosticSource[] = [];
    for (const source of sources) {
      const info = await stat(source.absolutePath).catch(() => null);
      const offset = this.state.offsets[source.absolutePath];
      if (!this.state.enabled) result.push({ ...source, omitReason: 'consent_disabled' });
      else if (info && offset && info.ino === offset.ino && info.birthtimeMs === offset.birthtime) {
        result.push({ ...source, startOffset: offset.size });
      } else if (info && info.birthtimeMs >= this.state.since) result.push(source);
      else result.push({ ...source, omitReason: 'pre_consent_source' });
    }
    return result;
  }
}
