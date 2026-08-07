export type SidecarControlScope = Readonly<{
  channel: string;
  generation: number;
  namespace: string;
}>;

export type SidecarControlIdentity = SidecarControlScope &
  Readonly<{
    service: string;
  }>;

export type SidecarControlRoots = Readonly<{
  dataRoot: string;
  resourceRoot: string;
  runtimeRoot: string;
}>;

export type SidecarControlContext = Readonly<{
  identity: SidecarControlIdentity;
  roots: SidecarControlRoots;
}>;

export type SidecarMethod<Input, Output> = Readonly<{
  input: Input;
  output: Output;
}>;

type MethodInput<TMethods, TMethod extends keyof TMethods> = TMethods[TMethod] extends SidecarMethod<
  infer Input,
  unknown
>
  ? Input
  : never;

type MethodOutput<TMethods, TMethod extends keyof TMethods> = TMethods[TMethod] extends SidecarMethod<
  unknown,
  infer Output
>
  ? Output
  : never;

export type SidecarMethodHandlers<TMethods> = {
  [TMethod in keyof TMethods]: (
    input: MethodInput<TMethods, TMethod>,
    context: SidecarControlContext,
  ) => MethodOutput<TMethods, TMethod> | Promise<MethodOutput<TMethods, TMethod>>;
};

export type SidecarProbeResult = Readonly<{
  identity: SidecarControlIdentity;
}>;

export type SidecarStopResult = Readonly<{
  accepted: true;
}>;

export type SidecarControlClient<TMethods> = Readonly<{
  identity: SidecarControlIdentity;
  call<TMethod extends Extract<keyof TMethods, string>>(
    method: TMethod,
    input: MethodInput<TMethods, TMethod>,
  ): Promise<MethodOutput<TMethods, TMethod>>;
  probe(): Promise<SidecarProbeResult>;
  requestStop(): Promise<SidecarStopResult>;
}>;

export type SidecarControlPlane = Readonly<{
  roots: SidecarControlRoots;
  scope: SidecarControlScope;
  connect<TMethods>(service: string): Promise<SidecarControlClient<TMethods>>;
  launch<TMethods>(options: SidecarLaunchOptions): Promise<SidecarLaunch<TMethods>>;
  probe(service: string): Promise<SidecarProbeResult>;
  requestStop(service: string): Promise<SidecarStopResult>;
}>;

export type SidecarLaunchOptions = Readonly<{
  args?: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  executable: string;
  output?: "ignore" | "inherit";
  readyTimeoutMs?: number;
  service: string;
  stopTimeoutMs?: number;
}>;

export type SidecarExit = Readonly<{
  code: number | null;
  signal: NodeJS.Signals | null;
}>;

export type SidecarLaunch<TMethods> = Readonly<{
  client: SidecarControlClient<TMethods>;
  exited: Promise<SidecarExit>;
  identity: SidecarControlIdentity;
  stop(): Promise<SidecarExit>;
}>;

export type AttachSidecarOptions<TMethods> = Readonly<{
  handlers: SidecarMethodHandlers<TMethods>;
  onStopRequested?: () => void | Promise<void>;
}>;

export type AttachedSidecar = Readonly<{
  context: SidecarControlContext;
  close(): Promise<void>;
}>;

export type BootstrapControlPlaneOptions = Readonly<{
  roots: SidecarControlRoots;
  scope: SidecarControlScope;
}>;
