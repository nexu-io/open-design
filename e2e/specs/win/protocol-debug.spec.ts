// @vitest-environment node

import { join } from 'node:path';

import { describe,expect,test } from 'vitest';

import {
	hasPackagedSmokeLane
} from '@/vitest/packaged-smoke-contract';
import { shouldRunPackagedWinSmoke,winProtocolDebugCase } from './lib/context.js';


import type { WinStopResult } from './lib/index.js';
import { assertWindowsInviteProtocolRegistration,invokeWindowsInviteDeeplink,invokeWindowsInviteDeeplinkDirect,launchNativeWindowsAcceptance,maxStartDurationMs,runtimeNamespaceRoot,runToolsPackJson,smokeLanes,waitForDesktopStopped,waitForHealthyDesktop } from './lib/index.js';

const winProtocolDebugDescribe = shouldRunPackagedWinSmoke && hasPackagedSmokeLane(smokeLanes, 'shell') && winProtocolDebugCase !== 'off' ? describe : describe.skip;

winProtocolDebugDescribe('packaged windows invite protocol debug', () => {
  test('[debug] cold-starts an existing materialized install through the selected protocol layer', async () => {
    const installDir = join(runtimeNamespaceRoot, 'install', 'Open Design');
    await assertWindowsInviteProtocolRegistration(installDir);

    const stopBeforeLaunch = async (): Promise<void> => {
      const stop = await runToolsPackJson<WinStopResult>('stop');
      expect(stop.status).not.toBe('partial');
      expect(stop.remainingPids).toEqual([]);
      await waitForDesktopStopped();
    };
    const verifyColdLaunch = async (invoke: () => Promise<void>, timeoutMs = 90_000): Promise<void> => {
      await stopBeforeLaunch();
      await invoke();
      const inspect = await waitForHealthyDesktop(timeoutMs);
      expect(inspect.status?.state).toBe('running');
      expect(inspect.status?.pid).toBeGreaterThan(0);
    };

    try {
      if (winProtocolDebugCase === 'protocol-prime' || winProtocolDebugCase === 'protocol-all') {
        await verifyColdLaunch(
          () => launchNativeWindowsAcceptance(installDir).then(() => undefined),
          maxStartDurationMs,
        );
      }
      if (winProtocolDebugCase === 'protocol-direct' || winProtocolDebugCase === 'protocol-all') {
        await verifyColdLaunch(() => invokeWindowsInviteDeeplinkDirect(installDir));
      }
      if (winProtocolDebugCase === 'protocol-shell' || winProtocolDebugCase === 'protocol-all') {
        await verifyColdLaunch(invokeWindowsInviteDeeplink);
      }
    } finally {
      await runToolsPackJson<WinStopResult>('stop').catch((error: unknown) => {
        console.error('failed to stop packaged windows app during protocol debug cleanup', error);
      });
    }
  }, 300_000);
});
