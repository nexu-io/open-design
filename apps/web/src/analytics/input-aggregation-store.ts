export interface InputAggregationStore {
  read(): Promise<unknown>;
  write(snapshot: unknown): Promise<void>;
  close(): void;
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
  // shortcut: Trials use isolated profiles; migrate pending IndexedDB facts before enabling on existing profiles.
  if (native) return nativeInputAggregationStore(scope, native, release);
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
  return {
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
  };
}
import { getOpenDesignHost, type OpenDesignHostBridge } from '@open-design/host';

