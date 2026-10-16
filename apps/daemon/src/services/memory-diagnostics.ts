import { getHeapStatistics } from 'node:v8';
import type { AppVersionInfo } from '../app-version.js';

/** Local diagnostic evidence, not telemetry or an OOM detector. A stalled event
 * loop or fatal allocation can prevent the last sample from being written.
 * Keep identity and heap limit on every line: exported logs may contain only
 * the tail of a long-running session. Never include argv, paths or user data.
 */
export function startMemoryDiagnostics(appVersion: AppVersionInfo | null): () => void {
  const identity = {
    pid: process.pid,
    appVersion: appVersion?.version ?? null,
    channel: appVersion?.channel ?? null,
    nodeVersion: process.versions.node,
    electronVersion: process.versions.electron ?? null,
    v8Version: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
  };
  const sample = (event: 'startup' | 'sample') => {
    try {
      const memory = process.memoryUsage();
      console.info('[daemon-memory]', JSON.stringify({
        ...identity,
        event,
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        heapLimitBytes: getHeapStatistics().heap_size_limit,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
        rssBytes: memory.rss,
        externalBytes: memory.external,
        arrayBuffersBytes: memory.arrayBuffers,
      }));
    } catch {
      // Evidence collection must never fail startup or an otherwise healthy run.
    }
  };
  sample('startup');
  // One small record per minute; no file scanning, database reads, heap dump,
  // forced GC or network requests. Do not keep the process alive for diagnostics.
  const timer = setInterval(() => sample('sample'), 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
