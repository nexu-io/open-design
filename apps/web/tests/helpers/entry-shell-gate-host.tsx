import { useState, type ComponentProps } from 'react';
import { vi } from 'vitest';

import { EntryShell } from '../../src/components/EntryShell';
import {
  HomeAmrBalanceGateDialogs,
  type HomeAmrBalanceGateBlock,
} from '../../src/components/HomeAmrBalanceGateDialogs';

type EntryShellProps = ComponentProps<typeof EntryShell>;

type HostProps = Omit<
  EntryShellProps,
  'onAmrBalanceGateBlockChange' | 'onBeginProjectCreation'
> & {
  onBeginProjectCreation?: EntryShellProps['onBeginProjectCreation'];
};

/** A stand-in for App's optimistic hand-off: mints an id, never navigates. */
export function stubBeginProjectCreation(): EntryShellProps['onBeginProjectCreation'] {
  return vi.fn(() => ({ projectId: 'optimistic-project', rollback: vi.fn() }));
}

/**
 * EntryShell plus the two pieces App owns around its Home submit: the
 * optimistic project hand-off (`onBeginProjectCreation`) and the host for the
 * AMR balance-gate dialog (`HomeAmrBalanceGateDialogs`). In the app the gate
 * resolves behind the pending frame, where EntryShell is already unmounted, so
 * the dialog lives in App; tests that render EntryShell alone mount this host
 * to see the same dialog.
 */
export function EntryShellWithGateHost({ onBeginProjectCreation, ...props }: HostProps) {
  const [block, setBlock] = useState<HomeAmrBalanceGateBlock | null>(null);
  return (
    <>
      <EntryShell
        {...props}
        onBeginProjectCreation={onBeginProjectCreation ?? stubBeginProjectCreation()}
        onAmrBalanceGateBlockChange={setBlock}
      />
      <HomeAmrBalanceGateDialogs block={block} metricsConsent={false} installationId={null} />
    </>
  );
}
