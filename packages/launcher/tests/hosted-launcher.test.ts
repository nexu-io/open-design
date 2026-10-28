import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { selectAppEntry, startLauncher } from "../src/index.js";
vi.mock("../src/platforms/macos/dock-entry.js", () => ({ repairMacDockEntries: vi.fn(async () => ({status:"unchanged"})) }));
vi.mock("../src/platforms/macos/launch-services.js", () => ({ refreshMacApplicationRegistration: vi.fn(async () => ({status:"skipped"})) }));
const environment = {contractVersion:1, platform:"darwin", arch:process.arch, electronVersion:"41.3.0"};
import { createMacLauncherPlatform } from "../src/platforms/macos/index.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, {recursive:true,force:true}))); });
async function fixture() {
 const root=await mkdtemp(join(tmpdir(),"launcher-host-")); roots.push(root);
 const resources=join(root,"Open Design.app","Contents","Resources");
 const appRoot=join(resources,"app"); await mkdir(appRoot,{recursive:true});
 const base=join(root,"data","namespaces");
 await writeFile(join(resources,"open-design-config.json"),JSON.stringify({appVersion:"1.0.0",namespace:"default",namespaceBaseRoot:base,launcherHost:environment}));
 const trace: string[]=[]; const listeners=new Map<string,(...args:unknown[])=>void>();
 const app={getPath:()=>join(root,"default-user-data"),setPath:vi.fn(()=>trace.push("path")),setAppPath:vi.fn(),requestSingleInstanceLock:vi.fn(()=>{trace.push("lock");return true;}),on:vi.fn((event:string,fn:(...args:unknown[])=>void)=>{listeners.set(event,fn);}),exit:vi.fn()};
 const published:unknown[]=[];
 const options={app,appRoot,bundledEntry:"./prebundled/packaged-main.mjs",resourcesPath:resources,executablePath:join(resources,"..","MacOS","Open Design"),electronVersion:"41.3.0",env:{},argv:[] as string[],platform:"darwin" as NodeJS.Platform,publish:(x:unknown)=>published.push(x)};
 const launcher=join(root,"data","launcher","channels","stable","namespaces","default");
 return {root,resources,appRoot,base,app,trace,listeners,published,options,launcher};
}
it("takes the namespace lock before creating launcher state; a duplicate writes nothing",async()=>{
 const f=await fixture(); f.app.requestSingleInstanceLock.mockReturnValue(false);
 expect(await selectAppEntry(f.options)).toBeNull(); expect(f.app.exit).toHaveBeenCalledWith(0);
 await expect(readFile(join(f.launcher,"runtime.json"))).rejects.toThrow(); expect(f.published).toEqual([]);
});
it("same-version installer replacement seeds a hosted baseline rather than inheriting failed legacy state",async()=>{
 const f=await fixture(); await mkdir(join(f.launcher,"state"),{recursive:true});
 await writeFile(join(f.launcher,"runtime.json"),JSON.stringify({schemaVersion:1,channel:"stable",namespace:"default",active:{version:"1.0.0",generation:9},lastSuccessful:{version:"0.9.0",generation:8}}));
 await writeFile(join(f.launcher,"state","attempt.json"),JSON.stringify({version:"1.0.0",generation:9}));
 expect(await selectAppEntry(f.options)).toMatchObject({source:"bundled"});
 const state=JSON.parse(await readFile(join(f.launcher,"runtime.json"),"utf8"));
 expect(state.active).toEqual({version:"1.0.0",generation:0}); expect(state.lastSuccessful).toEqual(state.active);
 expect(f.published).toHaveLength(1); expect(f.trace[0]).toBe("path"); expect(f.trace[1]).toBe("lock");
});
it("does not touch non-macOS or inherited old-supervisor launches",async()=>{
 const f=await fixture();
 expect(await selectAppEntry({...f.options,platform:"win32"})).toMatchObject({source:"legacy"});
 expect(await selectAppEntry({...f.options,env:{OD_SIDECAR_SUPERVISED_CONTEXT:"legacy"}})).toMatchObject({source:"legacy"});
 expect(f.app.requestSingleInstanceLock).not.toHaveBeenCalled();expect(f.published).toEqual([]);
});

