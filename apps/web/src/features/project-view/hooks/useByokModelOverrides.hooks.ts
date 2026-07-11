// Feature-local hook for the BYOK chat tool-call per-session model/voice
// overrides (generate_image / generate_video / generate_speech). Pure UI
// state seeded once from the project's creation-time media picks (when they
// belong to the active BYOK provider) falling back to the Settings default —
// subsequent selections live only in this state until the next project
// mount/switch. No transport, so it needs no injected port.
import { useState } from 'react';
import type { AppConfig, ProjectMetadata } from '../../../types';
import { byokModelSeedForProtocol, projectMediaVoiceSeed } from '../rules';

export interface ByokModelOverridesController {
  byokImageModelOverride: string;
  setByokImageModelOverride: (value: string) => void;
  byokVideoModelOverride: string;
  setByokVideoModelOverride: (value: string) => void;
  byokSpeechModelOverride: string;
  setByokSpeechModelOverride: (value: string) => void;
  byokSpeechVoiceOverride: string;
  setByokSpeechVoiceOverride: (value: string) => void;
}

export function useByokModelOverrides(
  projectMetadata: ProjectMetadata | null | undefined,
  config: Pick<AppConfig, 'apiProtocol' | 'byokImageModel' | 'byokVideoModel' | 'byokSpeechModel' | 'byokSpeechVoice'>,
): ByokModelOverridesController {
  const [byokImageModelOverride, setByokImageModelOverride] = useState<string>(
    () => byokModelSeedForProtocol(projectMetadata, 'image', config.apiProtocol) ?? config.byokImageModel ?? '',
  );
  const [byokVideoModelOverride, setByokVideoModelOverride] = useState<string>(
    () => byokModelSeedForProtocol(projectMetadata, 'video', config.apiProtocol) ?? config.byokVideoModel ?? '',
  );
  const [byokSpeechModelOverride, setByokSpeechModelOverride] = useState<string>(
    () => byokModelSeedForProtocol(projectMetadata, 'speech', config.apiProtocol) ?? config.byokSpeechModel ?? '',
  );
  const [byokSpeechVoiceOverride, setByokSpeechVoiceOverride] = useState<string>(
    () => (byokModelSeedForProtocol(projectMetadata, 'speech', config.apiProtocol)
      ? projectMediaVoiceSeed(projectMetadata)
      : undefined) ?? config.byokSpeechVoice ?? '',
  );

  return {
    byokImageModelOverride,
    setByokImageModelOverride,
    byokVideoModelOverride,
    setByokVideoModelOverride,
    byokSpeechModelOverride,
    setByokSpeechModelOverride,
    byokSpeechVoiceOverride,
    setByokSpeechVoiceOverride,
  };
}
