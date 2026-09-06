import type {
  OpenDesignElectronUpdaterLineSnapshot,
  OpenDesignElectronUpdaterStatusSnapshot,
  OpenDesignElectronUpdaterTarget,
} from '@open-design/electron-contract';

type FixtureInput = {
  target?: OpenDesignElectronUpdaterTarget;
  state?: OpenDesignElectronUpdaterLineSnapshot['state'];
  candidateVersion?: string;
  currentVersion?: string;
  progress?: OpenDesignElectronUpdaterLineSnapshot['progress'];
  error?: OpenDesignElectronUpdaterLineSnapshot['error'];
  channel?: string;
};

/** Build a current dual-line updater snapshot without exposing runtime internals. */
export function electronUpdaterStatus(overrides: FixtureInput = {}): OpenDesignElectronUpdaterStatusSnapshot {
  const target = overrides.target ?? 'shell';
  const state = overrides.state ?? 'idle';
  const canApply = state === 'ready';
  const canDownload = state === 'available';
  const actions = state === 'idle' || state === 'current' || state === 'error'
    ? ['check' as const]
    : canDownload ? ['download' as const]
    : canApply ? ['apply' as const, 'later' as const]
    : [];
  const selected: OpenDesignElectronUpdaterLineSnapshot = {
    target,
    revision: 1,
    state,
    actions,
    blockedBy: overrides.error?.code === 'active-runs-blocked'
      ? 1
      : 0,
    currentVersion: overrides.currentVersion ?? 'betahyx-1.2.3-beta.3',
    ...(overrides.candidateVersion == null ? {} : { candidateVersion: overrides.candidateVersion }),
    ...(overrides.progress == null ? {} : { progress: overrides.progress }),
    ...(overrides.error == null ? {} : { error: overrides.error }),
  };
  const idle = (lineTarget: OpenDesignElectronUpdaterTarget): OpenDesignElectronUpdaterLineSnapshot => ({
    target: lineTarget,
    revision: 0,
    state: 'current',
    actions: ['check'],
    blockedBy: 0,
  });
  return {
    schemaVersion: 1,
    channel: overrides.channel ?? 'betahyx',
    lines: {
      shell: target === 'shell' ? selected as OpenDesignElectronUpdaterStatusSnapshot['lines']['shell'] : idle('shell') as OpenDesignElectronUpdaterStatusSnapshot['lines']['shell'],
      closure: target === 'closure' ? selected as OpenDesignElectronUpdaterStatusSnapshot['lines']['closure'] : idle('closure') as OpenDesignElectronUpdaterStatusSnapshot['lines']['closure'],
    },
  };
}
