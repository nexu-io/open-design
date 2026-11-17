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

/** Preserve atomic snapshots while sending changed small records through the daemon API. */
export function inputRecordStore(scope: string, bridge: { read(scope: string): Promise<[string, string][]>; write(scope: string, put: [string, string][], drop: string[]): Promise<void> }, release: () => void): InputAggregationStore {
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
  let opened: IDBDatabase | null;
  try {
    opened = await new Promise<IDBDatabase | null>((resolve, reject) => {
      let absent = false;
      const request = indexedDB.open('od-input-aggregation-poc', 1);
      // Probe legacy data without creating a second store on new installations.
      request.onupgradeneeded = () => { absent = true; request.transaction?.abort(); };
      request.onerror = () => { if (absent) resolve(null); else reject(request.error); };
      request.onsuccess = () => resolve(request.result);
      request.onblocked = () => reject(new Error('aggregation database blocked'));
    });
  } catch (error) { release(); throw error; }
  const db = opened;
  if (!db) return daemonInputAggregationStore(scope, release);
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
  const target = daemonInputAggregationStore(scope, release);
  try {
    await migrateInputAggregationStore(legacy, target);
    db.close();
    return target;
  } catch (error) { db.close(); release(); throw error; }
}

/** Use the existing same-origin daemon transport; acknowledgement follows its transaction. */
export function daemonInputAggregationStore(scope: string, release: () => void): InputAggregationStore {
  let revision = 0;
  const request = async (body: Record<string, unknown>) => {
    const response = await fetch('/api/analytics/input-checkpoint', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, scope }),
      signal: AbortSignal.timeout(10_000), cache: 'no-store' });
    const receipt = response.ok ? await response.json() : null;
    if (receipt?.ok !== true || !Number.isSafeInteger(receipt.revision) || receipt.revision < 0) throw new Error('input checkpoint unavailable');
    return receipt;
  };
  return inputRecordStore(scope, {
    read: async () => {
      const receipt = await request({ op: 'read' }); const { records } = receipt;
      if (!Array.isArray(records) || records.some(row => !Array.isArray(row) || row.length !== 2 || row.some(value => typeof value !== 'string'))) throw new Error('invalid input checkpoint');
      revision = receipt.revision;
      return records as [string, string][];
    },
    write: async (_scope, put, drop) => {
      const receipt = await request({ op: 'write', put, drop, revision });
      if (receipt.revision !== revision + 1) throw new Error('invalid input checkpoint revision');
      revision = receipt.revision;
    },
  }, release);
}
