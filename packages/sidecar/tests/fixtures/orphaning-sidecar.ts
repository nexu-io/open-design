import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const readyPath = process.env.OD_TEST_ORPHAN_READY;
if (readyPath == null) throw new Error("OD_TEST_ORPHAN_READY is required");

const descendant = spawn(process.execPath, [
  "-e",
  "process.on('SIGTERM',()=>{});setInterval(()=>{},60000)",
], {
  stdio: "ignore",
  windowsHide: true,
});
if (descendant.pid == null) throw new Error("orphan fixture descendant has no pid");
writeFileSync(readyPath, JSON.stringify({ pid: descendant.pid }));

process.on("SIGTERM", () => process.exit(0));
setInterval(() => undefined, 60_000);
