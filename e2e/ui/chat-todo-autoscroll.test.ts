import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Verifies that the chat-log stays pinned to the bottom when the PinnedTodoSlot
// grows (scenario A) and that a deliberate scroll-up is not overridden by a
// subsequent TodoWrite snapshot (scenario B).
//
// jsdom cannot exercise ResizeObserver or real flex-layout geometry, so these
// assertions must run in a real browser via Playwright. The Vitest unit spec
// in apps/web/tests/components/chat-todo-autoscroll.test.tsx confirms that
// the pinned-todo element is observed; this spec confirms that the resulting
// scroll behaviour is correct end-to-end.

const STORAGE_KEY = 'open-design:config';

// Reusable app-config seed: skip onboarding, mock agent, no real model calls.
async function seedAppConfig(page: Page) {
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        agentId: 'mock',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        agentModels: {},
        privacyDecisionAt: 1,
        telemetry: { metrics: false, content: false, artifactManifest: false },
      }),
    );
  }, STORAGE_KEY);

  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        config: {
          onboardingCompleted: true,
          agentId: 'mock',
          skillId: null,
          designSystemId: null,
          agentModels: {},
          privacyDecisionAt: 1,
          telemetry: { metrics: false, content: false, artifactManifest: false },
        },
      },
    });
  });

  await page.route('**/api/agents', async (route) => {
    await route.fulfill({
      json: {
        agents: [
          {
            id: 'mock',
            name: 'Mock Agent',
            bin: 'mock-agent',
            available: true,
            version: 'test',
            models: [{ id: 'default', label: 'Default' }],
          },
        ],
      },
    });
  });
}

// Seed a project + conversation + messages via the daemon HTTP API, then
// navigate to the project/conversation URL. Returns ids needed for follow-up
// API calls.
//
// To guarantee the chat-log is scrollable (needed to exercise the autoscroll
// invariant), we seed FILLER_MSG_COUNT pairs of short user/assistant messages
// before the final TodoWrite assistant message.  Each message pair is roughly
// 80 px tall; 12 pairs easily exceed a 600 px viewport so the chat-log always
// has overflow to scroll.
const FILLER_MSG_COUNT = 12;

async function seedProjectWithTodos(
  page: Page,
  opts: { projectSuffix: string; todoCount: number },
): Promise<{ projectId: string; conversationId: string }> {
  const projectId = `todo-scroll-${opts.projectSuffix}-${Date.now()}`.replace(/[^A-Za-z0-9._-]/g, '-');

  const projectRes = await page.request.post('/api/projects', {
    data: {
      id: projectId,
      name: `Todo Scroll ${opts.projectSuffix}`,
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: { kind: 'prototype' },
    },
  });
  expect(projectRes.ok(), `create project: ${await projectRes.text()}`).toBeTruthy();
  const { conversationId } = (await projectRes.json()) as { conversationId: string };
  expect(conversationId).toBeTruthy();

  // Seed several filler message pairs so the chat-log has scrollable overflow.
  for (let i = 0; i < FILLER_MSG_COUNT; i += 1) {
    const base = Date.now() - (FILLER_MSG_COUNT - i + 2) * 1000;
    const uRes = await page.request.put(
      `/api/projects/${projectId}/conversations/${conversationId}/messages/u-fill-${i}-${projectId}`,
      {
        data: {
          role: 'user',
          content: `Filler question ${i + 1}: what is step ${i + 1}?`,
          createdAt: base,
        },
      },
    );
    expect(uRes.ok(), `upsert filler user msg ${i}: ${await uRes.text()}`).toBeTruthy();

    const aRes = await page.request.put(
      `/api/projects/${projectId}/conversations/${conversationId}/messages/a-fill-${i}-${projectId}`,
      {
        data: {
          role: 'assistant',
          content: `Filler answer ${i + 1}: step ${i + 1} involves doing the work carefully.`,
          runStatus: 'succeeded',
          createdAt: base + 500,
        },
      },
    );
    expect(aRes.ok(), `upsert filler assistant msg ${i}: ${await aRes.text()}`).toBeTruthy();
  }

  // Seed the final user message.
  const userMsgId = `u-${projectId}`;
  const userMsgRes = await page.request.put(
    `/api/projects/${projectId}/conversations/${conversationId}/messages/${userMsgId}`,
    {
      data: {
        role: 'user',
        content: 'please build something',
        createdAt: Date.now() - 2000,
      },
    },
  );
  expect(userMsgRes.ok(), `upsert user msg: ${await userMsgRes.text()}`).toBeTruthy();

  // Seed an assistant message carrying a TodoWrite tool_use event.
  const todos = Array.from({ length: opts.todoCount }, (_, i) => ({
    content: `Task ${i + 1}`,
    status: 'pending',
  }));
  const assistantMsgId = `a-${projectId}`;
  const assistantMsgRes = await page.request.put(
    `/api/projects/${projectId}/conversations/${conversationId}/messages/${assistantMsgId}`,
    {
      data: {
        role: 'assistant',
        content: 'sure, here is the plan',
        runStatus: 'succeeded',
        events: [
          {
            kind: 'tool_use',
            id: `tw-${projectId}`,
            name: 'TodoWrite',
            input: { todos },
          },
        ],
        createdAt: Date.now() - 1000,
      },
    },
  );
  expect(assistantMsgRes.ok(), `upsert assistant msg: ${await assistantMsgRes.text()}`).toBeTruthy();

  return { projectId, conversationId };
}

