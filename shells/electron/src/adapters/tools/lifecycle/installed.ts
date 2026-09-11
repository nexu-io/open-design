// Node-safe installed lifecycle leaf; no native compiler dependencies.
export { installMacElectronApp, withMacElectronProcess } from "@open-design/electron-kit/macos";
export { withStoppedElectronSession } from "./session-maintenance.ts";
