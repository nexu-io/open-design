import type {
  GenerationRecord,
  LifecycleAttachment,
  LifecyclePort,
  LifecycleScope,
  LifecycleStatus,
  StandaloneLifecycleTransitionPort,
  StandaloneGenerationBinding,
} from "@open-design/standalone";

export class FileFixtureLifecyclePort implements LifecyclePort, StandaloneLifecycleTransitionPort {
  constructor(root: string, options: {
    algebra: typeof import("@open-design/standalone").SHARED_LIFECYCLE_ALGEBRA;
    heartbeatIntervalMs?: number;
    leaseDurationMs?: number;
    transitionLeaseDurationMs?: number;
  });
  start(scope: LifecycleScope, generation: GenerationRecord, attachment: LifecycleAttachment, binding?: StandaloneGenerationBinding): Promise<LifecycleStatus>;
  startWithCapability(
    scope: LifecycleScope,
    generation: GenerationRecord,
    attachment: LifecycleAttachment,
    capability: Readonly<{ candidateHash: string; presentedHash: string | null }>,
    binding?: StandaloneGenerationBinding,
  ): Promise<LifecycleStatus>;
  awaitReady(...input: Parameters<LifecyclePort["awaitReady"]>): ReturnType<LifecyclePort["awaitReady"]>;
  heartbeat(scope: LifecycleScope, attachment: LifecycleAttachment): Promise<LifecycleStatus>;
  heartbeatWithCapability(scope: LifecycleScope, attachment: LifecycleAttachment, capabilityHash: string): Promise<LifecycleStatus>;
  release(scope: LifecycleScope, attachmentId: string): Promise<LifecycleStatus>;
  releaseWithCapability(scope: LifecycleScope, attachmentId: string, capabilityHash: string): Promise<LifecycleStatus>;
  status(scope: LifecycleScope): Promise<LifecycleStatus>;
  stop(scope: LifecycleScope, fence: number): Promise<LifecycleStatus>;
  occupants(scope: LifecycleScope): ReturnType<StandaloneLifecycleTransitionPort["occupants"]>;
  beginTransition(...input: Parameters<StandaloneLifecycleTransitionPort["beginTransition"]>): ReturnType<StandaloneLifecycleTransitionPort["beginTransition"]>;
}