// Pause until .chat-log is mounted, messages have loaded, and the loading
// overlay is gone. The first non-empty message from the seed is "Filler
// question 1" so waiting for that text confirms the daemon responded with
// the stored message list.
async function waitForChatReady(page: Page) {
  const loading = page.getByText('Loading Open Design…');
  await loading.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  await expect(page.locator('.chat-log')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('chat-composer')).toBeVisible({ timeout: 10_000 });
  // Wait until at least one filler message has rendered so the chat-log has
  // real content (not the empty-state template card grid).
  await expect(
    page.locator('.chat-log').getByText('Filler question 1: what is step 1?', { exact: true }),
  ).toBeVisible({ timeout: 10_000 });
}

// Read the chat-log scroll distance from the bottom (scrollHeight - scrollTop - clientHeight).
async function chatLogBottomDistance(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.chat-log');
    if (!el) return -1;
    return el.scrollHeight - el.scrollTop - el.clientHeight;
  });
}

// Read the total scrollable overflow (scrollHeight - clientHeight).
// A value > 0 means the chat-log has content that can be scrolled.
async function chatLogScrollableHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.chat-log');
    if (!el) return -1;
    return el.scrollHeight - el.clientHeight;
  });
}

// Simulate what happens when the .chat-pinned-todo element grows by manually
// setting the chat-log's scrollTop to mimic the drift that occurs in production
// environments where scroll-anchoring may not compensate fully for a flex-layout
// reflow caused by a sibling growing outside the scroll container.
//
// The mechanism:
//  1. Verify the chat-log is currently pinned to the bottom.
//  2. Grow .chat-pinned-todo (reducing .chat-log.clientHeight in the flex layout).
//  3. Manually set scrollTop to its pre-grow value (i.e. do NOT adjust for the
//     reduced clientHeight). This leaves the user `extraPx` above the new bottom.
//  4. Wait one rAF cycle. On the fix branch, the ResizeObserver on
//     .chat-pinned-todo fires followLatestIfPinned which snaps scrollTop back
//     to scrollHeight. On main the observer does not fire, so the drift persists.
async function growPinnedTodo(page: Page, extraPx: number) {
  await page.evaluate((px) => {
    const logEl = document.querySelector<HTMLElement>('.chat-log');
    if (!logEl) throw new Error('No .chat-log element found');

    const el = document.querySelector<HTMLElement>('.chat-pinned-todo');
    if (!el) throw new Error('No .chat-pinned-todo element found');

    // Snapshot the current scrollTop (user is at the bottom, so this equals
    // scrollHeight - clientHeight approximately).
    const scrollTopBefore = logEl.scrollTop;

    // Grow the element. The flex reflow reduces logEl.clientHeight by ~px.
    el.style.minHeight = `${el.offsetHeight + px}px`;
    // Force layout so clientHeight is updated synchronously.
    void logEl.clientHeight;

    // Re-apply the pre-grow scrollTop. This cancels any scroll-anchoring
    // adjustment the browser made, leaving the user drifted above the bottom.
    // The ChatPane's followLatestIfPinned (if its ResizeObserver fires) will
    // correct this; on main it won't because the observer is not on this element.
    logEl.scrollTop = scrollTopBefore;
  }, extraPx);
  // Give the browser two rAF cycles to flush ResizeObserver callbacks and the
  // nested followLatestIfPinned rAF.
  await page.waitForTimeout(100);
}

