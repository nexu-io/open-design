/**
 * CDP and other out-of-process clients can invoke the declared contract
 * without learning its private contextBridge slot.
 */
export { createElectronContractInvocationExpression } from "./locator.js";
