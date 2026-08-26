import { runElectronShell } from "@open-design/electron-kit/runtime";

import { createElectronShellDefinition } from "./composition/definition.js";

void runElectronShell(createElectronShellDefinition());
