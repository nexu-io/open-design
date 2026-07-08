'use client';

// TEMPORARY dev/demo panel for understanding the Spec E resource core design
// (content-addressed blobs / manifests / versions / refs) and driving the
// consumer layer (list / share / pull). Deliberately self-contained: it imports
// no product code and only talks to the daemon's /api/resources/* endpoints
// (proxied by next.config rewrites, so no CORS). Disposable — delete this whole
// directory at cleanup, together with the tools-serve resource-hub fixture.

import type {
  PublicSnapshotResponse,
  ResourceDetailResponse,
  ResourceListResponse,
  ResourceSummary,
} from '@open-design/contracts';
import { useCallback, useEffect, useState } from 'react';

type Resource = ResourceSummary;
type Detail = ResourceDetailResponse;

async function api(path: string, method = 'GET'): Promise<unknown> {
  const res = await fetch(path, { method });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const code = typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : `http_${res.status}`;
    throw new Error(code);
  }
  return body;
}

export default function ResourcePanelPage(): React.ReactElement {
  const [resources, setResources] = useState<Resource[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [status, setStatus] = useState<string>('');
  const [shareKind, setShareKind] = useState('design_system');
  const [shareId, setShareId] = useState('');
  const [pullKind, setPullKind] = useState('design_system');
  const [pullId, setPullId] = useState('');
  const [viewSlug, setViewSlug] = useState('');
  const [publicSnap, setPublicSnap] =
    useState<PublicSnapshotResponse | null>(null);

  const refresh = useCallback(async () => {
    try {
      const body = (await api('/api/resources')) as ResourceListResponse;
      setResources(body.resources ?? []);
    } catch (error) {
      setStatus(`list failed: ${(error as Error).message}`);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const share = async () => {
    setStatus('sharing…');
    try {
      const r = (await api(
        `/api/resources/${encodeURIComponent(shareKind)}/${encodeURIComponent(shareId)}/share`,
        'POST',
      )) as { hubResourceId: string; version: number };
      setStatus(`shared -> ${r.hubResourceId} v${r.version}`);
      await refresh();
    } catch (error) {
      setStatus(`share failed: ${(error as Error).message}`);
    }
  };

  const pull = async (kind: string, id: string) => {
    setStatus('pulling…');
    try {
      const r = (await api(
        `/api/resources/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/pull`,
        'POST',
      )) as { alreadyOwned: boolean; version: number | null };
      setStatus(r.alreadyOwned ? 'already owned (no-op)' : `pulled v${r.version}`);
      await refresh();
    } catch (error) {
      setStatus(`pull failed: ${(error as Error).message}`);
    }
  };

  // Publish a resource's latest version as a PUBLIC snapshot, then prefill the
  // public viewer with the returned slug.
  const publishSnapshot = async (id: string) => {
    setStatus('publishing snapshot…');
    try {
      const r = (await api(
        `/api/resources/${encodeURIComponent(id)}/snapshot?name=${encodeURIComponent(
          `DevPanel ${id.slice(0, 6)}`,
        )}`,
        'POST',
      )) as { slug: string };
      setStatus(`snapshot published -> ${r.slug}`);
      setViewSlug(r.slug);
    } catch (error) {
      setStatus(`snapshot failed: ${(error as Error).message}`);
    }
  };

  // Read a public snapshot by slug — the UNAUTHENTICATED public plane (proxied
  // through the daemon to dodge CORS, but the hub call carries no principal).
  const viewPublic = async () => {
    setStatus('reading public snapshot…');
    try {
      const r = (await api(
        `/api/public-snapshots/${encodeURIComponent(viewSlug)}`,
      )) as PublicSnapshotResponse;
      setPublicSnap(r);
      setStatus(`public read ok: ${r.name}`);
    } catch (error) {
      setPublicSnap(null);
      setStatus(`public read failed: ${(error as Error).message}`);
    }
  };

  const inspect = async (id: string) => {
    try {
      setDetail(
        (await api(`/api/resources/${encodeURIComponent(id)}/detail`)) as ResourceDetailResponse,
      );
    } catch (error) {
      setStatus(`detail failed: ${(error as Error).message}`);
    }
  };

  return (
    <main style={{ fontFamily: 'ui-monospace, monospace', padding: 24, maxWidth: 900 }}>
      <h1>Resource panel <small style={{ color: '#999' }}>(temporary dev tool)</small></h1>

      <section style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '16px 0' }}>
        <div>
          <h3>Share (local → team)</h3>
          <input
            data-testid="share-kind"
            value={shareKind}
            onChange={(e) => setShareKind(e.target.value)}
            style={{ width: 130 }}
          />
          <input
            data-testid="share-id"
            placeholder="local id"
            value={shareId}
            onChange={(e) => setShareId(e.target.value)}
          />
          <button data-testid="share-btn" onClick={() => void share()}>share</button>
        </div>
        <div>
          <h3>Pull (team → local)</h3>
          <input
            data-testid="pull-kind"
            value={pullKind}
            onChange={(e) => setPullKind(e.target.value)}
            style={{ width: 130 }}
          />
          <input
            data-testid="pull-id"
            placeholder="hub resource id"
            value={pullId}
            onChange={(e) => setPullId(e.target.value)}
          />
          <button data-testid="pull-btn" onClick={() => void pull(pullKind, pullId)}>
            pull
          </button>
        </div>
      </section>

      <div data-testid="status" style={{ padding: 8, background: '#f4f4f4', minHeight: 20 }}>
        {status}
      </div>

      <h3>Team resources <button onClick={() => void refresh()}>refresh</button></h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
            <th>id</th><th>kind</th><th>owner</th><th>local</th><th></th>
          </tr>
        </thead>
        <tbody>
          {resources.map((r) => (
            <tr key={r.id} data-testid="resource-row" style={{ borderBottom: '1px solid #eee' }}>
              <td>{r.id}</td>
              <td>{r.kind}</td>
              <td>{r.ownerMemberId}</td>
              <td>{r.local ? `${r.local.role} v${r.local.lastSyncedVersion ?? '?'}` : '—'}</td>
              <td>
                <button onClick={() => void inspect(r.id)}>inspect</button>{' '}
                <button onClick={() => void pull(r.kind, r.id)}>pull</button>{' '}
                <button
                  data-testid="snapshot-btn"
                  onClick={() => void publishSnapshot(r.id)}
                >
                  snapshot
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section style={{ marginTop: 24 }}>
        <h3>Public snapshot <small style={{ color: '#999' }}>(no auth — slug only)</small></h3>
        <input
          data-testid="view-slug"
          placeholder="snapshot slug"
          value={viewSlug}
          onChange={(e) => setViewSlug(e.target.value)}
          style={{ width: 320 }}
        />
        <button data-testid="view-public-btn" onClick={() => void viewPublic()}>
          view public
        </button>
        {publicSnap && (
          <div data-testid="public-snap" style={{ marginTop: 12 }}>
            <p>
              <strong>{publicSnap.name}</strong> ({publicSnap.kind}) —{' '}
              <code>{publicSnap.slug}</code>
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left' }}><th>path</th><th>type</th><th>blob digest</th></tr>
              </thead>
              <tbody>
                {(publicSnap.manifest?.entries ?? []).map((e) => (
                  <tr key={e.path} data-testid="public-entry">
                    <td>{e.path}</td>
                    <td>{e.type}</td>
                    <td><code>{e.blobDigest ?? '—'}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detail && (
        <section data-testid="detail" style={{ marginTop: 24 }}>
          <h3>Detail: {detail.resource.id}</h3>
          <p>versions: {detail.versions.map((v) => `v${v.version}`).join(', ') || 'none'}</p>
          <p>manifest digest: <code>{detail.manifest?.digest ?? '—'}</code></p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}><th>path</th><th>type</th><th>blob digest</th></tr>
            </thead>
            <tbody>
              {(detail.manifest?.entries ?? []).map((e) => (
                <tr key={e.path}>
                  <td>{e.path}{e.executable ? ' *' : ''}</td>
                  <td>{e.type}</td>
                  <td><code>{e.blobDigest ?? '—'}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
