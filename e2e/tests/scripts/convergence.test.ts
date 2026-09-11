import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const convergenceScript = path.join(repoRoot, ".github/scripts/convergence.py");
const temporaryRoots: string[] = [];

function createRepository() {
  const root = mkdtempSync(path.join(tmpdir(), "convergence-contract-"));
  temporaryRoots.push(root);
  for (const [name, content] of [["control.txt", "control"], ["a.txt", "a"], ["b.txt", "b"]] as const) {
    writeFileSync(path.join(root, name), content);
  }
  const configPath = path.join(root, "convergence.json");
  writeFileSync(configPath, JSON.stringify({
    schema: { version: 2 },
    suites: { "convergence-control": ["control.txt"], web: ["a.txt"] },
    workflows: {
      ci: {
        policy: "test-v1",
        workloads: {
          a: { inputs: ["suite://web"], runnerClass: "worker", products: "none", reusable: true },
          b: { inputs: ["suite://web", "b.txt"], runnerClass: "worker", products: "none", reusable: true },
        },
      },
    },
  }));
  const scopePlanPath = path.join(root, "scope-plan.json");
  writeFileSync(scopePlanPath, JSON.stringify({ enabled: { a: true, b: true } }));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-qm", "fixture"], { cwd: root });
  return { root, configPath, scopePlanPath, pendingPath: path.join(root, "pending.json") };
}

function runPlan(fixture: ReturnType<typeof createRepository>, runner = ["ubuntu-24.04"]) {
  const outputPath = path.join(fixture.root, "github-output.txt");
  writeFileSync(outputPath, "");
  const stdout = execFileSync("python3", [
    convergenceScript, "--root", fixture.root, "--config", fixture.configPath,
    "github-output", "--workflow", "ci", "--scope-plan", fixture.scopePlanPath,
    "--runner-plan-json", JSON.stringify({ worker: runner }), "--repository-id", "42",
    "--repository", "example/repo", "--mode", "shadow", "--pending", fixture.pendingPath,
  ], { cwd: fixture.root, encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: outputPath } });
  return {
    decision: JSON.parse(stdout) as { run: Record<string, boolean>; hit: Record<string, boolean> },
    pending: JSON.parse(readFileSync(fixture.pendingPath, "utf8")) as {
      workloads: Record<string, { digest: string; wouldRun: boolean }>;
    },
  };
}

function workload(
  plan: ReturnType<typeof runPlan>["pending"]["workloads"],
  name: string,
) {
  const result = plan[name];
  if (!result) throw new Error(`missing workload ${name}`);
  return result;
}

