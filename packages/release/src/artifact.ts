/** A published installer reference, independent of download and installation layout. */
export type PublishedInstaller = {
  schemaVersion: 1;
  target: "mac_arm64" | "mac_x64" | "win_x64" | "linux_x64";
  releaseVersion: string;
  channel: string;
  name: string;
  url: string;
  sha256: string;
};

export function parsePublishedInstaller(value: unknown): PublishedInstaller {
  if (!value || typeof value !== "object") throw new Error("invalid published installer");
  const artifact = value as PublishedInstaller;
  if (artifact.schemaVersion !== 1 || !["mac_arm64", "mac_x64", "win_x64", "linux_x64"].includes(artifact.target)
    || ![artifact.releaseVersion, artifact.channel, artifact.name, artifact.url].every((item) => typeof item === "string" && item.length > 0)
    || !/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error("invalid published installer");
  const url = new URL(artifact.url);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("published installer requires public HTTPS");
  return artifact;
}
