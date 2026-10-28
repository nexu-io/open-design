import { renameSync, rmSync } from "node:fs";
import { cp, mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { resolveLauncherPaths, resolveLauncherVersionPaths, type LauncherHost } from "@open-design/launcher-proto";
import { startLauncher } from "../src/lifecycle.js";
import type { LauncherPlatform } from "../src/platform.js";

vi.mock("node:fs", async original => {
  const fs = await original<typeof import("node:fs")>();
  return { ...fs, renameSync: vi.fn(fs.renameSync), rmSync: vi.fn(fs.rmSync) };
});

const roots:string[]=[];
afterEach(async()=>{await Promise.all(roots.splice(0).map(path=>rm(path,{recursive:true,force:true})));});
async function fixture(platform:"win32"|"linux") {
  const root=await mkdtemp(join(tmpdir(),"launcher-lifecycle-"));roots.push(root);
  const installed=join(root,"installed"), resources=join(installed,"assets"), executable=join(installed,"carrier.exe");
  await mkdir(join(installed,"code"),{recursive:true});await mkdir(resources,{recursive:true});await writeFile(executable,"carrier");
  const namespaceBaseRoot=join(root,"user","namespaces");
  await writeFile(join(resources,"open-design-config.json"),JSON.stringify({appVersion:"1.0.0",namespace:"test",namespaceBaseRoot,launcherHost:{contractVersion:1,platform,arch:"x64",electronVersion:"41.3.0"}}));
  const adapter:LauncherPlatform={
    environment:{contractVersion:1,platform,arch:"x64",electronVersion:"41.3.0"},
    installedAppPath:()=>installed,installedConfigPath:path=>join(path,"assets","open-design-config.json"),
    openInstalled:vi.fn(async()=>{}),relaunchInstalled:vi.fn(async()=>{}),synchronizeSystemEntries:vi.fn(async()=>{}),
  };
  const app={getPath:()=>root,setPath:vi.fn(),setAppPath:vi.fn(),requestSingleInstanceLock:vi.fn(()=>true),on:vi.fn(),exit:vi.fn()};
  let host:LauncherHost;
  const options={adapter,app,appRoot:join(installed,"code"),resourcesPath:resources,executablePath:executable,bundledEntry:"./bundled.mjs",env:{},argv:[] as string[],processPid:1234,publish:(value:LauncherHost)=>{host=value;}};
  const paths=resolveLauncherPaths({channel:"stable",namespace:"test",root:join(root,"user")});
  const boot=async(argv:string[]=[])=>{await startLauncher({...options,argv});return host!;};
  const add=async(version:string)=>{
    const vp=resolveLauncherVersionPaths({...paths,version});const code=join(vp.versionRoot,"code"),assets=join(vp.versionRoot,"assets");
    await mkdir(code,{recursive:true});await mkdir(assets,{recursive:true});await writeFile(join(code,"start.mjs"),"export {};");await writeFile(join(vp.versionRoot,"legacy.exe"),"legacy");
    await writeFile(join(assets,"open-design-config.json"),JSON.stringify({appVersion:version,launcherHost:adapter.environment}));
    await writeFile(vp.manifestPath,JSON.stringify({schemaVersion:1,platform,channel:"stable",namespace:"test",version,host:{...adapter.environment,appRoot:"code",resourcesPath:"assets",entry:"code/start.mjs"},entry:{executable:"legacy.exe"}}));
    return vp;
  };
  return {root,installed,resources,adapter,options,paths,boot,add};
}
it.each(["win32","linux"] as const)("executes the lifecycle against an injected %s layout without enabling that production platform",async platform=>{
  const f=await fixture(platform);const first=await f.boot();
  await first.reportReady();
  expect(await first.protectsResource(join(f.paths.versionsRoot,"not-created"))).toBe(false);
  const candidate=await f.add("1.1.0");const before=await readFile(f.paths.runtimePath,"utf8");
  await first.validateCandidate("1.1.0");expect(await readFile(f.paths.runtimePath,"utf8")).toBe(before);
  const selected=await first.activateCandidate("1.1.0");
  // Duplicate readiness is idempotent even after selecting a successor.
  await first.reportReady();expect(first.snapshot().active).toEqual(selected.active);
  await first.requestRelaunch();
  expect(f.adapter.relaunchInstalled).toHaveBeenCalledWith(f.installed,{predecessorPid:1234,target:selected.active});
  const hosted=await f.boot(["--od-launcher-delegated-version","1.1.0","--od-launcher-delegated-generation",String(selected.active!.generation)]);
  expect(hosted.running.appRoot).toBe(join(candidate.versionRoot,"code"));await hosted.reportReady();
  const next=await f.add("1.2.0");await hosted.activateCandidate("1.2.0");
  expect(await hosted.protectsResource(candidate.versionRoot)).toBe(true);expect(await hosted.protectsResource(next.versionRoot)).toBe(false);
  const rollback=await f.boot();expect(rollback.running.version).toBe("1.1.0");expect(rollback.rolledBackFromVersion).toBe("1.2.0");
  await rollback.reportReady();expect(rollback.snapshot().lastSuccessful?.version).toBe("1.1.0");
  expect(f.adapter.synchronizeSystemEntries).toHaveBeenCalled();
});
it("preserves failed launch evidence until the explicit manual reset and preserves confirmed legacy handoffs",async()=>{
  const f=await fixture("win32");const host=await f.boot();await host.reportReady();await f.add("1.1.0");await host.activateCandidate("1.1.0");
  const rollback=await f.boot();await rollback.reportReady();expect(await readFile(f.paths.attemptsPath,"utf8")).toContain("1.1.0");
  await writeFile(f.paths.handoffPath,JSON.stringify({state:"confirmed"}));await rollback.resetFailedLaunch();
  await expect(readFile(f.paths.attemptsPath)).rejects.toThrow();expect(await readFile(f.paths.handoffPath,"utf8")).toContain("confirmed");
  await writeFile(f.paths.handoffPath,"{broken");await rollback.resetFailedLaunch();await expect(readFile(f.paths.handoffPath)).rejects.toThrow();
});
it("rejects invalid candidates before journaling and refuses symlink escapes in application entries",async()=>{
  const f=await fixture("linux");const host=await f.boot();await host.reportReady();const next=await f.add("1.1.0");
  await rm(join(next.versionRoot,"code","start.mjs"));await symlink(f.options.executablePath,join(next.versionRoot,"code","start.mjs"));
  const before=await readFile(f.paths.runtimePath,"utf8");await expect(host.validateCandidate("1.1.0")).rejects.toThrow("escapes");await expect(host.activateCandidate("1.1.0")).rejects.toThrow();
  expect(await readFile(f.paths.runtimePath,"utf8")).toBe(before);
});
it("keeps readiness independent of system repair and preserves retry after a failed platform relaunch",async()=>{
  const f=await fixture("win32");const warning=vi.spyOn(console,"warn").mockImplementation(()=>{});
  try {
    vi.mocked(f.adapter.synchronizeSystemEntries).mockRejectedValue(new Error("system denied"));
    const host=await f.boot();await host.reportReady();
    vi.mocked(f.adapter.relaunchInstalled).mockRejectedValueOnce(new Error("launch denied"));
    await expect(host.requestRelaunch()).rejects.toThrow("launch denied");await host.requestRelaunch();expect(f.adapter.relaunchInstalled).toHaveBeenCalledTimes(2);
  } finally { warning.mockRestore(); }
});

it("validates staged candidates through the same artifact contract without moving the active pointer",async()=>{
  const f=await fixture("win32");const host=await f.boot();await host.reportReady();const next=await f.add("1.1.0");
  const stage=join(f.paths.stagingRoot,"candidate");await mkdir(f.paths.stagingRoot,{recursive:true});await cp(next.versionRoot,stage,{recursive:true});await rm(next.versionRoot,{recursive:true});
  const before=await readFile(f.paths.runtimePath,"utf8");await host.validateCandidate("1.1.0",stage);
expect(await readFile(f.paths.runtimePath,"utf8")).toBe(before);
  await expect(host.activateCandidate("1.1.0")).rejects.toThrow();
  await expect(host.validateCandidate("1.1.0",f.root)).rejects.toThrow("outside");
});

it.each([
  { version: "1.0.0-preview.1", namespace: "test" },
  { version: "1.0.0", namespace: "release-preview-win" },
])("uses the release channel for $version in $namespace", async ({ version, namespace }) => {
  const f = await fixture("win32");
  const configPath = join(f.resources, "open-design-config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  await writeFile(configPath, JSON.stringify({ ...config, appVersion: version, namespace }));
  const host = await f.boot();
  expect(host.snapshot().channel).toBe("preview");
  const expectedPaths = resolveLauncherPaths({ channel: "preview", namespace, root: join(f.root, "user") });
  expect(JSON.parse(await readFile(expectedPaths.runtimePath, "utf8")).channel).toBe("preview");
});

it("retries readiness after a failed journal write without publishing an uncommitted snapshot", async () => {
  const f = await fixture("win32");
  const first = await f.boot();
  await first.reportReady();
  await f.add("1.1.0");
  const activated = await first.activateCandidate("1.1.0");
  const host = await f.boot(["--od-launcher-delegated-version", "1.1.0", "--od-launcher-delegated-generation", String(activated.active!.generation)]);
  const before = host.snapshot();
  vi.mocked(renameSync).mockImplementationOnce(() => { throw new Error("journal write interrupted"); });
  await expect(host.reportReady()).rejects.toThrow("journal write interrupted");
  expect(host.snapshot()).toEqual(before);
  await host.reportReady();
  const committed = JSON.parse(await readFile(f.paths.runtimePath, "utf8"));
  expect(committed.lastSuccessful).toEqual(activated.active);
  await expect(readFile(f.paths.attemptsPath)).rejects.toThrow();
});

it("retries readiness when removing the attempt journal fails after runtime confirmation", async () => {
  const f = await fixture("win32");
  const first = await f.boot();
  await first.reportReady();
  await f.add("1.1.0");
  const activated = await first.activateCandidate("1.1.0");
  const host = await f.boot(["--od-launcher-delegated-version", "1.1.0", "--od-launcher-delegated-generation", String(activated.active!.generation)]);
  const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");
  vi.mocked(rmSync).mockImplementationOnce(actualFs.rmSync).mockImplementationOnce(path => {
    expect(path).toBe(f.paths.attemptsPath);
    throw new Error("attempt removal interrupted");
  });
  await expect(host.reportReady()).rejects.toThrow("attempt removal interrupted");
  expect(JSON.parse(await readFile(f.paths.runtimePath, "utf8")).lastSuccessful).toEqual(activated.active);
  expect(await readFile(f.paths.attemptsPath, "utf8")).toContain("1.1.0");
  await host.reportReady();
  await expect(readFile(f.paths.attemptsPath)).rejects.toThrow();
});
