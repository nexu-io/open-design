import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { buildStartBannerPayload, printStartBanner } from "../../src/webui/launcher.js";

const LAUNCHER_SRC = fileURLToPath(new URL("../../src/webui/launcher.ts", import.meta.url));

// A concrete worker pid that is deliberately NOT this test process's pid, so a
// regression back to `process.pid` is unambiguous.
const WORKER_PID = process.pid + 4242;

const handle = { webUrl: "http://192.168.1.10:7700/", daemonUrl: "http://192.168.1.10:7701/" };
const config = { port: 7700 } as unknown as Parameters<typeof buildStartBannerPayload>[0]["config"];

describe("start banner pid", () => {
  it("buildStartBannerPayload reports the provided (serving) pid, never process.pid", () => {
    const payload = buildStartBannerPayload({
      pid: WORKER_PID,
      handle,
      config,
      token: null,
      tokenPersisted: null,
      background: true,
    });
    expect(payload.pid).toBe(WORKER_PID);
    expect(payload.pid).not.toBe(process.pid);
    expect(payload.background).toBe(true);
    expect(payload.url).toBe(handle.webUrl);
    expect(payload.webPort).toBe(7700);
  });

  it("printStartBanner --json on the detached path emits the spawned worker pid, not the launcher parent", () => {
    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    try {
      printStartBanner({
        json: true,
        pid: WORKER_PID,
        handle,
        config,
        token: null,
        tokenNotice: null,
        tokenPersisted: null,
        background: true,
      });
    } finally {
      spy.mockRestore();
    }
    const payload = JSON.parse(writes.join(""));
    expect(payload.pid).toBe(WORKER_PID);
    expect(payload.pid).not.toBe(process.pid);
  });
});

describe("launcher module import side effects", () => {
  // Importing the launcher (to reach the banner helpers above) MUST NOT run the
  // CLI. Before main() was guarded behind an entrypoint check, a top-level
  // `void main()` executed on import: it scaffolded a config file and entered
  // the real start flow, exiting non-zero. Importing it as a non-entrypoint
  // module (argv[1] != the launcher) must now be silent and exit cleanly.
  it("imports without scaffolding config or running the start flow", () => {
    const stdout = execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `await import(${JSON.stringify(LAUNCHER_SRC)}); process.stdout.write("IMPORT_OK");`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    expect(stdout).toBe("IMPORT_OK");
  });
});
