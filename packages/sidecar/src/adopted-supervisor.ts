import { isProcessAlive } from "@open-design/platform";
import { readCurrentSidecarArgvStamp, SIDECAR_ADOPT_PARENT_ARG } from "./stamp.js";

// Parentage is an OS-enforced ownership proof, not permission to signal an
// arbitrary PID supplied by a caller. Never adopt init after reparenting.
readCurrentSidecarArgvStamp();
const pid = Number(process.argv.find(arg => arg.startsWith(`${SIDECAR_ADOPT_PARENT_ARG}=`))?.split("=")[1]);
if (!Number.isSafeInteger(pid) || pid <= 1 || pid !== process.ppid) throw new Error("invalid adopted sidecar parent");
const timer = setInterval(() => {
  if (!isProcessAlive(pid) || process.ppid !== pid) { clearInterval(timer); process.exit(0); }
}, 250);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (process.ppid === pid && isProcessAlive(pid)) process.kill(pid, signal);
  });
}
