import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { resolveLauncherPaths, resolveLauncherVersionPaths, type LauncherHost } from "@open-design/launcher-proto";
const mocked=vi.hoisted(()=>({host:null as LauncherHost|null}));
vi.mock("@open-design/launcher-proto",async original=>({...await original<object>(),readLauncherHost:()=>mocked.host}));
import { cleanupLauncherPayloadRoots, activatePreparedLauncherPayloadRelease } from "../../../src/main/updater/payload.js";
import { launchPayloadAppAfterQuit } from "../../../src/main/updater/deferred-launch.js";
import { resolveDesktopUpdaterConfig } from "../../../src/main/updater/config.js";
import type { LoadedRelease } from "../../../src/main/updater.js";
const roots:string[]=[];
afterEach(async()=>{mocked.host=null;await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})));});
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),"hosted-updater-"));roots.push(root);
 const paths=resolveLauncherPaths({root,namespace:"test",channel:"stable"});
 const next=resolveLauncherVersionPaths({...paths,version:"1.1.0"});
 const bundle=join(next.payloadRoot,"Open Design.app"), resources=join(bundle,"Contents","Resources");
 await mkdir(join(resources,"open-design"),{recursive:true});await mkdir(join(bundle,"Contents","MacOS"),{recursive:true});
 await writeFile(join(bundle,"Contents","MacOS","Open Design"),"binary");await writeFile(join(resources,"open-design-config.json"),"{}");
 await writeFile(next.manifestPath,JSON.stringify({schemaVersion:1,channel:"stable",namespace:"test",version:"1.1.0",platform:"darwin",payloadRoot:"payload",entry:{cwd:"payload/Open Design.app",executable:"payload/Open Design.app/Contents/MacOS/Open Design"}}));
 await mkdir(paths.stateRoot,{recursive:true});
 const runtime={schemaVersion:1 as const,channel:"stable" as const,namespace:"test",active:{version:"1.0.0",generation:0},lastSuccessful:{version:"1.0.0",generation:0}};
 await writeFile(paths.runtimePath,JSON.stringify(runtime));
 const running=join(paths.versionsRoot,"0.9.0","payload","Open Design.app","Contents","Resources","app");await mkdir(running,{recursive:true});
 const config=resolveDesktopUpdaterConfig({source:"packaged",platform:"darwin",namespace:"test",launcherRoot:root,launcherRuntimePath:paths.runtimePath,downloadRoot:join(root,"updates"),env:{OD_UPDATE_CURRENT_VERSION:"1.0.0"}});
 const activated={...runtime,active:{version:"1.1.0",generation:1}};
 const host={contractVersion:1,installedAppPath:join(root,"installed.app"),namespaceBaseRoot:join(root,"namespaces"),selection:null,rolledBackFromVersion:null,running:{version:"0.9.0",source:"payload",appRoot:running,resourcesPath:dirname(running),executablePath:join(running,"unused")},snapshot:()=>runtime,validateCandidate:vi.fn(async()=>{}),protectsResource:vi.fn(async path=>path===join(paths.versionsRoot,"0.9.0")),reportReady:vi.fn(),resetFailedLaunch:vi.fn(),activateCandidate:vi.fn(async()=>activated),onSecondInstance:vi.fn(),requestRelaunch:vi.fn(async()=>{})} satisfies LauncherHost;
 mocked.host=host;
 return {root,paths,next,running,config,runtime,host,activated};
}
it("keeps hosted code after pointers have advanced and the physical executable is outside its version directory",async()=>{
 const f=await fixture();await writeFile(join(f.running,"late-resource"),"needed");
 await cleanupLauncherPayloadRoots({config:f.config,currentRuntime:f.runtime,keepVersions:new Set(["1.0.0","1.1.0"]),logger:{warn:vi.fn(),info:vi.fn(),error:vi.fn()},now:()=>new Date(),trigger:"activate",versionPaths:f.next,removeLauncherPayloadRoot:path=>rm(path,{recursive:true,force:true})});
 expect(await readFile(join(f.running,"late-resource"),"utf8")).toBe("needed");
});
it("delegates activation to the host without writing the legacy runtime or attempt journal",async()=>{
 const f=await fixture();const before=await readFile(f.paths.runtimePath,"utf8");
 const result=await activatePreparedLauncherPayloadRelease({config:f.config,activeRelease:{ref:{version:"1.1.0"}} as LoadedRelease,logger:{warn:vi.fn(),info:vi.fn(),error:vi.fn()},now:()=>new Date(),removeLauncherPayloadRoot:path=>rm(path,{recursive:true,force:true})});
 expect(f.host.activateCandidate).toHaveBeenCalledWith("1.1.0");expect(result).toEqual({launchPath:f.host.installedAppPath,runtime:f.activated});
 expect(await readFile(f.paths.runtimePath,"utf8")).toBe(before);await expect(readFile(f.paths.attemptsPath)).rejects.toThrow();
});
it("reopens through the installed host after update rather than spawning the payload executable",async()=>{
 const f=await fixture();const spawnDetached=vi.fn();const delegated={version:"1.1.0",generation:1};
 const result=await launchPayloadAppAfterQuit({appPid:1234,cwd:f.root,launchPath:"payload.exe",root:f.root,timeoutMs:5000,delegated},{now:()=>new Date(),spawnDetached});
 expect(result).toEqual({});expect(f.host.requestRelaunch).toHaveBeenCalledWith();expect(spawnDetached).not.toHaveBeenCalled();
});

