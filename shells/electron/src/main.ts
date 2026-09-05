import { readFileSync } from "node:fs";
import { join } from "node:path";

import { runElectronShell } from "@open-design/electron-kit/runtime";
import type { ElectronShellManifest } from "@open-design/electron-kit/contracts";

import { createElectronShellDefinition } from "./composition/definition.js";
import { runControlledElectronShell } from "./adapters/standalone/electron-control.js";

const installedManifest = JSON.parse(readFileSync(join(__dirname, "shell.json"), "utf8")) as ElectronShellManifest;
void runControlledElectronShell(async () => await runElectronShell(createElectronShellDefinition(installedManifest)));
