import { withStandaloneTransaction } from "./transaction.js";

export type StandaloneMaintenanceLeaseOptions = Readonly<{ timeoutMs?: number }>;

/** Acquisition has a bounded wait; ownership itself lasts until release or
 * process death. No heartbeat/TTL or stale-file deletion can steal this guard. */
export function withStandaloneMaintenanceLock<T>(root: string, operation: () => Promise<T>,
  options: StandaloneMaintenanceLeaseOptions = {},
): Promise<T> {
  return withStandaloneTransaction(root, "maintenance", operation, options.timeoutMs ?? 10_000);
}
