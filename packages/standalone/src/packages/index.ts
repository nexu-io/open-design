/** Shell-neutral package declaration and read-only physical runtime binding. */
export { currentOfficialNodeTarget, bindNodePlatform, type OfficialNodeTarget } from "./runtime.js";
export { readOfficialNodeLock, validateOfficialNodeLock, type OfficialNodeLock } from "./lock.js";
export type { NodeRuntimeBinding } from "../node-runtime.js";
export { validateNodePlatformResource, type NodePlatformResource } from "./resource-contract.js";
