import { readFileSync } from "node:fs";
import { join } from "node:path";

import { runElectronShell } from "@open-design/electron-kit/runtime";
import type { ElectronShellManifest } from "@open-design/electron-kit/contracts";

import { createElectronShellDefinition } from "./composition/definition.js";

const installedManifest = JSON.parse(readFileSync(join(__dirname, "shell.json"), "utf8")) as ElectronShellManifest;
void runElectronShell(createElectronShellDefinition(installedManifest));
