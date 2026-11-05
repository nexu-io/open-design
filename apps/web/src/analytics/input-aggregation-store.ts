export interface InputAggregationStore {
  read(): Promise<unknown>;
  write(snapshot: unknown): Promise<void>;
  close(): void;
}

/** Copy, read back, then remove the source. A crash between steps is safe to retry. */
export async function migrateInputAggregationStore(source: Pick<InputAggregationStore, 'read'> & { remove(): Promise<void> }, target: InputAggregationStore) {
  let snapshot = await source.read();
  if (snapshot === undefined) return;
  if (snapshot && typeof snapshot === 'object' && (snapshot as { version?: number }).version === 1) {
    snapshot = { ...snapshot, version: 2, collecting: [], rawPending: [], completed: [], nextSendAt: Date.now() + 3_600_000 };
  }
  const canonical = (value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('invalid legacy input snapshot');
    return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
  };
  const existing = await target.read();
  // Never merge divergent stores: that can resurrect acknowledged facts or double-count a source.
  if (existing !== undefined && canonical(existing) !== canonical(snapshot)) throw new Error('conflicting input stores');
  if (existing === undefined) await target.write(snapshot);
  if (canonical(await target.read()) !== canonical(snapshot)) throw new Error('input migration verification failed');
  await source.remove();
}

/** Keep the same atomic snapshot semantics, but cross IPC with changed small records only. */
export function nativeInputAggregationStore(scope: string, bridge: NonNullable<OpenDesignHostBridge['inputTelemetry']>, release: () => void): InputAggregationStore {
  // shortcut: Diffing still scans the full queue; use engine deltas if large-backlog CPU becomes material.
  let saved = new Map<string, string>();
  const records = (snapshot: unknown) => {
    const value = snapshot as Record<string, unknown>;
    const { collecting, rawPending, active, pending, completed, ...meta } = value;
    const result = new Map<string, string>([['meta', JSON.stringify(meta)], ['completed', JSON.stringify(completed)]]);
    for (const [kind, rows] of Object.entries({ collecting, rawPending, active, pending })) {
      if (!Array.isArray(rows)) throw new Error('invalid input state');
      for (const row of rows) result.set(`${kind}:${row.event_id}`, JSON.stringify(row));
    }
    return result;
  };
  return {
    read: async () => {
      saved = new Map(await bridge.read(scope));
      if (!saved.size) return undefined;
      const state = { ...JSON.parse(saved.get('meta')!), completed: JSON.parse(saved.get('completed')!),
        collecting: [], rawPending: [], active: [], pending: [] } as Record<string, unknown>;
      for (const [key, text] of saved) {
        const kind = key.split(':')[0]!;
        if (['collecting', 'rawPending', 'active', 'pending'].includes(kind)) (state[kind] as unknown[]).push(JSON.parse(text));
      }
      return state;
    },
    write: async snapshot => {
      const next = records(snapshot), put = [...next].filter(([k, v]) => saved.get(k) !== v), drop = [...saved.keys()].filter(k => !next.has(k));
      if (put.length || drop.length) await bridge.write(scope, put, drop);
      saved = next;
    },
    close: release,
  };
}

/** One local trial owner per destination/installation; never steal a live writer's checkpoint. */
export async function openInputAggregationStore(scope: string): Promise<InputAggregationStore> {
  let release!: () => void;
  const lifetime = new Promise<void>(resolve => { release = resolve; });
  await new Promise<void>((resolve, reject) => {
    void navigator.locks.request(`od-input-aggregation:${scope}`, { signal: AbortSignal.timeout(2000) }, async lock => {
      if (!lock) { reject(new Error('aggregation owner unavailable')); return; }
      resolve(); await lifetime;
    }).catch(reject);
  });
  const native = getOpenDesignHost()?.inputTelemetry;
  let db: IDBDatabase;
  try {
    db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('od-input-aggregation-poc', 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('snapshots'); };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onblocked = () => reject(new Error('aggregation database blocked'));
    });
  } catch (error) { release(); throw error; }
  db.onversionchange = () => { db.close(); release(); };
  const legacy: InputAggregationStore & { remove(): Promise<void> } = {
    read: () => new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readonly');
      const request = tx.objectStore('snapshots').get(scope);
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    }),
    write: snapshot => new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite', { durability: 'strict' });
      tx.objectStore('snapshots').put(snapshot, scope);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    }),
    close: () => { db.close(); release(); },
    remove: () => new Promise<void>((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite', { durability: 'strict' });
      tx.objectStore('snapshots').delete(scope);
      tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error);
    }),
  };
  if (!native) return legacy;
  const target = nativeInputAggregationStore(scope, native, release);
  try {
    await migrateInputAggregationStore(legacy, target);
    db.close();
    return target;
  } catch (error) { db.close(); release(); throw error; }
}
import { getOpenDesignHost, type OpenDesignHostBridge } from '@open-design/host';

