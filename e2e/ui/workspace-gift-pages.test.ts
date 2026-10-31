import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { clusterTest as test, expect } from '@/playwright/suite';
import { runWorkspaceGiftPages } from '@/playwright/workspace-gift-pages';
import { T } from '@/timeouts';

test('[P0] BILL-012 and VIEW-021 keep purchased funds after the original gift expires', async ({ browser }, info) => {
  const handoffDir = process.env.OD_GIFT_PAGES_HANDOFF_DIR;
  test.skip(!handoffDir, 'Requires an owned AMR signed-funding handoff');
  const velaBin = process.env.OD_GIFT_PAGES_VELA_BIN;
  const amrRoot = process.env.OD_GIFT_PAGES_AMR_ROOT;
  const expectedOdSha = process.env.OD_GIFT_PAGES_OD_SHA;
  expect(velaBin && amrRoot && expectedOdSha, 'Explicit owned binary, AMR source and OD SHA required').toBeTruthy();
  // Three real gift deadlines are observed in sequence; the first run took 9m39s.
  test.setTimeout(T.xlong * 15);
  const output = info.outputPath('gift-pages');
  await runWorkspaceGiftPages({ browser, handoffDir: handoffDir!, velaBin: velaBin!, amrRoot: amrRoot!, output, expectedOdSha: expectedOdSha! });
  for (const alias of ['plus', 'retained', 'giftOnly'] as const) {
    const record = JSON.parse(await readFile(join(output, `${alias}.safe.json`), 'utf8'));
    expect(record).toMatchObject({ status: 'passed', alias, odSha: expectedOdSha });
    for (const phase of ['web-before', 'od-before', 'web-after', 'od-after']) {
      await info.attach(`${alias}-${phase}`, { path: join(output, `${alias}-${phase}.png`), contentType: 'image/png' });
    }
    await info.attach(`${alias}-balances`, { body: JSON.stringify(record, null, 2), contentType: 'application/json' });
  }
});
