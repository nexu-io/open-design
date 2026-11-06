import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { upload } from '../.github/actions/upload-native-zip/upload.mjs';

test('raw ZIP upload uses bounded blocks, never sends the runtime token to blob URLs, and retains the original digest', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'raw-artifact-')), filename=path.join(dir,'native.zip');
  const keys=['ACTIONS_RUNTIME_TOKEN','ACTIONS_RESULTS_URL','GITHUB_OUTPUT'];const saved=keys.map(k=>process.env[k]);
  const token='header.'+Buffer.from(JSON.stringify({scp:'Actions.Results:run:job'})).toString('base64url')+'.signature';
  process.env.ACTIONS_RUNTIME_TOKEN=token;process.env.ACTIONS_RESULTS_URL='https://code.powerformer.net/';delete process.env.GITHUB_OUTPUT;
  const bytes=Buffer.alloc(8*1024*1024+17,23),digest=createHash('sha256').update(bytes).digest('hex');
  const chunks=[];
  try {
    await writeFile(filename,bytes);
    t.mock.method(globalThis,'fetch',async(url,options)=>{
      if(String(url).endsWith('/CreateArtifact')){assert.equal(JSON.parse(options.body).name+'.zip',path.basename(filename));assert.equal(options.headers.Authorization,'Bearer '+token);return Response.json({ok:true,signedUploadUrl:'https://code.powerformer.net/blob?signed=fixture'});}
      if(String(url).endsWith('/FinalizeArtifact')){const value=JSON.parse(options.body);assert.equal(value.name,'native');assert.equal(value.hash,'sha256:'+digest);assert.equal(value.size,String(bytes.length));return Response.json({ok:true,artifactId:'123'});}
      assert.equal(options.headers.Authorization,undefined);
      if(new URL(url).searchParams.get('comp')==='block'){assert(options.body.length<=8*1024*1024);chunks.push(options.body);}
      return new Response(null,{status:201});
    });
    const result=await upload(filename,14);
    assert.equal(result.name,'native.zip');assert.equal(result.sha256,digest);assert.deepEqual(Buffer.concat(chunks),bytes);
    assert.equal(JSON.parse(await readFile(filename+'.artifact.json','utf8')).id,'123');
    t.mock.method(globalThis,'fetch',async()=>Response.json({ok:true,signedUploadUrl:'https://external.invalid/blob'}));
    await assert.rejects(upload(filename),/Unexpected artifact storage host/);
  } finally {keys.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i];});await rm(dir,{recursive:true,force:true});}
});

test('Release publication links the exact ZIP filename and checks its uploaded digest', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'publish-artifact-'));
  const keys = ['FORGEJO_TOKEN', 'TEST_PACKAGE_PLATFORMS', 'ALLOW_PENDING_MAC'];
  const saved = keys.map(key => process.env[key]), argv = process.argv;
  const version = '0.6.2-beta.1.1', name = `OpenMotion-Codex-${version}-mac-arm64.zip`;
  const bytes = Buffer.alloc(22); bytes.writeUInt32LE(0x06054b50);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const manifest = { version, commit: 'a'.repeat(40), target: 'mac-arm64', files: [{ name, sha256: digest }] };
  const release = { id: 1, tag_name: `openmotion-v${version}`, draft: true, prerelease: true, assets: [] };
  let linked = false;
  try {
    await writeFile(path.join(dir, name), bytes);
    await writeFile(path.join(dir, name + '.sha256'), `${digest}  ${name}\n`);
    await writeFile(path.join(dir, name + '.artifact.json'), JSON.stringify({ id: '123', name, sha256: digest }));
    await writeFile(path.join(dir, 'release-mac-arm64.json'), JSON.stringify(manifest));
    process.env.FORGEJO_TOKEN = 'test-only-token'; process.env.TEST_PACKAGE_PLATFORMS = 'mac'; process.env.ALLOW_PENDING_MAC = 'true';
    process.argv = [...argv.slice(0, 2), dir];
    t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
      const address = new URL(String(url));
      if (address.pathname.includes('/tags/')) return new Response(null, { status: 404 });
      if (address.pathname.endsWith('/assets')) {
        const assetName = address.searchParams.get('name');
        assert(assetName);
        if (assetName === name) {
          assert.equal(options.body.get('external_url'), 'https://code.powerformer.net/api/v1/repos/core/open-motion/actions/artifacts/123/zip');
          assert.equal(options.body.get('attachment'), null); linked = true;
        } else assert(options.body.get('attachment'));
        return Response.json({ name: assetName });
      }
      if (options.method === 'PATCH') { assert(linked); return Response.json({ ...release, draft: false }); }
      const created = JSON.parse(options.body);
      assert(created.body.includes('| mac-arm64 | 0.00 MiB | 22 |'));
      assert(created.body.includes('附件列表可能显示 0 B'));
      return Response.json(release);
    });
    await import('../scripts/publish-test-package.mjs?external-link-test');
    assert(linked);
  } finally {
    process.argv = argv; keys.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; });
    await rm(dir, { recursive: true, force: true });
  }
});
