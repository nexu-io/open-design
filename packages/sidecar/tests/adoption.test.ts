import { expect, it } from "vitest";
import { collectSidecarGenerationPids } from "../src/process-tree.js";
import { createProcessStampArgs } from "@open-design/platform";
import { SIDECAR_STAMP_CONTRACT, SIDECAR_ADOPT_PARENT_ARG } from "../src/stamp.js";
const stamp={channel:"stable",namespace:"adopt",source:"packaged",mode:"runtime",app:"desktop"};
it("includes only the declared OS parent in an adopted generation and fences nested resources",()=>{
 const command=["node","adopted-supervisor.mjs",`${SIDECAR_ADOPT_PARENT_ARG}=100`,...createProcessStampArgs(stamp,SIDECAR_STAMP_CONTRACT)].join(" ");
 const processes=[{pid:100,ppid:1,command:"installed-app"},{pid:101,ppid:100,command},
 {pid:102,ppid:100,command:"renderer"},{pid:103,ppid:100,command:["node",...createProcessStampArgs({...stamp,app:"daemon"},SIDECAR_STAMP_CONTRACT)].join(" ")},
 {pid:104,ppid:103,command:"agent"},{pid:200,ppid:1,command:"unrelated"}];
 expect(collectSidecarGenerationPids(processes,[101],stamp).sort()).toEqual([100,101,102]);
 expect(collectSidecarGenerationPids(processes.map(p=>p.pid===101?{...p,ppid:200}:p),[101],stamp)).toEqual([101]);
});
it("never adopts init after supervisor reparenting",()=>{
 const command=`node ${SIDECAR_ADOPT_PARENT_ARG}=1`;
 expect(collectSidecarGenerationPids([{pid:1,ppid:0,command:"init"},{pid:101,ppid:1,command}],[101],stamp)).toEqual([101]);
});
