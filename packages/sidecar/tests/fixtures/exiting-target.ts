// Supervised target that ends the way OD_TEST_EXIT_MODE asks, after it has
// announced readiness through OD_TEST_EXIT_READY.
import { writeFileSync } from "node:fs";

const mode = process.env.OD_TEST_EXIT_MODE ?? "code:0";
const ready = process.env.OD_TEST_EXIT_READY;
if (ready != null) writeFileSync(ready, JSON.stringify({ pid: process.pid }));

const [kind, value = ""] = mode.split(":");
setTimeout(() => {
  if (kind === "code") process.exit(Number(value));
  if (kind === "signal") {
    // Reset Node's own SIGUSR1/SIGPIPE handling so the target really dies by
    // the signal, like a non-Node target would.
    const signal = value as NodeJS.Signals;
    try {
      process.on(signal, () => {});
      process.removeAllListeners(signal);
    } catch {}
    process.kill(process.pid, signal);
  }
}, 50);
setInterval(() => {}, 1_000);
