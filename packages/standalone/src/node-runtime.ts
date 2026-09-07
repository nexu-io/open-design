/** Shell-owned execution environment, independent of distribution or process transport. */
export type NodeRuntimeBinding = Readonly<{
  command: string;
  env: Readonly<Record<string, string>>;
}>;
