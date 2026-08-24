import type {
  GenerationRecord,
  LifecycleAttachment,
  LifecyclePort,
  LifecycleScope,
  LifecycleStatus,
} from "@open-design/standalone";

export class FileFixtureLifecyclePort implements LifecyclePort {
  constructor(root: string, options?: { heartbeatIntervalMs?: number; leaseDurationMs?: number });
  start(scope: LifecycleScope, generation: GenerationRecord, attachment: LifecycleAttachment): Promise<LifecycleStatus>;
  heartbeat(scope: LifecycleScope, attachment: LifecycleAttachment): Promise<LifecycleStatus>;
  release(scope: LifecycleScope, attachmentId: string): Promise<LifecycleStatus>;
  status(scope: LifecycleScope): Promise<LifecycleStatus>;
  stop(scope: LifecycleScope, fence: number): Promise<LifecycleStatus>;
}
