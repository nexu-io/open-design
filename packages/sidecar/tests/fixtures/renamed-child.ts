import { writeFileSync } from "node:fs";

process.title = "next-server";

const readyPath = process.env.OD_TEST_SIDECAR_READY;
const context = JSON.parse(process.env.OD_SIDECAR_SUPERVISED_CONTEXT ?? "null") as { generationPid?: unknown } | null;
if (readyPath != null) writeFileSync(readyPath, JSON.stringify({
  generationPid: Number(context?.generationPid),
  runtimePid: process.pid,
}));

process.on("SIGTERM", () => {
  // Exercise the managed generation's force-stop fallback.
});

setInterval(() => undefined, 60_000);