async function addPayload(f: Awaited<ReturnType<typeof fixture>>, version: string, overrides: Record<string,unknown> = {}) {
 const versionRoot=join(f.launcher,"versions",version), bundle=join(versionRoot,"payload","Open Design.app");
 const resources=join(bundle,"Contents","Resources"), root=join(resources,"app");
 await mkdir(join(root,"prebundled"),{recursive:true}); await mkdir(join(bundle,"Contents","MacOS"),{recursive:true});
 await writeFile(join(bundle,"Contents","MacOS","Open Design"),"binary");
 await writeFile(join(root,"prebundled","packaged-main.mjs"),"export const version = '"+version+"';");
 await writeFile(join(resources,"open-design-config.json"),JSON.stringify({appVersion:version,namespace:"default",namespaceBaseRoot:f.base,launcherHost:environment}));
 await writeFile(join(versionRoot,"manifest.json"),JSON.stringify({schemaVersion:1,platform:"darwin",channel:"stable",namespace:"default",version,host:{...environment,appRoot:`payload/Open Design.app/Contents/Resources/app`,resourcesPath:`payload/Open Design.app/Contents/Resources`,entry:`payload/Open Design.app/Contents/Resources/app/prebundled/packaged-main.mjs`},entry:{cwd:"payload/Open Design.app",executable:"payload/Open Design.app/Contents/MacOS/Open Design"},...overrides}));
 return {root,resources,versionRoot};
}
async function boot(f: Awaited<ReturnType<typeof fixture>>, argv: string[] = []) {
 await selectAppEntry({...f.options,argv});
 return f.published.at(-1) as import("@open-design/launcher-proto").LauncherHost;
}
it("loads newer code in the installed process and confirms the delegated generation",async()=>{
 const f=await fixture(); const initial=await boot(f); await initial.reportReady(); const next=await addPayload(f,"1.1.0");
 const activated=await initial.activateCandidate("1.1.0");
 const host=await boot(f,["--od-launcher-delegated-version","1.1.0","--od-launcher-delegated-generation",String(activated.active!.generation)]);
 expect(host.running).toMatchObject({version:"1.1.0",source:"payload",appRoot:next.root,resourcesPath:next.resources});
 expect(host.installedAppPath).toBe(join(f.root,"Open Design.app")); expect(f.app.setAppPath).toHaveBeenCalledWith(next.root);
 await host.reportReady();expect(host.snapshot().lastSuccessful).toEqual(activated.active);
 await expect(readFile(join(f.launcher,"state","attempt.json"))).rejects.toThrow();
});
it("rolls an unconfirmed generation back to bundled code, then accepts a later good update",async()=>{
 const f=await fixture();const initial=await boot(f);await initial.reportReady();await addPayload(f,"1.1.0");
 const active=await initial.activateCandidate("1.1.0");
 // A normal cold start sees the unconfirmed attempt and must not retry it.
 const rollback=await boot(f); expect(rollback.running.source).toBe("bundled");expect(rollback.rolledBackFromVersion).toBe("1.1.0");
 await rollback.reportReady(); expect(rollback.snapshot().lastSuccessful?.version).toBe("1.0.0");
 expect(JSON.parse(await readFile(join(f.launcher,"state","attempt.json"),"utf8"))).toMatchObject(active.active!);
 await addPayload(f,"1.2.0");const good=await rollback.activateCandidate("1.2.0");
 const recovered=await boot(f,["--od-launcher-delegated-version","1.2.0","--od-launcher-delegated-generation",String(good.active!.generation)]);
 await recovered.reportReady();expect(recovered.snapshot().lastSuccessful?.version).toBe("1.2.0");
});
it("keeps a physical newer compatible payload when a same-version installer is applied",async()=>{
 const f=await fixture();await addPayload(f,"1.2.0");await mkdir(join(f.launcher,"state"),{recursive:true});
 await writeFile(join(f.launcher,"runtime.json"),JSON.stringify({schemaVersion:1,channel:"stable",namespace:"default",active:{version:"1.2.0",generation:4},lastSuccessful:{version:"1.1.0",generation:3}}));
 const host=await boot(f);expect(host.running.version).toBe("1.2.0");expect(host.snapshot().lastSuccessful?.version).toBe("1.0.0");
});
it("rejects incompatible payload activation before changing the active journal",async()=>{
 const f=await fixture();const host=await boot(f);await host.reportReady();await addPayload(f,"1.1.0",{host:{...environment,electronVersion:"42.0.0"}});
 const before=await readFile(join(f.launcher,"runtime.json"),"utf8");
 await expect(host.activateCandidate("1.1.0")).rejects.toThrow("not compatible");
 expect(await readFile(join(f.launcher,"runtime.json"),"utf8")).toBe(before);
});
it("rejects manifest paths escaping the version directory before activation",async()=>{
 const f=await fixture();const host=await boot(f); await addPayload(f,"1.1.0",{entry:{cwd:"../../../../Open Design.app",executable:"../../../../Open Design.app/Contents/MacOS/Open Design"}});
 await expect(host.activateCandidate("1.1.0")).rejects.toThrow();expect(host.snapshot().active?.version).toBe("1.0.0");
});
it("buffers duplicate-instance arguments until the payload can focus or restore its window",async()=>{
 const f=await fixture();const host=await boot(f);f.listeners.get("second-instance")?.({},["opendesign://workspace/open"]);
 const listener=vi.fn();host.onSecondInstance(listener);expect(listener).toHaveBeenCalledWith(["opendesign://workspace/open"]);
});
it("redirects a directly opened cached app only after a new installer owns that namespace",async()=>{
 const f=await fixture();const cached=await addPayload(f,"1.1.0"); const open=vi.fn(async()=>{});
 const options={...f.options,appRoot:cached.root,resourcesPath:cached.resources,executablePath:join(cached.resources,"..","MacOS","Open Design"),adapter:{...createMacLauncherPlatform("41.3.0",process.arch),openInstalled:open}};
 expect(await startLauncher(options)).toMatchObject({source:"legacy"});expect(open).not.toHaveBeenCalled();
 await writeFile(join(f.resources,"open-design-config.json"),JSON.stringify({appVersion:"1.0.0",namespace:"default",namespaceBaseRoot:f.base,launcherHost:environment}));
 await boot(f);
 expect(await startLauncher({...options,env:{OD_PACKAGED_NAMESPACE_BASE_ROOT:f.base},argv:["opendesign://workspace/open"]})).toBeNull();
 expect(open).toHaveBeenCalledWith(join(f.root,"Open Design.app"),["opendesign://workspace/open"]);
});
it("keeps headless in the same host and never publishes identity through the environment",async()=>{
 const f=await fixture();const env:NodeJS.ProcessEnv={};await selectAppEntry({...f.options,env,argv:["--headless"]});
 expect(env).toEqual({});expect(f.published).toHaveLength(1);expect(f.app.setAppPath).not.toHaveBeenCalled();
});

