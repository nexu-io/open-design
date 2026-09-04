export type ElectronStandaloneAuthorityBuild = Readonly<{
  host: Readonly<{ name: "standalone-host.mjs"; path: string }>;
  supervisor: Readonly<{ name: "supervisor.mjs"; path: string }>;
}>;

export function buildElectronStandaloneAuthority(outputRoot: string): Promise<ElectronStandaloneAuthorityBuild>;
