import { ensureRuntime, snapshotExportExpectation } from '../hyperframes.ts';
import type { ExportExpectation } from './export-spec.ts';

// Resolve the runtime only when an export is requested. Packaged MCP discovery
// must still work before dependencies have been installed in the data directory.
export async function exportExpectation(dataDirectory: string, snapshot: string): Promise<ExportExpectation> {
  return snapshotExportExpectation(await ensureRuntime(dataDirectory), snapshot);
}