it("falls back in the installed host when an activated payload disappears before startup",async()=>{
 const f=await fixture();const initial=await boot(f);await initial.reportReady();const next=await addPayload(f,"1.1.0");
 const activated=await initial.activateCandidate("1.1.0");await rm(next.root,{recursive:true,force:true});
 const host=await boot(f,["--od-launcher-delegated-version","1.1.0","--od-launcher-delegated-generation",String(activated.active!.generation)]);
 expect(host.running.source).toBe("bundled");expect(host.rolledBackFromVersion).toBe("1.1.0");
 await host.reportReady();expect(host.snapshot().lastSuccessful?.version).toBe("1.0.0");
 expect(JSON.parse(await readFile(join(f.launcher,"state","attempt.json"),"utf8"))).toMatchObject(activated.active!);
});
it("inventories orphaned legacy caches without scheduling newer versions or foreign directories",async()=>{
 const f=await fixture();await addPayload(f,"0.8.0");await addPayload(f,"1.0.0");await addPayload(f,"1.2.0");
 await mkdir(join(f.launcher,"versions","foreign-data"),{recursive:true});await boot(f);
 const cleanup=JSON.parse(await readFile(join(f.launcher,"state","cleanup.json"),"utf8"));
 expect(cleanup.versions.map((entry:{version:string})=>entry.version).sort()).toEqual(["0.8.0","1.0.0"]);
});

