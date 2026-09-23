/**
 * Stage-one content marker. It intentionally exposes no Web, daemon, HTTP,
 * process, IPC, or Sidecar behavior; the launcher lifecycle is an injected port.
 */
export const closureFixture = Object.freeze({
  schemaVersion: 1,
  capability: "cold-start-lifecycle-fixture",
  web: false,
  daemon: false,
});

export default closureFixture;
