import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  dshBootstrapChecksums,
  materializeDshBootstrapInstallers,
  type DshBootstrapObject,
} from "../src/storage/dsh-bootstrap-bundle.ts";

const LANDING_PS1_URL = "https://open-design.ai/install-dsh.ps1?version=1";

function sources(cmd = `download '${LANDING_PS1_URL}'`): DshBootstrapObject[] {
  return [
    { body: Buffer.from(cmd), name: "install-dsh.cmd" },
    { body: Buffer.from("powershell installer"), name: "install-dsh.ps1" },
    { body: Buffer.from("shell installer"), name: "install-dsh.sh" },
  ];
}

describe("DeepSeek Harness bootstrap bundle", () => {
  it("pins a versioned CMD to its colocated immutable PowerShell installer", () => {
    const installers = materializeDshBootstrapInstallers(
      sources(),
      "v7",
      "https://releases.example.test/",
    );
    const cmd = installers.find(({ name }) => name === "install-dsh.cmd");

    expect(cmd?.body.toString("utf8")).toContain(
      "https://releases.example.test/bootstrap/dsh/v7/install-dsh.ps1",
    );
    expect(cmd?.body.toString("utf8")).not.toContain(LANDING_PS1_URL);

    const checksums = dshBootstrapChecksums(installers).toString("utf8");
    expect(checksums).toContain(
      `${createHash("sha256").update(cmd!.body).digest("hex")}  install-dsh.cmd`,
    );
  });

  it("fails closed if the canonical CMD no longer has one rewrite marker", () => {
    expect(() =>
      materializeDshBootstrapInstallers(sources("no remote PS1 marker"), "v7", "https://releases.example.test"),
    ).toThrow(/exactly one landing PS1 URL/);
  });
});
