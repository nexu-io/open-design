import { fstatSync } from "node:fs";
import { writeFile } from "node:fs/promises";

import { spawnBackgroundProcess } from "../../src/index.js";

const pidPath = process.argv[2];
if (pidPath == null) throw new Error("pid path is required");

// The launcher shell opened fd 8 and took a flock on it before execing this
// fixture. Keeping the same descriptor open in the detached child is what
// transfers the lock across the handoff.
fstatSync(8);

const child = await spawnBackgroundProcess({
  command: process.execPath,
  args: ["-e", "setInterval(() => {}, 1000)"],
  inheritFds: [8],
});
await writeFile(pidPath, String(child.pid), "utf8");