it.each([false, true])("preserves a failed newer generation and compatible fallback during installer adoption (missing=%s)", async missing => {
  const f = await fixture();
  await addPayload(f, "1.1.0");
  const failed = await addPayload(f, "1.2.0");
  await mkdir(join(f.launcher, "state"), { recursive: true });
  const active = { version: "1.2.0", generation: 4 };
  const lastSuccessful = { version: "1.1.0", generation: 3 };
  await writeFile(join(f.launcher, "runtime.json"), JSON.stringify({ schemaVersion: 1, channel: "stable", namespace: "default", active, lastSuccessful }));
  const attemptPath = join(f.launcher, "state", "attempt.json");
  await writeFile(attemptPath, JSON.stringify({ schemaVersion: 1, channel: "stable", namespace: "default", ...active, startedAt: new Date().toISOString() }));
  if (missing) await rm(failed.versionRoot, { recursive: true });
  const host = await boot(f);
  expect(host.running.version).toBe("1.1.0");
  expect(host.rolledBackFromVersion).toBe("1.2.0");
  await host.reportReady();
  expect(host.snapshot().lastSuccessful).toEqual(lastSuccessful);
  expect(JSON.parse(await readFile(attemptPath, "utf8"))).toMatchObject(active);
  expect((await boot(f)).running.version).toBe("1.1.0");
});

it.each(["legacy", "incompatible", "missing"] as const)("recovers from a %s selected payload during adoption without discarding failure evidence", async failure => {
  for (const compatibleFallback of [false, true]) {
    const f = await fixture();
    if (compatibleFallback) await addPayload(f, "1.1.0");
    const selected = await addPayload(f, "1.2.0", failure === "legacy"
      ? { host: undefined } : { host: { ...environment, electronVersion: "42.0.0" } });
    const manifestPath = join(selected.versionRoot, "manifest.json");
    const manifest = await readFile(manifestPath, "utf8");
    if (failure === "missing") await rm(selected.versionRoot, { recursive: true });
    await mkdir(join(f.launcher, "state"), { recursive: true });
    const active = { version: "1.2.0", generation: 4 };
    const lastSuccessful = { version: "1.1.0", generation: 3 };
    await writeFile(join(f.launcher, "runtime.json"), JSON.stringify({ schemaVersion: 1, channel: "stable", namespace: "default", active, lastSuccessful }));

    const host = await boot(f);
    expect(host.running.version).toBe(compatibleFallback ? "1.1.0" : "1.0.0");
    expect(host.rolledBackFromVersion).toBe("1.2.0");
    await host.reportReady();
    expect(host.snapshot().active).toEqual(active);
    expect(host.snapshot().lastSuccessful).toEqual(compatibleFallback ? lastSuccessful : { version: "1.0.0", generation: 0 });
    expect(JSON.parse(await readFile(join(f.launcher, "state", "attempt.json"), "utf8"))).toMatchObject(active);
    expect(JSON.parse(await readFile(join(f.launcher, "state", "hosted.json"), "utf8"))).toMatchObject({ outerVersion: "1.0.0" });
    if (failure !== "missing") expect(await readFile(manifestPath, "utf8")).toBe(manifest);
    expect((await boot(f)).running.version).toBe(host.running.version);
  }
});