test.describe('chat pane autoscroll on TodoCard growth', () => {
  test.describe.configure({ timeout: 45_000 });

  test.beforeEach(async ({ page }) => {
    await seedAppConfig(page);
  });

  test('scenario A: pinned user stays at bottom after PinnedTodoCard grows', async ({
    page,
  }) => {
    const { projectId, conversationId } = await seedProjectWithTodos(page, {
      projectSuffix: 'a',
      todoCount: 4,
    });

    await page.goto(`/projects/${projectId}/conversations/${conversationId}`, {
      waitUntil: 'domcontentloaded',
    });
    await waitForChatReady(page);

    // After initial load the chat log should be pinned to the bottom.
    const distanceAfterLoad = await chatLogBottomDistance(page);
    expect(
      distanceAfterLoad,
      `expected chat-log pinned to bottom on load (distance=${distanceAfterLoad})`,
    ).toBeLessThan(20);

    // Guard: the filler messages must create actual scroll overflow.  If the
    // chat-log is not scrollable the grow step is a no-op and the assertion
    // below passes vacuously — defeat the bug detector entirely.
    const scrollableHeight = await chatLogScrollableHeight(page);
    expect(
      scrollableHeight,
      `expected chat-log to have scrollable overflow (scrollableHeight=${scrollableHeight}); ` +
      `seed more filler messages if this fires`,
    ).toBeGreaterThan(50);

    // Verify the PinnedTodoSlot rendered.
    await expect(page.locator('.chat-pinned-todo')).toBeVisible({ timeout: 5_000 });

    // Capture clientHeight before growing so we can assert the grow step
    // actually changed the layout this test is designed to protect against.
    const clientHeightBeforeGrow = await page.evaluate(
      () => document.querySelector<HTMLElement>('.chat-log')?.clientHeight ?? -1,
    );

    // Grow the pinned-todo card by 80 px (simulates a new TodoWrite snapshot with
    // more items) and verify the chat-log snaps back to the bottom.
    await growPinnedTodo(page, 80);

    // Hard precondition: the grow step must have reduced clientHeight. If a
    // layout change stops .chat-pinned-todo from shrinking .chat-log.clientHeight,
    // distanceAfterGrow < 20 passes vacuously and the regression detector is
    // defeated — fail fast instead.
    const clientHeightAfterGrow = await page.evaluate(
      () => document.querySelector<HTMLElement>('.chat-log')?.clientHeight ?? -1,
    );
    expect(
      clientHeightAfterGrow,
      `expected grow step to reduce chat-log clientHeight ` +
      `(before=${clientHeightBeforeGrow} after=${clientHeightAfterGrow}); ` +
      `increase extraPx in growPinnedTodo or check the layout if this fires`,
    ).toBeLessThan(clientHeightBeforeGrow);

    const distanceAfterGrow = await chatLogBottomDistance(page);
    expect(
      distanceAfterGrow,
      `expected chat-log re-pinned after todo card grew (distance=${distanceAfterGrow})`,
    ).toBeLessThan(20);
  });

  test('scenario B: user scroll-up is preserved when PinnedTodoCard grows', async ({
    page,
  }) => {
    const { projectId, conversationId } = await seedProjectWithTodos(page, {
      projectSuffix: 'b',
      todoCount: 4,
    });

    await page.goto(`/projects/${projectId}/conversations/${conversationId}`, {
      waitUntil: 'domcontentloaded',
    });
    await waitForChatReady(page);

    // Verify PinnedTodoSlot is mounted.
    await expect(page.locator('.chat-pinned-todo')).toBeVisible({ timeout: 5_000 });

    // Scroll the chat-log up by 150 px to break the pinned-to-bottom invariant.
    // We scroll by at least 80 px (the pinnedToBottomRef threshold) to ensure
    // the ChatPane considers the user as having deliberately scrolled away.
    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('.chat-log');
      if (!el) throw new Error('No .chat-log element found');
      // Scroll up by 150 px — beyond the 80 px pinned threshold.
      el.scrollTop = Math.max(0, el.scrollTop - 150);
      // Dispatch a synthetic scroll event so ChatPane's onScroll listener
      // fires and updates pinnedToBottomRef to false.
      el.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await page.waitForTimeout(50);

    const distanceAfterScroll = await chatLogBottomDistance(page);

    // Hard precondition: the scroll must have moved past the 80px suppression
    // threshold. If this fails, the seed / layout changed and the test no
    // longer exercises the "user scrolled away, do not yank them back" path —
    // fail fast instead of silently skipping the regression check below.
    expect(
      distanceAfterScroll,
      `expected scroll-up to move chat-log more than 80px from bottom (distance=${distanceAfterScroll}); ` +
      `seed more filler messages or increase the scroll offset if this fires`,
    ).toBeGreaterThan(80);

    // Capture scrollTop and clientHeight before growing — the invariant is that
    // scrollTop (not distance-to-bottom) is preserved. Distance-to-bottom
    // naturally increases by ~extraPx because growPinnedTodo reduces clientHeight
    // while holding scrollTop fixed, so comparing distances before/after would
    // fail on correct behavior.
    const scrollTopBeforeGrow = await page.evaluate(
      () => document.querySelector<HTMLElement>('.chat-log')?.scrollTop ?? -1,
    );
    const clientHeightBeforeGrow = await page.evaluate(
      () => document.querySelector<HTMLElement>('.chat-log')?.clientHeight ?? -1,
    );

    // Now grow the todo card — the non-pinned user should NOT be dragged back.
    await growPinnedTodo(page, 80);

    // Hard precondition: the grow step must have actually changed clientHeight.
    // If this fails, the layout changed and the test no longer exercises the
    // "user scrolled away, do not yank them back" path — fail fast.
    const clientHeightAfterGrow = await page.evaluate(
      () => document.querySelector<HTMLElement>('.chat-log')?.clientHeight ?? -1,
    );
    expect(
      clientHeightAfterGrow,
      `expected grow step to reduce chat-log clientHeight ` +
      `(before=${clientHeightBeforeGrow} after=${clientHeightAfterGrow}); ` +
      `increase extraPx in growPinnedTodo or check the layout if this fires`,
    ).toBeLessThan(clientHeightBeforeGrow);

    // Core invariant: scrollTop must be preserved. A regression where
    // followLatestIfPinned fires and snaps the user back to the bottom would
    // set scrollTop = scrollHeight - clientHeight, far from scrollTopBeforeGrow.
    const scrollTopAfterGrow = await page.evaluate(
      () => document.querySelector<HTMLElement>('.chat-log')?.scrollTop ?? -1,
    );
    const SCROLL_PRESERVATION_TOLERANCE_PX = 20;
    expect(
      Math.abs(scrollTopAfterGrow - scrollTopBeforeGrow),
      `expected scrollTop preserved within ${SCROLL_PRESERVATION_TOLERANCE_PX}px of pre-grow ` +
      `(before=${scrollTopBeforeGrow} after=${scrollTopAfterGrow} ` +
      `delta=${Math.abs(scrollTopAfterGrow - scrollTopBeforeGrow)})`,
    ).toBeLessThan(SCROLL_PRESERVATION_TOLERANCE_PX);
  });
});