it("downloads and installs through a hosted app directory, and does not silently reinstall a rolled-back release", async () => {
 const f=await fixture();await mkdir(f.host.installedAppPath,{recursive:true});
 const {createDesktopUpdater}=await import("../../../src/main/updater.js");
 const {createHash}=await import("node:crypto");const bytes=Buffer.from("payload archive fixture");
 let version="1.1.0";
 const fetchFixture=(async(input:Parameters<typeof fetch>[0])=>{
  const url=String(input);
  if(url.endsWith("metadata.json"))return Response.json({version:1,channel:"stable",baseVersion:version,releaseVersion:version,stableVersion:version,platforms:{mac:{arch:"arm64",enabled:true,artifacts:{payload:{name:"payload.zip",url:"https://fixture.test/payload.zip",sha256Url:"https://fixture.test/payload.sha256",size:bytes.length},dmg:{name:"installer.dmg",url:"https://fixture.test/installer.dmg",sha256Url:"https://fixture.test/payload.sha256",size:bytes.length}}}}});
  if(url.endsWith(".sha256"))return new Response(createHash("sha256").update(bytes).digest("hex"));
  return new Response(bytes,{headers:{"content-length":String(bytes.length)}});
 }) as typeof fetch;
 const makeUpdater=()=>createDesktopUpdater({arch:"arm64",platform:"darwin",source:"packaged",namespace:"test",currentVersion:"1.0.0",downloadRoot:join(f.root,"updates"),launcherRoot:f.root,launcherRuntimePath:f.paths.runtimePath,launcherLaunchPath:f.host.installedAppPath,env:{OD_UPDATE_ENABLED:"1",OD_UPDATE_CURRENT_VERSION:"1.0.0",OD_UPDATE_METADATA_URL:"https://fixture.test/metadata.json",OD_UPDATE_OPEN_DRY_RUN:"0"}},{fetch:fetchFixture,logger:{info:vi.fn(),warn:vi.fn(),error:vi.fn()}});
 const updater=makeUpdater();expect((await updater.checkForUpdates()).state).toBe("downloaded");
 const installed=await updater.installUpdate();expect(installed.error).toBeUndefined();expect(installed.installResult?.launchPath).toBe(f.host.installedAppPath);
 expect(f.host.requestRelaunch).toHaveBeenCalled();
 mocked.host={...f.host,rolledBackFromVersion:"1.1.0"};
 const rolledBack=makeUpdater();expect((await rolledBack.status()).active).toBeUndefined();
 expect((await rolledBack.checkForUpdates({autoDownload:false})).state).toBe("not-available");
 version="1.2.0";expect((await rolledBack.checkForUpdates({autoDownload:false})).state).toBe("available");
});
