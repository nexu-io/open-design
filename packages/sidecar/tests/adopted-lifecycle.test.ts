import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { expect, it } from "vitest";
import { convergeSidecarLaunch, getSidecarStatus, stopSidecar } from "../src/index.js";

it.each(["graceful", "supervisor-lost"] as const)("adopted app stays discoverable and exits when %s",async(kind)=>{
 const root=await mkdtemp(join(tmpdir(),"sidecar-adopt-"));
 const entry=join(root,"app.mjs"), module=fileURLToPath(new URL("../dist/index.mjs",import.meta.url));
 const stamp={app:"probe",channel:"test",mode:"runtime",namespace:`adopt-${process.pid}-${kind}`,source:"test"};
 await writeFile(entry,`import {adoptSidecarProcess,SidecarFactory} from ${JSON.stringify(module)};
 const adopted=await adoptSidecarProcess(${JSON.stringify(stamp)},{dataRoot:null,ownerPid:null,port:0,runtimeRoot:${JSON.stringify(root)}});
 const client=SidecarFactory.create({lifecycle:{async start(){return {};},status(){return {pid:process.pid};},async stop(){}}});
 await client.start(); console.log(JSON.stringify({pid:process.pid,generationPid:adopted.generationPid})); await client.waitUntilStopped();`);
 const child=spawn(process.execPath,[entry,"--od-sidecar-lifecycle=launcher"],{stdio:["ignore","pipe","pipe"]});
 const exited=once(child,"exit");let errors="";child.stderr.on("data",data=>{errors+=String(data);});
 try {
  const ready=await new Promise<{pid:number;generationPid:number}>((resolve,reject)=>{
   let text="";const timer=setTimeout(()=>reject(new Error("adoption did not become ready: "+errors)),5000);
   child.stdout.on("data",chunk=>{text+=String(chunk);if(text.includes("\n")){clearTimeout(timer);resolve(JSON.parse(text.trim()));}});
   child.once("exit",()=>{clearTimeout(timer);reject(new Error("adoption exited before ready: "+errors));});
  });
  expect(ready.pid).toBe(child.pid);expect(ready.generationPid).not.toBe(child.pid);
  expect(await getSidecarStatus(stamp)).toMatchObject({pid:child.pid});
  if(kind==="graceful"){
   const result=await stopSidecar(stamp,{termGraceMs:1000,killGraceMs:500});expect(result.remainingPids).toEqual([]);
  }else process.kill(ready.generationPid,"SIGKILL");
  await exited;
 }finally{child.kill("SIGKILL");await rm(root,{recursive:true,force:true});}
},15000);

it("converges when the launcher remains alive as the adopted OS application", async () => {
 const root=await mkdtemp(join(tmpdir(),"sidecar-adopt-converge-"));
 const entry=join(root,"app.mjs"), module=fileURLToPath(new URL("../dist/index.mjs",import.meta.url));
 const stamp={app:"probe",channel:"test",mode:"runtime",namespace:`converge-${process.pid}`,source:"test"};
 const resources={dataRoot:null,ownerPid:null,port:0,runtimeRoot:root};
 await writeFile(entry,`import {adoptSidecarProcess,SidecarFactory} from ${JSON.stringify(module)};
 await adoptSidecarProcess(${JSON.stringify(stamp)},${JSON.stringify(resources)});
 const client=SidecarFactory.create({lifecycle:{async start(){return {};},status(){return {pid:process.pid};},async stop(){}}});
 await client.start(); await client.waitUntilStopped();`);
 try {
  const result=await convergeSidecarLaunch({command:process.execPath,args:[entry],stamp,resources,logFd:null},{timeoutMs:5000,stabilityMs:100});
  expect(result.launcherProcess.exitCode).toBeNull();
  expect(await getSidecarStatus(stamp)).toMatchObject({pid:result.launcherProcess.pid});
 } finally {
  await stopSidecar(stamp,{termGraceMs:1000,killGraceMs:500});
  await rm(root,{recursive:true,force:true});
 }
},15000);