function candidate(products: Record<string, unknown>) {
  const digest = "d".repeat(64);
  const provenance = {
    event: "pull_request", runId: 12, runAttempt: 1,
    headSha: "a".repeat(40), baseSha: "b".repeat(40), treeSha: "c".repeat(40),
    validatedAt: "2026-08-21T00:00:00Z",
  };
  return {
    schemaVersion: 1,
    protocol: "nexu-workload-result-v1",
    repositoryId: 42,
    repository: "example/repo",
    workflow: "ci",
    policy: "test-v1",
    provenance,
    results: [{
      key: `workload-results/v1/repos/42/workflows/ci/policies/test-v1/workloads/a/digests/${digest}.json`,
      receipt: {
        schemaVersion: 1, protocol: "nexu-workload-result-v1", repositoryId: 42,
        workflow: "ci", policy: "test-v1", workload: "a", digest,
        executionClass: { runnerClass: "worker", labels: ["ubuntu-24.04"] }, products, validated: provenance,
      },
    }],
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("workload convergence", () => {
  test("binds an aggregated direct-product miss batch without converting uploads into cache hits", () => {
    const code = `
import sys,json,tempfile,hashlib,os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0,sys.argv[1])
import convergence as c
contract=c.ConvergenceContract(Path(sys.argv[2]));workflow=contract.workflow('release-exact')
matrix=workflow.execution['matrices']['data_matrix']['include'];selected={entry['workload'] for entry in matrix[:2]}
pending={'schemaVersion':1,'protocol':c.PROTOCOL,'repositoryId':42,'workflow':workflow.name,'policy':workflow.policy,'workloads':{}}
for name,declaration in workflow.workloads.items():
 pending['workloads'][name]={'digest':'a'*64,'executionClass':{'runnerClass':declaration.runner_class,'labels':['linux']},'scopeEnabled':name in selected,'run':name in selected,'resultHit':False,'reusable':declaration.reusable,'result':None}
with tempfile.TemporaryDirectory() as temporary:
 root=Path(temporary);c.write_json_atomic(root/'pending.json',pending)
 for entry in matrix[:2]:
  directory=root/'products'/entry['resource_id']/'artifact';directory.mkdir(parents=True);(directory/'resource').write_text(entry['resource_id'])
 args=SimpleNamespace(pending=root/'pending.json',batch='data',directory_field='id',products_root=root/'products',output=root/'contributions',timeout=1)
 objects={};writes=[]
 class Storage:
  def __init__(self,**kwargs): pass
  def head(self,*,key): return {'content-length':str(len(objects[key]))} if key in objects else None
  def put_file(self,*,key,file,**kwargs):
   assert key.startswith('workload-products/v2/');assert key not in objects
   objects[key]=file.read_bytes();writes.append(key)
 storage={'endpoint':'https://storage.invalid','bucket':'plan','public_origin':'https://cache.invalid','access_key_id':'ak','secret_access_key':'sk'}
 with patch.object(c,'R2Client',Storage),patch.object(c,'storage_config',return_value=storage),patch.object(c,'append_outputs') as output:
  assert c.contribute_batch_command(args,contract)==0
  manifests=json.loads(output.call_args.args[0]['products']);assert set(manifests)==selected
  assert storage['public_origin'] not in output.call_args.args[0]['products']
  assert all(m['products']['resource']['type']=='plan-key' for m in manifests.values())
  assert len(writes)==2
 # Consumers need only the read origin, never upload credentials.
 os.environ[c.STORAGE_ENV['public_origin']]=storage['public_origin']
 for field in ['access_key_id','secret_access_key']: os.environ.pop(c.STORAGE_ENV[field],None)
 bound=SimpleNamespace(pending=args.pending,batch='data',products_json=json.dumps(manifests),output=root/'inputs',products_root=root/'bound')
 assert c.bind_command(bound,contract)==0
 assert c.load_json(args.pending)==pending
 sources=c.load_json(bound.output/'batches/data.json')['sources']
 assert len(sources)==2 and all(set(source)=={'id','artifact'} for source in sources)
 assert {source['artifact']['url'] for source in sources}=={storage['public_origin']+'/'+m['products']['resource']['source'] for m in manifests.values()}
 # Trusted handoff collection retains direct manifests, without inventing job sources.
 assert c.contribute_all_command(SimpleNamespace(pending=args.pending,source_commit='b'*40,output=bound.products_root),contract)==0
 for name in manifests: assert c.load_json(bound.products_root/name/'product-manifest.json')==c.load_json(args.output/name/'product-manifest.json')
 for replacement in [{'source':'../foreign'}, {'source':'https://foreign.invalid/key'}, {'type':'url'}, {'unexpected':True}]:
  changed=json.loads(json.dumps(manifests));next(iter(changed.values()))['products']['resource'].update(replacement)
  bound.products_json=json.dumps(changed)
  try: c.bind_command(bound,contract)
  except c.ConfigError: pass
  else: raise AssertionError('accepted invalid key reference')
 bound.products_json=json.dumps(manifests)
 with patch.dict(os.environ,{c.STORAGE_ENV['public_origin']:'http://insecure.invalid'}):
  try: c.bind_command(bound,contract)
  except c.ConfigError: pass
  else: raise AssertionError('accepted insecure consumer origin')
 for changed in [{},dict(manifests,unknown=next(iter(manifests.values())))]:
  bound.products_json=json.dumps(changed)
  try: c.bind_command(bound,contract)
  except c.ConfigError: pass
  else: raise AssertionError('accepted missing or foreign producer')
 stale=json.loads(json.dumps(manifests));next(iter(stale.values()))['digest']='b'*64;bound.products_json=json.dumps(stale)
 try: c.bind_command(bound,contract)
 except c.ConfigError: pass
 else: raise AssertionError('accepted stale execution identity')
`;
    const result = spawnSync("python3", ["-c", code, path.join(repoRoot, ".github/scripts"),
      path.join(repoRoot, ".github/config/plan/release-exact.json")], { encoding: "utf8" });
    expect(result, result.stderr).toMatchObject({ status: 0, stderr: "" });
  });
  test("direct products preserve the envelope and require verified cache references before admission", () => {
    const code = `
import sys,json,tempfile,zipfile,hashlib
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0,sys.argv[1])
import convergence as c
with tempfile.TemporaryDirectory() as temporary:
 root=Path(temporary);source=root/'source';source.mkdir()
 (source/'tool').write_bytes(b'portable');(source/'nested').mkdir();(source/'nested'/'receipt.json').write_text('{}')
 c.archive_product_directory(source,root/'direct.zip')
 with zipfile.ZipFile(root/'github.zip','w') as z:
  z.write(source/'nested'/'receipt.json','nested/receipt.json');z.write(source/'tool','tool')
 c.normalize_product_archive(root/'github.zip',root/'normalized.zip')
 assert (root/'direct.zip').read_bytes()==(root/'normalized.zip').read_bytes()
 (source/'link').symlink_to(source/'tool')
 try: c.archive_product_directory(source,root/'unsafe.zip')
 except c.ConfigError: pass
 else: raise AssertionError('accepted symlink')
 assert not (root/'unsafe.zip').exists()
 (source/'link').unlink()
 config={'schema':{'version':2},'suites':{'convergence-control':['control.txt']},'workflows':{'ci':{'policy':'test-v1','workloads':{'tool':{'inputs':['control.txt'],'runnerClass':'worker','products':'manifest','reusable':True,'artifact':{'product':'bundle','prefix':'tool'}}}}}}
 c.write_json_atomic(root/'config.json',config);contract=c.ConvergenceContract(root/'config.json')
 pending={'schemaVersion':1,'protocol':c.PROTOCOL,'repositoryId':42,'workflow':'ci','policy':'test-v1','workloads':{'tool':{'scopeEnabled':True,'run':True,'digest':'a'*64,'executionClass':{'runnerClass':'worker','labels':['linux']}}}}
 c.write_json_atomic(root/'pending.json',pending)
 objects={};writes=[]
 class Storage:
  def __init__(self,**kwargs): pass
  def head(self,*,key): return {'content-length':str(len(objects[key]))} if key in objects else None
  def put_file(self,*,key,file,**kwargs):
   assert key.startswith('workload-products/v2/')
   assert key not in objects
   objects[key]=file.read_bytes();writes.append(key)
 storage={'endpoint':'https://storage.invalid','bucket':'plan','public_origin':'https://cache.invalid','access_key_id':'ak','secret_access_key':'sk'}
 args=SimpleNamespace(pending=root/'pending.json',workload='tool',product='bundle',directory=source,output=root/'out',timeout=1)
 with patch.object(c,'R2Client',Storage),patch.object(c,'storage_config',return_value=storage),patch.object(c,'sha256_url',side_effect=lambda url,timeout:hashlib.sha256(objects[url.removeprefix('https://cache.invalid/')]).hexdigest()):
  assert c.contribute_command(args,contract)==0
  assert c.contribute_command(args,contract)==0
  assert len(writes)==1
  manifest=c.load_json(root/'out/tool/product-manifest.json')
  product=manifest['products']['bundle']
  assert c.load_json(root/'out/tool/bundle.json')=={'url':product['source'],'sha256':product['data']['sha256']}
  candidate={'repositoryId':42,'workflow':'ci','policy':'test-v1','results':[{'receipt':{'workload':'tool','digest':'a'*64,'products':{'bundle':product}}}]}
  publication=SimpleNamespace(candidate=root/'candidate.json',output_dir=root/'publication',products_root=root/'absent',timeout=1)
  with patch.object(c,'prepare_publication',return_value=[]),patch.object(c,'normalize_product_archive',side_effect=AssertionError('direct product must not be repacked')):
   c.write_json_atomic(publication.candidate,candidate)
   assert c.publish_command(publication)==0
   assert len(writes)==1
   for replacement in [dict(product,source=product['source'].replace('/workload-products/','/versions/')),dict(product,data={'sha256':product['data']['sha256'],'size':True})]:
    candidate['results'][0]['receipt']['products']['bundle']=replacement
    c.write_json_atomic(publication.candidate,candidate)
    try: c.publish_command(publication)
    except c.ConfigError: pass
    else: raise AssertionError('admitted foreign or invalid product')
  pending['workloads']['tool']['run']=False;c.write_json_atomic(args.pending,pending)
  try: c.contribute_command(args,contract)
  except c.ConfigError: pass
  else: raise AssertionError('uploaded cache hit')
  assert len(writes)==1
`;
    const result = spawnSync("python3", ["-c", code, path.join(repoRoot, ".github/scripts")], { encoding: "utf8" });
    expect(result, result.stderr).toMatchObject({ status: 0, stderr: "" });
  });
  test("does not re-upload content-addressed products when execution identities change", () => {
    const code = `
import sys,json,tempfile,hashlib,shutil
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0,sys.argv[1])
import convergence as c
objects={}; writes=[]
class Storage:
 def __init__(self,**kwargs): pass
 def head(self,*,key): return {'content-length':str(len(objects[key]))} if key in objects else None
 def put_file(self,*,key,file,**kwargs):
  assert key not in objects
  objects[key]=file.read_bytes();writes.append(key)
config={'endpoint':'https://storage.invalid','bucket':'cache','access_key_id':'ak','secret_access_key':'sk','public_origin':'https://cache.invalid'}
with tempfile.TemporaryDirectory() as directory:
 root=Path(directory);(root/'input.zip').write_bytes(b'canonical-product')
 args=SimpleNamespace(candidate=root/'candidate.json',output_dir=root/'out',products_root=root,timeout=1)
 def normalize(source,destination):
  destination.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,destination)
 with patch.object(c,'R2Client',Storage),patch.object(c,'storage_config',return_value=config),patch.object(c,'prepare_publication',return_value=[]),patch.object(c,'normalize_product_archive',side_effect=normalize),patch.object(c,'sha256_url',side_effect=lambda url,timeout:hashlib.sha256(objects[url.removeprefix('https://cache.invalid/')]).hexdigest()):
  for digest in ['a'*64,'b'*64]:
   args.candidate.write_text(json.dumps({'repositoryId':42,'workflow':'release-exact','policy':'exact-v1','results':[{'receipt':{'workload':'toolchain','digest':digest,'products':{'toolchain':{'type':'job','source':'input'}}}}]}))
   assert c.publish_command(args)==0
  assert len(writes)==1
  saved=json.loads((args.output_dir/'promoted-candidate.json').read_text())['results'][0]['receipt']['products']['toolchain']
  assert saved['data']['size']==len(b'canonical-product')
  objects[writes[0]]=b'x'*len(b'canonical-product')
  try: c.publish_command(args)
  except c.ConfigError: pass
  else: raise AssertionError('accepted existing corrupt product')
  assert len(writes)==1
`;
    expect(spawnSync("python3", ["-c", code, path.join(repoRoot, ".github/scripts")], { encoding: "utf8" }))
      .toMatchObject({ status: 0, stderr: "" });
  });
  test("addresses reusable product bytes independently of run, execution digest and release version", () => {
    const code = `
import sys,inspect
sys.path.insert(0,sys.argv[1])
from convergence import product_key,ConfigError
args=dict(repository_id=42,workflow='release-exact',policy='exact-v1',identity='electron_toolchain',product='toolchain',sha256='a'*64)
key=product_key(**args)
assert key=='workload-products/v2/repos/42/workflows/release-exact/policies/exact-v1/workloads/electron_toolchain/products/toolchain/sha256/'+('a'*64)+'.zip'
assert 'run' not in inspect.signature(product_key).parameters
assert 'digest' not in inspect.signature(product_key).parameters
assert 'release_version' not in inspect.signature(product_key).parameters
for field,value in [('repository_id',43),('workflow','release-stable'),('policy','other'),('identity','other'),('product','other'),('sha256','b'*64)]:
 assert product_key(**dict(args,**{field:value}))!=key
for field,value in [('repository_id',True),('repository_id',0),('workflow','../release'),('product','../installer'),('identity','a/b'),('sha256','invalid')]:
 try: product_key(**dict(args,**{field:value}))
 except ConfigError: pass
 else: raise AssertionError('accepted invalid key input')
`;
    expect(spawnSync("python3", ["-c", code, path.join(repoRoot, ".github/scripts")], { encoding: "utf8" }))
      .toMatchObject({ status: 0, stderr: "" });
  });
  test("transfers exact R2 objects with bounded reads and without partial destinations or redirects", () => {
    const code = `
import sys,hashlib,io,tempfile,urllib.error
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,sys.argv[1])
import lib.r2 as r
r.self_check()
client=r.R2Client(endpoint='https://account.r2.cloudflarestorage.com',bucket='results',credentials=r.R2Credentials('ak','sk','session'))
body=b'x'*(2*1024*1024+7)
digest=hashlib.sha256(body).hexdigest()
class Response(io.BytesIO):
 status=200
 headers={'Content-Length':str(len(body))}
 def read(self,n=-1):
  assert 0<n<=1024*1024
  return super().read(n)
def upload(req,timeout):
 assert req.method=='PUT' and not isinstance(req.data,bytes)
 assert req.get_header('Content-length')==str(len(body))
 assert req.get_header('X-amz-content-sha256')==digest
 assert req.get_header('X-amz-security-token')=='session'
 assert req.get_header('If-none-match')=='*'
 assert req.data.read()==body
 return Response()
with tempfile.TemporaryDirectory() as directory:
 root=Path(directory); source=root/'source'; source.write_bytes(body)
 with patch.object(r,'_open',side_effect=upload): client.put_file(key='products/object',file=source)
 with patch.object(r,'_open',side_effect=lambda request,timeout:Response(body)):
  client.get_file(key='products/object',file=root/'good',sha256=digest,size=len(body))
  assert (root/'good').read_bytes()==body
  try: client.get_file(key='products/object',file=root/'good',sha256=digest,size=len(body))
  except r.R2Error: pass
  else: raise AssertionError('overwrote destination')
  for name,expected_size,expected_digest in [('digest',len(body),'0'*64),('size',len(body)+1,digest)]:
   try: client.get_file(key='products/object',file=root/name,sha256=expected_digest,size=expected_size)
   except r.R2Error: pass
   else: raise AssertionError('accepted corrupt object')
   assert not (root/name).exists()
 assert not list(root.glob('.r2-download-*'))
for key in ['/escape','a/../b','a//b','a/./b','a\\\\b','bad'+chr(0)]:
 try: client._request(key,'HEAD',digest)
 except r.R2Error: pass
 else: raise AssertionError('accepted unsafe key')
with patch.object(r,'_open',side_effect=urllib.error.HTTPError('https://example',404,'missing',{},None)):
 assert client.head(key='missing') is None
try: r._NoRedirect().redirect_request(None,None,307,'redirect',{},'https://other.invalid')
except r.R2Error: pass
else: raise AssertionError('followed authenticated redirect')
`;
    expect(spawnSync("python3", ["-c", code, path.join(repoRoot, ".github/scripts")], { encoding: "utf8" }))
      .toMatchObject({ status: 0, stderr: "" });
  });
  test("reports bounded cache inventory without mixing version objects or changing publication gates", () => {
    const code = `
import sys,io,urllib.parse
from unittest.mock import patch
sys.path.insert(0,sys.argv[1])
import convergence as c
import lib.r2 as r
client=r.R2Client(endpoint='https://storage.invalid',bucket='plan',credentials=r.R2Credentials('ak','sk'))
class Response(io.BytesIO):
 status=200
def page(key='cache/a',size='7',truncated='false',token=''):
 return Response(('<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Contents><Key>'+key+'</Key><Size>'+size+'</Size></Contents><IsTruncated>'+truncated+'</IsTruncated><NextContinuationToken>'+token+'</NextContinuationToken></ListBucketResult>').encode())
requests=[]
def opening(request,timeout):
 requests.append(request)
 assert request.method=='GET' and request.get_header('Authorization')
 return page(truncated='true',token='a+/=') if len(requests)==1 else page('cache/b','11')
with patch.object(r,'_open',side_effect=opening):
 assert client.inventory(prefix='cache/')=={'objects':2,'bytes':18,'pages':2,'complete':True}
 assert 'continuation-token=a%2B%2F%3D' in requests[1].full_url
 assert urllib.parse.parse_qs(urllib.parse.urlparse(requests[1].full_url).query)['prefix']==['cache/']
with patch.object(r,'_open',side_effect=lambda *a,**k:page(truncated='true',token='next')):
 assert client.inventory(prefix='cache/',max_pages=1)=={'objects':1,'bytes':7,'pages':1,'complete':False}
 try: client.inventory(prefix='cache/')
 except r.R2Error: pass
 else: raise AssertionError('accepted repeated pagination token')
for key,size in [('versions/file','7'),('cache/a','-1')]:
 with patch.object(r,'_open',side_effect=lambda *a,**k:page(key,size)):
  try: client.inventory(prefix='cache/')
  except r.R2Error: pass
  else: raise AssertionError('accepted foreign or malformed inventory')
prefixes=[]
class Inventory:
 def inventory(self,*,prefix):
  prefixes.append(prefix)
  return {'objects':1,'bytes':7,'pages':1,'complete':True}
snapshot=c.cache_inventory(Inventory(),42,'release-exact')
assert snapshot['bytes']==21 and snapshot['objects']==3 and snapshot['complete']
assert set(prefixes)=={p+'/repos/42/workflows/release-exact/' for p in ['workload-products/v1','workload-products/v2','workload-results/v1']}
before={**snapshot,'bytes':10}
report=c.cache_usage_report(before,snapshot,42,'release-exact')
assert report['observedGrowthBytes']==11 and report['budgetStatus']=='within'
assert report['scope']=='workflow-all-policies' and 'channel' not in report
partial={**snapshot,'complete':False}
assert c.cache_usage_report(before,partial,42,'release-exact')['budgetStatus']=='unknown'
assert c.cache_usage_report(before,partial,42,'release-exact')['observedGrowthBytes'] is None
assert c.cache_usage_report(before,{**partial,'bytes':51*1024**3},42,'release-exact')['budgetStatus']=='review'
class Failed:
 def inventory(self,**kwargs): raise r.R2Error('unavailable')
assert c.cache_inventory(Failed(),42,'release-exact')=={'status':'unavailable','complete':False,'errorType':'R2Error'}
`;
    const result = spawnSync("python3", ["-c", code, path.join(repoRoot, ".github/scripts")], { encoding: "utf8" });
    expect(result, result.stderr).toMatchObject({ status: 0, stderr: "" });
  });
  test("reads independent cached results with bounded concurrency and stable ordering", () => {
    const code = `
import sys, threading
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
import convergence as c
workflow=SimpleNamespace(name='ci',policy='test-v1')
expected={'digest':'a'*64,'executionClass':{'runnerClass':'worker','labels':['worker']},'products':'none','reusable':True}
calculated={f'item{i}':dict(expected) for i in range(16)}
barrier=threading.Barrier(8,timeout=5)
def fetch(url,timeout):
    identity=url.split('/workloads/')[1].split('/')[0]
    barrier.wait()
    if identity=='item3': raise TimeoutError('isolated unavailable result')
    return {'schemaVersion':1,'protocol':c.PROTOCOL,'repositoryId':42,'workflow':'ci','policy':'test-v1',
      'workload':identity,'digest':expected['digest'],'executionClass':expected['executionClass'],'products':{},
      'validated':{'event':'pull_request','runId':1,'runAttempt':1,'headSha':'a'*40,'baseSha':'b'*40,
        'treeSha':'c'*40,'validatedAt':'2026-08-21T00:00:00Z'}}
with patch.object(c,'fetch_result',side_effect=fetch):
    hits,reasons,results=c.resolve_results('https://cache.example',42,workflow,calculated,1)
assert list(hits)==list(calculated)
assert sum(hits.values())==15 and reasons['item3']=='read-unavailable:TimeoutError'
assert list(results)==[name for name in calculated if name!='item3']
print('bounded parallel reads preserve decisions')
`;
    expect(execFileSync("python3", ["-c", code, path.dirname(convergenceScript)], { encoding: "utf8" }))
      .toContain("bounded parallel reads preserve decisions");
  });

  test("pins the schema 2 identity algorithm independently of Git and platform", () => {
    const digest = execFileSync("python3", ["-c", [
      "import sys", "from pathlib import Path", "from unittest.mock import patch",
      "sys.path.insert(0,sys.argv[1])",
      "from convergence import ConvergenceContract, WorkflowContract, GitFingerprinter, calculate",
      "c=ConvergenceContract.__new__(ConvergenceContract)",
      "c.schema_version=2",
      "c.suites={'source':['a.txt']}",
      "c.workflows={'example':WorkflowContract('example',{'policy':'v1','workloads':{'unit':{'inputs':['suite://source'],'runnerClass':'worker','products':'none','reusable':True}}})}",
      "with patch.object(GitFingerprinter,'records',return_value=[('a.txt','100644','a'*40,'0')]):",
      " before=calculate(c,Path('.'),'example',{'worker':['ubuntu-24.04']})['unit']['digest']",
      " c.schema_version=3",
      " assert calculate(c,Path('.'),'example',{'worker':['ubuntu-24.04']})['unit']['digest'] != before",
      " print(before)",
    ].join("\n"), path.dirname(convergenceScript)], { encoding: "utf8" }).trim();
    expect(digest).toBe("2e88f86aa13f43b0036a6f5c30d95becb0388d205f4ae51189bba9096c5cf28e");
  });

  test("isolates admission files and unrelated config while retaining versioned execution semantics", () => {
    const fixture = createRepository();
    const before = runPlan(fixture).pending.workloads;
    writeFileSync(path.join(fixture.root, "control.txt"), "notification-only workflow change");
    execFileSync("git", ["add", "control.txt"], { cwd: fixture.root });
    expect(runPlan(fixture).pending.workloads).toEqual(before);
    const config = JSON.parse(readFileSync(fixture.configPath, "utf8"));
    config.workflows.ci.workloads.b.parameters = { command: "test:new" };
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const changed = runPlan(fixture).pending.workloads;
    expect(workload(changed, "a").digest).toBe(workload(before, "a").digest);
    expect(workload(changed, "b").digest).not.toBe(workload(before, "b").digest);
    config.workflows.ci.workloads.b.inputs.reverse();
    writeFileSync(fixture.configPath, JSON.stringify(config, null, 4));
    expect(runPlan(fixture).pending.workloads).toEqual(changed);
    for (const version of [1, 3, true]) {
      config.schema.version = version;
      writeFileSync(fixture.configPath, JSON.stringify(config));
      const result = spawnSync("python3", [convergenceScript, "--config", fixture.configPath, "validate"], { encoding: "utf8" });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("schema.version 2");
    }
  });

  test("binds manual bootstrap to a completed pinned same-repository exact run", () => {
    const code = `
import copy, os, sys
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
import convergence as c
sha = 'a' * 40
branch = 'feat/electron-shell-exact-delivery'
payload = {'repository': {'id': 42, 'full_name': 'nexu-io/open-design'},
           'inputs': {'trusted_sha': sha, 'producer_run_id': '12'}}
run = {'id': 12, 'name': 'release-exact', 'event': 'workflow_dispatch',
       'path': '.github/workflows/release-exact.yml', 'status': 'completed',
       'conclusion': 'success', 'head_branch': branch, 'head_sha': sha,
       'head_repository': {'full_name': 'nexu-io/open-design'}}
env = {'GITHUB_EVENT_NAME': 'workflow_dispatch', 'GITHUB_REF': 'refs/heads/' + branch, 'GITHUB_SHA': sha}
with patch.dict(os.environ, env), patch.object(c, 'event_payload', return_value=payload), patch.object(c.subprocess, 'check_output', return_value=sha):
    with patch.object(c, 'api_json', return_value=run) as api:
        assert c.admitted_source()['workflow_run'] == run
        api.assert_called_once_with('/repos/nexu-io/open-design/actions/runs/12')
    for key, value in [('id', 13), ('name', 'release-stable'), ('event', 'pull_request'),
                       ('path', '.github/workflows/other.yml'), ('status', 'in_progress'),
                       ('conclusion', 'cancelled'), ('head_branch', 'main'), ('head_sha', 'b' * 40),
                       ('head_repository', {'full_name': 'fork/open-design'})]:
        invalid = copy.deepcopy(run)
        invalid[key] = value
        with patch.object(c, 'api_json', return_value=invalid):
            try: c.admitted_source()
            except c.ConfigError: pass
            else: raise AssertionError('accepted invalid ' + key)
    for key, value in [('GITHUB_REF', 'refs/heads/main'), ('GITHUB_SHA', 'b' * 40)]:
        with patch.dict(os.environ, {key: value}), patch.object(c, 'api_json') as api:
            try: c.admitted_source()
            except c.ConfigError: pass
            else: raise AssertionError('accepted invalid ' + key)
            api.assert_not_called()
    with patch.object(c.subprocess, 'check_output', return_value='b' * 40):
        try: c.admitted_source()
        except c.ConfigError: pass
        else: raise AssertionError('accepted mismatched checkout')
print('manual admission verified')
`;
    expect(execFileSync("python3", ["-c", code, path.dirname(convergenceScript)], { encoding: "utf8" }))
      .toContain("manual admission verified");
  });

  test("requires live current-attempt production evidence even when release delivery fails", () => {
    const code = `
import copy, sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
import convergence as c
root=Path(sys.argv[2])
for lane in ['exact','stable','prerelease']:
    name='release-'+lane
    contract=c.ConvergenceContract(root / '.github/config/plan' / (name+'.json'))
    run={'id':12,'run_attempt':2,'name':name,'event':'workflow_dispatch','head_sha':'a'*40,
         'status':'completed','conclusion':'failure','head_repository':{'full_name':'nexu-io/open-design'}}
    payload={'repository':{'id':42,'full_name':'nexu-io/open-design'},'workflow_run':run}
    job={'name':'[prepare] Release content · validated and signed','run_id':12,'run_attempt':2,'head_sha':'a'*40,'status':'completed','conclusion':'success'}
    with patch.object(c,'api_json',return_value={'jobs':[job]}) as api:
        assert c.validate_production_admission(payload,contract)['run_attempt']==2
        api.assert_called_once_with('/repos/nexu-io/open-design/actions/runs/12/attempts/2/jobs?per_page=100&page=1')
    invalids=[[],[job,job]]
    for key,value in [('run_id',13),('run_attempt',1),('head_sha','b'*40),('status','in_progress'),('conclusion','failure'),('conclusion','skipped')]:
        invalids.append([{**job,key:value}])
    for jobs in invalids:
        with patch.object(c,'api_json',return_value={'jobs':jobs}):
            try: c.validate_production_admission(payload,contract)
            except c.ConfigError: pass
            else: raise AssertionError('accepted invalid production evidence')
    for change in [{'conclusion':'cancelled'},{'status':'in_progress'},{'head_repository':{'full_name':'fork/repo'}}]:
        with patch.object(c,'api_json') as api:
            try: c.validate_production_admission({**payload,'workflow_run':{**run,**change}},contract)
            except c.ConfigError: pass
            else: raise AssertionError('accepted invalid producer')
            api.assert_not_called()
contract=c.ConvergenceContract(root / '.github/config/convergence.json')
payload['workflow_run']={**run,'name':'ci','event':'pull_request'}
with patch.object(c,'api_json') as api:
    try: c.validate_production_admission(payload,contract)
    except c.ConfigError: pass
    else: raise AssertionError('CI failure admitted')
    payload['workflow_run']['conclusion']='success'
    c.validate_production_admission(payload,contract)
    api.assert_not_called()
print('production evidence verified')
`;
    expect(execFileSync("python3", ["-c", code, path.dirname(convergenceScript), repoRoot], { encoding: "utf8" }))
      .toContain("production evidence verified");
  });

  test("admits installed witnesses only after their own exact-attempt job succeeds", () => {
    const code = `
import sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
import convergence as c
workflow=c.ConvergenceContract(Path(sys.argv[2]) / '.github/config/plan/release-exact.json').workflow('release-exact')
identity='installed_electron_darwin_arm64'
context={'repository':'nexu-io/open-design','run_id':12,'run_attempt':2,'head_sha':'a'*40}
candidate={'results':[{'receipt':{'workload':'electron_base_darwin_arm64'}},{'receipt':{'workload':identity}}]}
job={'name':workflow.result_jobs[identity],'run_id':12,'run_attempt':2,'head_sha':'a'*40,'status':'completed','conclusion':'success'}
with patch.object(c,'api_json',return_value={'jobs':[job]}):
    assert len(c.admit_result_jobs(candidate,workflow,context)['results'])==2
invalids=[[],[job,job]]
for key,value in [('run_id',13),('run_attempt',1),('head_sha','b'*40),('status','in_progress'),('conclusion','failure'),('conclusion','skipped'),('name','[test] Installed electron · darwin-arm64 · candidate baseline')]:
    invalids.append([{**job,key:value}])
for jobs in invalids:
    with patch.object(c,'api_json',return_value={'jobs':jobs}):
        assert c.admit_result_jobs(candidate,workflow,context)['results']==candidate['results'][:1]
assert len(candidate['results'])==2
for lane in ['stable','prerelease']:
    formal=c.ConvergenceContract(Path(sys.argv[2]) / '.github/config/plan' / ('release-'+lane+'.json')).workflow('release-'+lane)
    assert all(not formal.workloads[name].reusable for name in formal.result_jobs)
print('installed witness admission verified')
`;
    expect(execFileSync("python3", ["-c", code, path.dirname(convergenceScript), repoRoot], { encoding: "utf8" }))
      .toContain("installed witness admission verified");
  });

  test("projects a mixed batch without leaking identities or changing independent decisions", () => {
    const fixture = createRepository();
    const code = `
import json, sys
from types import SimpleNamespace
sys.path.insert(0, sys.argv[1])
from convergence import batch_inputs, ConfigError
workflow = SimpleNamespace(execution={
  'matrices': {'items': {'include': [{'workload': 'a', 'name': 'first'}, {'workload': 'b', 'name': 'second'}]}},
  'batches': {'data': {'matrix': 'items', 'fields': {'id': 'name'}, 'product': 'resource'}}})
pending = {'workloads': {
  'a': {'scopeEnabled': True, 'run': True, 'resultHit': False},
  'b': {'scopeEnabled': True, 'run': False, 'resultHit': True, 'result': {'products': {
    'resource': {'type': 'url', 'source': 'https://cache.example/blob.zip', 'data': {'sha256': 'a' * 64}}}}}}}
print(json.dumps(batch_inputs(workflow, pending)))
pending['workloads']['b']['resultHit'] = False
try:
  batch_inputs(workflow, pending)
except ConfigError:
  pass
else:
  raise AssertionError('missing artifact must not fall back to undeclared execution')
`;
    const result = execFileSync("python3", ["-c", code, path.dirname(convergenceScript)], { encoding: "utf8" });
    expect(JSON.parse(result)).toEqual({ data: [{ id: "first" }, { id: "second", artifact: { url: "https://cache.example/blob.zip", sha256: "a".repeat(64) } }] });
  });

  test("writes distinct consumer and execution batches for cold, mixed, hot, shadow and disabled plans", () => {
    const fixture = createRepository();
    const code = `
import contextlib, io, json, sys
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
import convergence as c
root = Path(sys.argv[2])
workflow = NS(name='ci', policy='test', order=['a','b'], workloads={name:NS(dependencies=[]) for name in ['a','b']}, execution={
  'matrices': {'items': {'include': [{'workload':'a','name':'first'}, {'workload':'b','name':'second'}]}},
  'batches': {'data': {'matrix':'items','fields':{'id':'name'},'product':'resource'}}})
contract = NS(workflow=lambda _: workflow)
for scenario, hits, mode, enabled, expected in [
  ('cold', {'a':False,'b':False}, 'enforce', True, ['first','second']),
  ('mixed', {'a':False,'b':True}, 'enforce', True, ['first']),
  ('hot', {'a':True,'b':True}, 'enforce', True, []),
  ('shadow', {'a':True,'b':True}, 'shadow', True, ['first','second']),
  ('disabled', {'a':False,'b':False}, 'enforce', False, []),
]:
  scope=root/(scenario+'.scope.json'); scope.write_text(json.dumps({'enabled':{'a':enabled,'b':enabled}}))
  output=root/scenario
  args=NS(repository_id=42, repository='example/repo', base_url='', workflow='ci', scope_plan=scope,
    runner_plan_json='{}', timeout=1, mode=mode, pending=output/'pending.json', products_output=output/'products')
  calculated={name:{'reusable':True} for name in hits}
  results={name:{'products':{'resource':{'type':'url','source':'https://cache.example/'+name+'.zip','data':{'sha256':'a'*64}}}} for name,hit in hits.items() if hit}
  with patch.object(c,'calculate',return_value=calculated), patch.object(c,'resolve_results',return_value=(hits,{name:'miss' for name in hits},results)), patch.object(c,'append_outputs') as outputs, patch.object(c,'append_summary'), contextlib.redirect_stdout(io.StringIO()):
    c.plan_command(args,contract,root)
  execution=json.loads((output/'products/batches/data.execution.json').read_text())['sources']
  complete=json.loads((output/'products/batches/data.json').read_text())['sources']
  assert execution == [{'id':name} for name in expected], scenario
  assert len(complete) == (2 if enabled else 0), scenario
  assert json.loads(outputs.call_args.args[0]['batch_run'])['data'] == bool(expected), scenario
  assert sum('artifact' in entry for entry in complete) == (len(complete)-len(execution)), scenario
print('batch projections verified')
`;
    expect(execFileSync("python3", ["-c", code, path.dirname(convergenceScript), fixture.root], { encoding: "utf8" })).toContain("batch projections verified");
  });

  test("bootstraps a tool from a verified blob without Node or workspace dependencies", () => {
    const fixture = createRepository();
    const script = `
import argparse, hashlib, io, json, sys, zipfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
from convergence import acquire_command, ConfigError
root = Path(sys.argv[2])
for scenario in ('valid', 'digest', 'traversal', 'symlink', 'duplicate', 'existing', 'http'):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as archive:
        name = '../escape' if scenario == 'traversal' else 'tools-release'
        info = zipfile.ZipInfo(name)
        info.external_attr = (0o120777 if scenario == 'symlink' else 0o100755) << 16
        archive.writestr(info, b'portable tool')
        if scenario == 'duplicate': archive.writestr('TOOLS-RELEASE', b'duplicate')
    body = buffer.getvalue()
    descriptor = root / (scenario + '.json')
    descriptor.write_text(json.dumps({'url': ('http' if scenario == 'http' else 'https') + '://cache.example/tool.zip',
        'sha256': '0' * 64 if scenario == 'digest' else hashlib.sha256(body).hexdigest()}))
    output = root / scenario
    if scenario == 'existing':
        output.mkdir()
        (output / 'keep').write_text('preserved')
    response = io.BytesIO(body)
    response.status = 200
    with patch('convergence.urllib.request.build_opener') as opener:
        opener.return_value.open.return_value = response
        if scenario == 'valid':
            assert acquire_command(argparse.Namespace(descriptor=descriptor, output=output)) == 0
            assert (output / 'tools-release').read_bytes() == b'portable tool'
        else:
            try: acquire_command(argparse.Namespace(descriptor=descriptor, output=output))
            except ConfigError: pass
            else: raise AssertionError('accepted ' + scenario)
            if scenario == 'existing': assert (output / 'keep').read_text() == 'preserved'
            else: assert not output.exists()
    assert not list(root.glob('.tool-artifact-*'))
assert not (root / 'escape').exists()
`;
    execFileSync("python3", ["-c", script, path.dirname(convergenceScript), fixture.root]);
  });

  test("projects execution declarations using only Python and the workflow JSON", () => {
    const fixture = createRepository();
    const config = JSON.parse(readFileSync(fixture.configPath, "utf8"));
    const execution = {
      enabled: ["a"], runners: { worker: ["ubuntu-24.04"] },
      matrices: { tool_matrix: { include: [{ workload: "a", target: "neutral", runs_on: "ubuntu-24.04" }] } },
      inputs: { shells: { shells: [{ shell: "electron", target: "darwin-arm64" }] } },
    };
    config.workflows.ci.execution = execution;
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const output = path.join(fixture.root, "execution"), githubOutput = path.join(fixture.root, "outputs");
    const args = [convergenceScript, "--config", fixture.configPath, "execution", "--workflow", "ci",
      "--output", output, "--github-output", githubOutput];
    execFileSync("python3", args, { cwd: fixture.root });
    expect(JSON.parse(readFileSync(path.join(output, "scope.json"), "utf8"))).toEqual({ enabled: { a: true, b: false } });
    expect(JSON.parse(readFileSync(path.join(output, "runners.json"), "utf8"))).toEqual(execution.runners);
    expect(JSON.parse(readFileSync(path.join(output, "matrices.json"), "utf8"))).toEqual(execution.matrices);
    expect(JSON.parse(readFileSync(path.join(output, "inputs/shells.json"), "utf8"))).toEqual(execution.inputs.shells);
    expect(readFileSync(githubOutput, "utf8")).toBe(`tool_matrix=${JSON.stringify(execution.matrices.tool_matrix)}\n`);
    config.workflows.ci.workloads.a.parameters = { target: "neutral", postinstall_level: "fixture" };
    writeFileSync(fixture.configPath, JSON.stringify(config));
    execFileSync("python3", args, { cwd: fixture.root });
    expect(JSON.parse(readFileSync(path.join(output, "matrices.json"), "utf8")).tool_matrix.include[0])
      .toMatchObject({ target: "neutral", postinstall_level: "fixture" });
    for (const mutate of [
      (value: any) => { value.enabled.push("unknown"); },
      (value: any) => { value.runners.worker = []; },
      (value: any) => { value.matrices["invalid\noutput"] = { include: [] }; },
      (value: any) => { value.matrices.tool_matrix.include = [null]; },
      (value: any) => { value.matrices.tool_matrix.include[0].target = "drift"; },
    ]) {
      const invalid = structuredClone(config);
      mutate(invalid.workflows.ci.execution);
      writeFileSync(fixture.configPath, JSON.stringify(invalid));
      expect(spawnSync("python3", args).status).not.toBe(0);
    }
    config.workflows.ci.workloads.a.dependsOn = ["b"];
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const refused = spawnSync("python3", args, { encoding: "utf8" });
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toContain("disabled workload");
  });

  test("keeps shadow coverage while calculating stable workload identities", () => {
    const fixture = createRepository();
    const first = runPlan(fixture);
    const second = runPlan(fixture);
    expect(first.decision.run).toEqual({ a: true, b: true });
    expect(first.decision.hit).toEqual({ a: false, b: false });
    expect(workload(second.pending.workloads, "a").digest).toBe(workload(first.pending.workloads, "a").digest);
    expect(workload(second.pending.workloads, "b").digest).toBe(workload(first.pending.workloads, "b").digest);
  });

  test("composes suites without coupling unrelated workload inputs", () => {
    const fixture = createRepository();
    const before = runPlan(fixture).pending.workloads;
    writeFileSync(path.join(fixture.root, "b.txt"), "b2");
    execFileSync("git", ["add", "b.txt"], { cwd: fixture.root });
    const afterB = runPlan(fixture).pending.workloads;
    expect(workload(afterB, "a").digest).toBe(workload(before, "a").digest);
    expect(workload(afterB, "b").digest).not.toBe(workload(before, "b").digest);

    writeFileSync(path.join(fixture.root, "a.txt"), "a2");
    execFileSync("git", ["add", "a.txt"], { cwd: fixture.root });
    const afterA = runPlan(fixture).pending.workloads;
    expect(workload(afterA, "a").digest).not.toBe(workload(afterB, "a").digest);
    expect(workload(afterA, "b").digest).not.toBe(workload(afterB, "b").digest);
  });

  test("includes the execution class in the reusable-result digest", () => {
    const fixture = createRepository();
    const hostedPlan = runPlan(fixture, ["ubuntu-24.04"]).pending.workloads;
    const arcPlan = runPlan(fixture, ["nexu-runners-medium"]).pending.workloads;
    const hosted = workload(hostedPlan, "a").digest;
    const arc = workload(arcPlan, "a").digest;
    expect(arc).not.toBe(hosted);
  });

  test("owns dependency identity and target parameters in Python without executor hashes", () => {
    const fixture = createRepository();
    const config = JSON.parse(readFileSync(fixture.configPath, "utf8"));
    config.workflows.ci.workloads.b.inputs = ["b.txt"];
    config.workflows.ci.workloads.b.dependsOn = ["a"];
    config.workflows.ci.workloads.a.parameters = { target: "darwin-arm64" };
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const first = runPlan(fixture).pending.workloads;
    writeFileSync(path.join(fixture.root, "a.txt"), "changed producer");
    execFileSync("git", ["add", "a.txt"], { cwd: fixture.root });
    const changedSource = runPlan(fixture).pending.workloads;
    expect(workload(changedSource, "a").digest).not.toBe(workload(first, "a").digest);
    expect(workload(changedSource, "b").digest).not.toBe(workload(first, "b").digest);
    config.workflows.ci.workloads.a.parameters.target = "win32-x64";
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const changedTarget = runPlan(fixture).pending.workloads;
    expect(workload(changedTarget, "b").digest).not.toBe(workload(changedSource, "b").digest);
    config.workflows.ci.workloads = Object.fromEntries(Object.entries(config.workflows.ci.workloads).reverse());
    writeFileSync(fixture.configPath, JSON.stringify(config));
    expect(runPlan(fixture).pending.workloads).toEqual(changedTarget);
  });

  test("rejects invalid dependency graphs before scheduling work", () => {
    const fixture = createRepository();
    const config = JSON.parse(readFileSync(fixture.configPath, "utf8"));
    for (const dependencies of [["missing"], ["a"], ["b", "b"]]) {
      config.workflows.ci.workloads.a.dependsOn = dependencies;
      writeFileSync(fixture.configPath, JSON.stringify(config));
      const result = spawnSync("python3", [convergenceScript, "--config", fixture.configPath, "validate"], { encoding: "utf8" });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/unknown dependency|dependency cycle|duplicates/u);
    }
    config.workflows.ci.workloads.a.dependsOn = ["b"];
    config.workflows.ci.workloads.b.dependsOn = ["a"];
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const result = spawnSync("python3", [convergenceScript, "--config", fixture.configPath, "validate"], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("dependency cycle");
  });

  test("requires missing producer inputs without rebuilding dependencies of a cached consumer", () => {
    const fixture = createRepository();
    const config = JSON.parse(readFileSync(fixture.configPath, "utf8"));
    config.workflows.ci.workloads.b.dependsOn = ["a"];
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const decisions = JSON.parse(execFileSync("python3", ["-c", [
      "import json, sys", "from pathlib import Path", "sys.path.insert(0, sys.argv[1])",
      "from convergence import ConvergenceContract, required_workloads, execution_decisions",
      "workflow = ConvergenceContract(Path(sys.argv[2])).workflow('ci')",
      "enabled = {'a': False, 'b': True}",
      "def resolve(hits, mode):",
      "    required = required_workloads(workflow, enabled, hits, mode)",
      "    return {'required': required, 'run': execution_decisions(required, hits, mode)[0]}",
      "print(json.dumps([resolve({'a': a, 'b': b}, mode) for a, b, mode in [(False, False, 'enforce'), (True, False, 'enforce'), (False, True, 'enforce'), (True, True, 'shadow')]]))",
    ].join("\n"), path.dirname(convergenceScript), fixture.configPath], { encoding: "utf8" }));
    expect(decisions).toEqual([
      { required: { a: true, b: true }, run: { a: true, b: true } },
      { required: { a: true, b: true }, run: { a: false, b: true } },
      { required: { a: false, b: true }, run: { a: false, b: false } },
      { required: { a: true, b: true }, run: { a: true, b: true } },
    ]);
  });

  test("binds opaque job artifacts without asking the executor to handle plan metadata", () => {
    const fixture = createRepository();
    const config = JSON.parse(readFileSync(fixture.configPath, "utf8"));
    config.workflows.ci.workloads.a.products = "manifest";
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const plan = runPlan(fixture);
    const output = path.join(fixture.root, "products");
    const args = [convergenceScript, "--config", fixture.configPath, "contribute",
      "--pending", fixture.pendingPath, "--workload", "a", "--product", "capsule",
      "--artifact", "capsule-output", "--output", output];
    execFileSync("python3", args, { encoding: "utf8" });
    expect(JSON.parse(readFileSync(path.join(output, "a/product-manifest.json"), "utf8"))).toEqual({
      workload: "a", digest: workload(plan.pending.workloads, "a").digest,
      executionClass: { runnerClass: "worker", labels: ["ubuntu-24.04"] },
      products: { capsule: { type: "job", source: "capsule-output" } },
    });
    const pending = JSON.parse(readFileSync(fixture.pendingPath, "utf8"));
    pending.workloads.a.run = false;
    pending.workloads.a.resultHit = true;
    writeFileSync(fixture.pendingPath, JSON.stringify(pending));
    const refused = spawnSync("python3", args, { encoding: "utf8" });
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toContain("selected execution");
  });

  test("binds declared artifacts in one control-plane batch and excludes cache hits", () => {
    const fixture = createRepository();
    const config = JSON.parse(readFileSync(fixture.configPath, "utf8"));
    for (const id of ["a", "b"]) {
      config.workflows.ci.workloads[id].products = "manifest";
      config.workflows.ci.workloads[id].artifact = { product: "tool", prefix: `tool-${id}` };
    }
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const first = runPlan(fixture);
    config.workflows.ci.workloads.a.artifact.prefix = "renamed-tool";
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const second = runPlan(fixture);
    expect(second.pending.workloads.a!.digest).not.toBe(first.pending.workloads.a!.digest);
    expect(second.pending.workloads.b!.digest).toBe(first.pending.workloads.b!.digest);
    const pending = JSON.parse(readFileSync(fixture.pendingPath, "utf8"));
    pending.workloads.b.run = false;
    pending.workloads.b.resultHit = true;
    writeFileSync(fixture.pendingPath, JSON.stringify(pending));
    const output = path.join(fixture.root, "products");
    const args = [convergenceScript, "--config", fixture.configPath, "contribute-all",
      "--pending", fixture.pendingPath, "--source-commit", "a".repeat(40), "--output", output];
    execFileSync("python3", args);
    expect(JSON.parse(readFileSync(path.join(output, "a/product-manifest.json"), "utf8")).products)
      .toEqual({ tool: { type: "job", source: "renamed-tool-" + "a".repeat(40) } });
    expect(() => readFileSync(path.join(output, "b/product-manifest.json"))).toThrow();
    expect(spawnSync("python3", args.map(arg => arg === "a".repeat(40) ? "short" : arg)).status).not.toBe(0);
    pending.workloads.a.run = false;
    pending.policy = "stale";
    writeFileSync(fixture.pendingPath, JSON.stringify(pending));
    const refused = spawnSync("python3", args, { encoding: "utf8" });
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toContain("contract differs");
  });

  test("projects only exact artifact bindings to consumers, never cache decisions or workload identities", () => {
    const result = JSON.parse(execFileSync("python3", ["-c", [
      "import json, sys", "sys.path.insert(0, sys.argv[1])",
      "from convergence import product_inputs",
      "entry = {'scopeEnabled': True, 'run': False, 'resultHit': True, 'digest': 'planner-only', 'result': {'products': {'capsule': {'type': 'url', 'source': 'https://cache.invalid/capsule.zip', 'data': {'sha256': 'a' * 64}}}}}",
      "pending = {'workloads': {'capsule': entry, 'disabled': {**entry, 'scopeEnabled': False}, 'executing': {**entry, 'run': True}}}",
      "print(json.dumps(product_inputs(pending)))",
    ].join("\n"), path.dirname(convergenceScript)], { encoding: "utf8" }));
    expect(result).toEqual({ "capsule/capsule": { url: "https://cache.invalid/capsule.zip", sha256: "a".repeat(64) } });
  });

  test("isolates atomic workflow policy changes through the actual calculator", () => {
    const fixture = createRepository();
    const original = JSON.parse(readFileSync(fixture.configPath, "utf8"));
    const lanes = ["release-exact", "release-prerelease", "release-stable"];
    for (const name of lanes) {
      const declaration = {
        schema: original.schema,
        suites: { ...original.suites, "convergence-control": ["control.txt", `${name}.json`] },
        workflows: { [name]: original.workflows.ci },
      };
      writeFileSync(path.join(fixture.root, `${name}.json`), JSON.stringify(declaration));
    }
    execFileSync("git", ["add", "."], { cwd: fixture.root });
    const calculate = () => JSON.parse(execFileSync("python3", ["-c", [
      "import json, sys", "from pathlib import Path", "sys.path.insert(0, sys.argv[1])",
      "from convergence import ConvergenceContract, calculate",
      "root = Path(sys.argv[2])",
      "print(json.dumps({name: calculate(ConvergenceContract(root / (name + '.json')), root, name, {'worker': ['fixture']}) for name in sys.argv[3:]}))",
    ].join("\n"), path.dirname(convergenceScript), fixture.root, ...lanes], { encoding: "utf8" }));
    const before = calculate();
    const changedPath = path.join(fixture.root, "release-exact.json");
    const changed = JSON.parse(readFileSync(changedPath, "utf8"));
    changed.workflows["release-exact"].policy = "test-v2";
    writeFileSync(changedPath, JSON.stringify(changed));
    execFileSync("git", ["add", "release-exact.json"], { cwd: fixture.root });
    const after = calculate();
    expect(after["release-exact"]).not.toEqual(before["release-exact"]);
    expect(after["release-prerelease"]).toEqual(before["release-prerelease"]);
    expect(after["release-stable"]).toEqual(before["release-stable"]);
    expect(before["release-exact"].a.digest).not.toBe(before["release-stable"].a.digest);
  });

  test("keeps broad test workloads on tracked-tree inputs until their closure is proven", () => {
    const config = JSON.parse(readFileSync(
      path.join(repoRoot, ".github", "config", "convergence.json"),
      "utf8",
    )) as any;

    expect(config.workflows.ci.workloads.daemon_unit_tests.inputs).toEqual(["*"]);
    expect(config.workflows.ci.workloads.e2e_vitest.inputs).toEqual(["*"]);
  });

  test("materializes the convergence handoff from the GitHub event context", () => {
    const fixture = createRepository();
    runPlan(fixture);
    const eventPath = path.join(fixture.root, "event.json");
    const outputPath = path.join(fixture.root, "handoff-output.txt");
    const handoffRoot = path.join(fixture.root, "handoff-root");
    const headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: fixture.root, encoding: "utf8" }).trim();
    writeFileSync(eventPath, JSON.stringify({
      repository: { id: 42, full_name: "example/repo" },
      pull_request: { head: { sha: headSha }, base: { sha: headSha } },
    }));
    writeFileSync(outputPath, "");
    execFileSync("python3", [
      convergenceScript, "--root", fixture.root, "--config", fixture.configPath,
      "handoff", "--pending", fixture.pendingPath,
      "--products-root", path.join(fixture.root, "products"),
      "--handoff-root", handoffRoot,
    ], {
      cwd: fixture.root,
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_REPOSITORY: "example/repo",
        GITHUB_REPOSITORY_ID: "42",
        GITHUB_RUN_ID: "12",
        GITHUB_RUN_ATTEMPT: "1",
        GITHUB_OUTPUT: outputPath,
      },
    });
    const metadata = JSON.parse(readFileSync(
      path.join(handoffRoot, "handoff", "convergence", "ci-results", "metadata.json"),
      "utf8",
    )) as Record<string, unknown>;
    expect(metadata).toMatchObject({
      repository_id: 42, repository: "example/repo", workflow: "ci", policy: "test-v1",
      event: "pull_request", run_id: 12, run_attempt: 1, head_sha: headSha,
    });
    expect(readFileSync(outputPath, "utf8")).toContain("name=handoff-convergence-ci-results");

    writeFileSync(eventPath, JSON.stringify({
      repository: { id: 42, full_name: "example/repo" },
      workflow_run: {
        id: 12, run_attempt: 1, name: "ci", event: "pull_request", head_sha: headSha,
        status: "completed", conclusion: "success",
        head_repository: { full_name: "example/repo" },
      },
    }));
    writeFileSync(outputPath, "");
    execFileSync("git", ["remote", "add", "origin", fixture.root], { cwd: fixture.root });
    execFileSync("python3", [
      convergenceScript, "--root", fixture.root, "--config", fixture.configPath,
      "admit", "--handoff-root", handoffRoot,
    ], {
      cwd: fixture.root,
      env: { ...process.env, GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath },
    });
    expect(readFileSync(outputPath, "utf8")).toContain("publish=true");
  });

  test("rejects dependency cycles and dangling suites before planning", () => {
    const fixture = createRepository();
    const config = JSON.parse(readFileSync(fixture.configPath, "utf8")) as any;
    config.suites.web = ["suite://web"];
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const cycle = spawnSync("python3", [
      convergenceScript, "--root", fixture.root, "--config", fixture.configPath, "validate",
    ], { cwd: fixture.root, encoding: "utf8" });
    expect(cycle.status).toBe(2);
    expect(cycle.stderr).toContain("convergence dependency cycle");

    config.suites.web = ["suite://missing"];
    writeFileSync(fixture.configPath, JSON.stringify(config));
    const dangling = spawnSync("python3", [
      convergenceScript, "--root", fixture.root, "--config", fixture.configPath, "validate",
    ], { cwd: fixture.root, encoding: "utf8" });
    expect(dangling.status).toBe(2);
    expect(dangling.stderr).toContain("references unknown suite://missing");
  });

  test("publishes a multi-product manifest atomically only after every product is a URL", () => {
    const root = mkdtempSync(path.join(tmpdir(), "convergence-products-"));
    temporaryRoots.push(root);
    const candidatePath = path.join(root, "candidate.json");
    writeFileSync(candidatePath, JSON.stringify(candidate({
      bundle: { type: "url", source: "https://results.example/bundle.zip", data: { sha256: "a".repeat(64) } },
      report: { type: "url", source: "https://results.example/report.json" },
    })));
    execFileSync("python3", [
      convergenceScript, "prepare-publication", "--candidate", candidatePath,
      "--output-dir", path.join(root, "receipts"),
    ], { cwd: repoRoot });

    writeFileSync(candidatePath, JSON.stringify(candidate({
      bundle: { type: "job", source: "build-products" },
      report: { type: "url", source: "https://results.example/report.json" },
    })));
    const rejected = spawnSync("python3", [
      convergenceScript, "prepare-publication", "--candidate", candidatePath,
      "--output-dir", path.join(root, "rejected"),
    ], { cwd: repoRoot, encoding: "utf8" });
    expect(rejected.status).toBe(2);
    expect(rejected.stderr).toContain("must be promoted to url before publication");
  });
});
