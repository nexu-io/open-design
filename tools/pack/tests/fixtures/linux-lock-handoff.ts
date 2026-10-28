import { fstatSync } from "node:fs";
import { writeFile } from "node:fs/promises";

import { spawnBackgroundProcess } from "@open-design/platform";

const pidPath = process.argv[2];
if (pidPath == null) throw new Error("pid path is required");

// AppRun opened fd 8 and took the launch flock before execing the cached
// AppRun. The cached AppRun hands the same descriptor to the detached sidecar
// supervisor, which keeps it open for the desktop lifetime.
fstatSync(8);

const child = await spawnBackgroundProcess({
  command: process.execPath,
  args: ["-e", "setInterval(() => {}, 1000)"],
  inheritFds: [8],
});
await writeFile(pidPath, String(child.pid), "utf8");
