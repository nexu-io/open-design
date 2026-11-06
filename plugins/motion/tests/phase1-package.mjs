import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {mkdtemp, mkdir, readFile, readdir, writeFile, stat, realpath, copyFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createInterface} from 'node:readline';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
const archive=process.argv[2];assert.ok(path.isAbsolute(archive));
const work=await realpath(await mkdtemp(path.join(tmpdir(),'om-phase1-package-')));
const evidence=process.argv[3]?path.resolve(process.argv[3]):path.join(work,'evidence');await mkdir(evidence,{recursive:true});
const extracted=path.join(work,'extracted');await mkdir(extracted);
assert.equal(spawnSync('unzip',['-q',archive,'-d',extracted]).status,0);
const root=path.join(extracted,'motion'),data=path.join(work,'user-data');
const expected=['motion_create_project','motion_open_preview','motion_import_assets','motion_get_project','motion_edit_project','motion_export_request','motion_list_versions','motion_restore_version','motion_export_cancel'];
assert.deepEqual((await readdir(path.join(root,'skills'))).sort(),['motion-director','motion-production','motion-recreate','template-to-video']);
assert.equal(JSON.parse(await readFile(path.join(root,'shared/mcp-release.json'))).profile,'phase1');
await assert.rejects(stat(path.join(root,'node_modules')),{code:'ENOENT'});
const version=JSON.parse(await readFile(path.join(root,'package.json'))).version;
const sock=createServer();await new Promise(resolve=>sock.listen(0,'127.0.0.1',resolve));const port=sock.address().port;await new Promise(resolve=>sock.close(resolve));
const child=spawn(process.execPath,['--experimental-strip-types',path.join(root,'mcp.ts')],{cwd:tmpdir(),env:{...process.env,MOTION_DATA_DIR:data,PORT:String(port)},stdio:['pipe','pipe','pipe']});
let stderr='',counter=0;const pending=new Map(), calledTools=new Set(), calls=[];child.stderr.on('data',d=>stderr+=d);
createInterface({input:child.stdout}).on('line',line=>{try{const item=JSON.parse(line);const slot=pending.get(item.id);if(slot){clearTimeout(slot.timer);pending.delete(item.id);item.error?slot.reject(Error(JSON.stringify(item.error))):slot.resolve(item.result);}}catch(e){stderr+='\nNON-JSON STDOUT '+line;}});
function rpc(method,params={}){return new Promise((resolve,reject)=>{const id=++counter;const timer=setTimeout(()=>reject(Error('RPC TIMEOUT '+method)),300000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
async function tool(name,args){const response=await rpc('tools/call',{name,arguments:args});calls.push({name,arguments:args,result:response.structuredContent,isError:Boolean(response.isError)});assert.ok(!response.isError,JSON.stringify(response));calledTools.add(name);return response.structuredContent;}
async function waitJob(projectId,jobId,terminal){const deadline=Date.now()+120000;for(;;){const result=(await tool('motion_get_project',{projectId,exportJobId:jobId})).exportJob;assert.notEqual(result.state,'failed',JSON.stringify(result));if(terminal(result))return result;assert.ok(Date.now()<deadline,JSON.stringify(result));await new Promise(r=>setTimeout(r,250));}}
let owned;let report;
try{
 const init=await rpc('initialize',{protocolVersion:'2025-11-25'});assert.equal(init.serverInfo.version,version);
 const names=(await rpc('tools/list')).tools.map(t=>t.name);assert.deepEqual(names,expected);
 const hidden=await rpc('tools/call',{name:'motion_write_files',arguments:{}});assert.equal(hidden.isError,true);assert.equal(hidden.structuredContent.error.code,'MCP_TOOL_NOT_EXPOSED');
 const prototype=await rpc('tools/call',{name:'motion_get_project',arguments:JSON.parse('{"__proto__":true}')});assert.equal(prototype.isError,true);assert.equal(prototype.structuredContent.error.code,'INVALID_ARGUMENT');
 const guidance=await rpc('resources/read',{uri:'motion://workflow/production/start'});assert.ok(guidance.contents[0].text.includes('motion-production'));
 const p=await tool('motion_create_project',{requestId:'create',projectType:'natural_language',title:'ZIP smoke',requirements:'真实原生文件、音轨、版本恢复和MP4导出'});
 owned=JSON.parse(await readFile(path.join(data,'preview.json')));assert.ok(owned.pid>0);
 assert.equal((await tool('motion_create_project',{requestId:'create',projectType:'natural_language',title:'ZIP smoke',requirements:'真实原生文件、音轨、版本恢复和MP4导出'})).projectId,p.projectId);
 const guide=await rpc('resources/read',{uri:'motion://engine/SKILL.md'});assert.ok(guide.contents[0].text.length>100);
 const runtimeKey=createHash('sha256').update(await readFile(path.join(root,'package-lock.json'))).digest('hex').slice(0,16);
 assert.equal(await readFile(path.join(data,'runtime',runtimeKey,'ready'),'utf8'),runtimeKey);
 const wav=path.join(work,'tone.wav');assert.equal(spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=duration=1',wav]).status,0);
 const imported=await tool('motion_import_assets',{projectId:p.projectId,requestId:'import',items:[{itemId:'audio',sourcePath:wav}]});assert.equal(imported.status,'completed');
 const html=`<!doctype html><html><head><meta charset="utf-8"><script src="assets/gsap.min.js"></script><style>body{margin:0}#main{position:relative;width:320px;height:180px;overflow:hidden;background:#d3e7ae}#box{position:absolute;top:60px;left:20px;width:40px;height:40px;background:#203021}</style></head><body><div id="main" data-composition-id="main" data-start="0" data-duration="1" data-width="320" data-height="180" data-fps="10"><div id="box"></div><audio id="tone" class="clip" src="${imported.items[0].path}" data-start="0" data-duration="1" data-track-index="1" data-volume="0.3"></audio></div><script>const tl=gsap.timeline({paused:true});tl.fromTo('#box',{x:0},{x:200,duration:1,ease:'none'},0);window.__timelines={main:tl};</script></body></html>`;
 const original=await tool('motion_edit_project',{projectId:p.projectId,requestId:'film',expectedRevision:imported.revision,expectedVersionId:imported.version.versionId,files:[{path:'index.html',content:html}]});
 const later=await tool('motion_edit_project',{projectId:p.projectId,requestId:'later',expectedRevision:original.revision,expectedVersionId:original.version.versionId,files:[{path:'note.txt',content:'later version retained'}]});
 const restored=await tool('motion_restore_version',{projectId:p.projectId,requestId:'restore',versionId:original.version.versionId,expectedRevision:later.revision,expectedVersionId:later.version.versionId});
 assert.equal(restored.revision,original.revision);assert.ok(restored.version.versionNumber>later.version.versionNumber);
 assert.ok((await tool('motion_list_versions',{projectId:p.projectId})).versions.some(v=>v.versionId===later.version.versionId));
 const preview=await tool('motion_open_preview',{projectId:p.projectId});assert.equal((await fetch(preview.previewUrl)).status,200);
 const current=await tool('motion_get_project',{projectId:p.projectId});
 const exported=await tool('motion_export_request',{projectId:p.projectId,requestId:'export',expectedRevision:current.revision,versionId:current.currentVersionId,audio:'required'});
 const completed=await waitJob(p.projectId,exported.job.id,j=>j.state==='completed');assert.equal(completed.verification.status,'passed',JSON.stringify(completed.verification));
 assert.ok((await stat(completed.path)).size>1000);assert.equal((await fetch(completed.downloadUrl)).status,200);
 const frames=spawnSync('ffmpeg',['-v','error','-i',completed.path,'-map','0:v:0','-an','-vf','select=eq(n\\,0)+eq(n\\,5)','-fps_mode','passthrough','-f','framemd5','-'],{encoding:'utf8',timeout:30000});assert.equal(frames.status,0,frames.stderr);const hashes=frames.stdout.split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split(',').at(-1).trim());assert.equal(hashes.length,2);assert.notEqual(hashes[0],hashes[1]);
 const queued=await tool('motion_export_request',{projectId:p.projectId,requestId:'cancel-export',expectedRevision:current.revision,versionId:current.currentVersionId,audio:'required'});
 await tool('motion_export_cancel',{projectId:p.projectId,requestId:'cancel',jobId:queued.job.id});assert.equal((await waitJob(p.projectId,queued.job.id,j=>j.state==='cancelled')).state,'cancelled');
 assert.equal((await tool('motion_get_project',{projectId:p.projectId,exportJobId:completed.id})).exportJob.state,'completed');
 assert.deepEqual([...calledTools].sort(),[...expected].sort(),'E2E must successfully call every public Tool');
 await copyFile(completed.path,path.join(evidence,'export.mp4'));
 report={status:'passed',executionEnvironment:process.env.CI?'ci':'local',version:init.serverInfo.version,archive,archiveSHA256:createHash('sha256').update(await readFile(archive)).digest('hex'),work,root,data,tools:names,skills:(await readdir(path.join(root,'skills'))).sort(),checks:{isolatedExtraction:true,noWorktreeNodeModules:true,freshLockedRuntimeInstall:true,allNineToolsCalled:true,hiddenCallsRejected:true,pinnedGuideResource:true,creationReplay:true,realAttachment:true,restoreRetainsLaterVersions:true,studioPreview:true,verifiedAudioMP4:true,actualMotionFrames:true,cancelledExport:true,historicalCompletedResult:true},export:{id:completed.id,path:completed.path,downloadUrl:completed.downloadUrl,verification:completed.verification},notRun:['independent_player_audio_review','four_hosts_model_turn','other_platforms','publish']};
 await writeFile(path.join(evidence,'packaged-smoke-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,version:report.version,tools:names.length,skills:report.skills.length,archiveSHA256:report.archiveSHA256,work}));
}catch(error){await writeFile(path.join(evidence,'packaged-smoke-failure.log'),String(error.stack)+'\n'+stderr);throw error;}
finally{
 child.stdin.end();for(const item of pending.values())clearTimeout(item.timer);
 if(owned?.pid){const health=await fetch(`http://127.0.0.1:${owned.port}/api/health`).then(r=>r.json()).catch(()=>null);if(health?.version===version&&path.resolve(health.dataDirectory)===path.resolve(data))process.kill(owned.pid,'SIGTERM');}
 await writeFile(path.join(evidence,'tool-calls.json'),JSON.stringify(calls,null,2));
 await copyFile(path.join(data,'preview.log'),path.join(evidence,'preview.log')).catch(error=>{if(error.code!=='ENOENT')throw error;});
 await writeFile(path.join(evidence,'packaged-mcp-stderr.log'),stderr);
}
