/** Independently bundled product composition. The carrier owns OS identity and
 * must verify/select this module before invoking its factory. */
export { createElectronShellDefinition as createElectronCapsuleDefinition } from "./composition/definition.js";
export { runElectronCapsule } from "@open-design/electron-capsule";
