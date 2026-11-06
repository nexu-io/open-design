import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { open, stat, appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// shortcut: Forgejo's pinned v4 action lacks archive:false; remove this adapter when upstream supports raw ZIPs.
export async function upload(filename, retention = 90) {
  const token = process.env.ACTIONS_RUNTIME_TOKEN;
  assert(token, 'Missing current-job artifact identity');
  const origin = new URL(process.env.ACTIONS_RESULTS_URL).origin;
  assert.equal(origin, 'https://code.powerformer.net');
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  const scope = claims.scp.split(' ').find(s => s.startsWith('Actions.Results:'))?.split(':');
  assert(scope?.length === 3 && scope[1] && scope[2], 'Missing artifact backend IDs');
  const ids = { workflowRunBackendId: scope[1], workflowJobRunBackendId: scope[2] };
  const name = path.basename(filename), size = (await stat(filename)).size;
  assert(name.endsWith('.zip') && size > 0 && Number.isInteger(retention) && retention >= 1 && retention <= 90);
  // Forgejo appends .zip to artifact download names.
  const artifactName = path.basename(filename, '.zip');
  const rpc = async (method, body) => {
    const r = await fetch(`${origin}/twirp/github.actions.results.api.v1.ArtifactService/${method}`, { method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert(r.ok, `Artifact ${method}: HTTP ${r.status}`); const value = await r.json(); assert(value.ok, `Artifact ${method} rejected`); return value;
  };
  const created = await rpc('CreateArtifact', { ...ids, name: artifactName, version: 4, expiresAt: new Date(Date.now() + retention * 86400000).toISOString() });
  const signed = new URL(created.signedUploadUrl);
  assert.equal(signed.origin, origin, 'Unexpected artifact storage host');
  const put = async (url, body, headers = {}) => {
    const r = await fetch(url, { method: 'PUT', redirect: 'error', headers: { 'x-ms-version': '2023-11-03', ...headers }, body });
    await r.body?.cancel(); assert(r.ok, `Artifact block upload: HTTP ${r.status}`);
  };
  const file = await open(filename, 'r'), hash = createHash('sha256'), blocks = [];
  try {
    for (let offset = 0; offset < size;) {
      const buffer = Buffer.alloc(Math.min(8 * 1024 * 1024, size - offset));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, offset); assert.equal(bytesRead, buffer.length);
      hash.update(buffer);
      const id = Buffer.from(String(blocks.length).padStart(8, '0')).toString('base64'); blocks.push(id);
      const url = new URL(signed); url.searchParams.set('comp', 'block'); url.searchParams.set('blockid', id);
      await put(url, buffer); offset += bytesRead;
    }
  } finally { await file.close(); }
  const commit = new URL(signed); commit.searchParams.set('comp', 'blocklist');
  await put(commit, '<?xml version="1.0" encoding="utf-8"?><BlockList>' + blocks.map(id => `<Latest>${id}</Latest>`).join('') + '</BlockList>', { 'Content-Type': 'application/xml', 'x-ms-blob-content-type': 'application/zip' });
  const digest = hash.digest('hex');
  const done = await rpc('FinalizeArtifact', { ...ids, name: artifactName, size: String(size), hash: 'sha256:' + digest });
  assert(/^\d+$/.test(String(done.artifactId)), 'Invalid artifact ID');
  const result = { id: String(done.artifactId), name, sha256: digest, size, retentionDays: retention };
  await writeFile(filename + ".artifact.json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `artifact-id=${result.id}\nsha256=${digest}\n`);
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await upload(process.env.INPUT_PATH, Number(process.env.INPUT_RETENTION || 90));
