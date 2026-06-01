// @vitest-environment jsdom
//
// Regression coverage for nexu-io/open-design#2881 and the #2929 review
// follow-ups.
//
// When the user picks a plugin from the @-mention popover, ChatComposer
// inserts `@${plugin.title}` into the draft and PluginsSection mounts a
// ContextChipStrip + a typed inputs form. Clicking *any* chip's `×`
// invokes PluginsSection's internal `clear()`, which fires `onCleared`
// and unmounts the chip strip and the inputs form.
//
// Three invariants:
//   1. After clear, the inserted `@…` token is gone from the textarea
//      (the original #2881 symptom — orphan styled mention).
//   2. Tools-menu / details-modal applies route through `applyById`
//      without writing to the draft, so user-authored `@…` text that
//      happens to share a label with a chip is left alone after clear
//      (#2929 review — preserves user data).
//   3. The strip catches mentions sitting next to punctuation, not just
//      whitespace. `(@Airbnb)` and `@Airbnb,` must be cleaned because
//      the inline-mention parser still treats them as styled mentions
//      (#2929 review — boundary alignment).

import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer } from '../../src/components/ChatComposer';

const PLUGIN = {
  id: 'airbnb',
  title: 'Airbnb',
  version: '1.0.0',
  trust: 'restricted' as const,
  sourceKind: 'bundled' as const,
  source: 'bundled/airbnb',
  capabilitiesGranted: [],
  manifest: {
    name: 'airbnb',
    title: 'Airbnb',
    description: 'Airbnb-flavoured layout system',
    od: { kind: 'skill' },
  },
  fsPath: '/plugins/airbnb',
  installedAt: 0,
  updatedAt: 0,
};

const APPLY_RESULT = {
  ok: true,
  query: 'Make a {{topic}} brief.',
  contextItems: [
    { kind: 'design-system', id: 'airbnb', label: 'Airbnb' },
    { kind: 'asset', id: 'design-md', name: 'DESIGN.md' },
  ],
  inputs: [{ name: 'topic', type: 'string', required: true, label: 'Topic' }],
  assets: [],
  mcpServers: [],
  trust: 'restricted',
  capabilitiesGranted: ['prompt:inject'],
  capabilitiesRequired: ['prompt:inject'],
  appliedPlugin: {
    snapshotId: 'snap-airbnb',
    pluginId: PLUGIN.id,
    pluginVersion: '1.0.0',
    manifestSourceDigest: 'a'.repeat(64),
    inputs: {},
    resolvedContext: { items: [] },
    capabilitiesGranted: ['prompt:inject'],
    capabilitiesRequired: ['prompt:inject'],
    assetsStaged: [],
    taskKind: 'new-generation',
    appliedAt: 0,
    connectorsRequired: [],
    connectorsResolved: [],
    mcpServers: [],
    status: 'fresh',
  },
  projectMetadata: {},
};

let fetchMock: ReturnType<typeof vi.fn>;

function renderComposer() {
  return render(
    <ChatComposer
      projectId="project-1"
      projectFiles={[]}
      streaming={false}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onOpenMcpSettings={vi.fn()}
    />,
  );
}

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/mcp/servers') {
      return new Response(JSON.stringify({ servers: [], templates: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/plugins') {
      return new Response(JSON.stringify({ plugins: [PLUGIN] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/api/plugins/') && url.endsWith('/apply')) {
      return new Response(JSON.stringify(APPLY_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/skills') {
      return new Response(JSON.stringify({ skills: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('ChatComposer plugin clear prunes draft (#2881)', () => {
  it('drops the inserted `@${plugin.title}` token after the user removes the plugin chip', async () => {
    renderComposer();
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    // @-popover plugin pick: composer inserts `@Airbnb ` into the draft
    // and mounts the chip strip.
    fireEvent.change(input, { target: { value: '@air', selectionStart: 4 } });
    await waitFor(() => expect(screen.getByText('Airbnb')).toBeTruthy());
    fireEvent.click(screen.getByText('Airbnb'));

    await waitFor(() =>
      expect(screen.getByTestId('context-chip-strip')).toBeTruthy(),
    );
    expect(input.value).toBe('@Airbnb ');

    fireEvent.click(screen.getByLabelText(/Remove Plugin Airbnb/i));

    await waitFor(() =>
      expect(screen.queryByTestId('context-chip-strip')).toBeNull(),
    );
    expect(input.value).not.toContain('@Airbnb');
  });

  it('does not erase user-authored text when the plugin was applied without writing to the draft (#2929)', async () => {
    renderComposer();
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    // The user types `@Airbnb` themselves (e.g. discussing the brand)
    // without going through the @-popover plugin-pick path.
    fireEvent.change(input, {
      target: { value: 'compare @Airbnb with our spec', selectionStart: 28 },
    });

    // Drive the apply through the tools-menu Plugins tab — this is the
    // production path that calls `pluginsSectionRef.current.applyById`
    // *without* writing to the draft, mirroring the details-modal
    // "Apply" path. Nothing should land in pluginInsertedTokensRef
    // because the composer never inserted a token for this apply.
    const trigger = document.querySelector(
      '.composer-tools-trigger',
    ) as HTMLButtonElement | null;
    expect(trigger).toBeTruthy();
    fireEvent.click(trigger!);
    await waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());

    // Pick the plugin from inside the now-open tools popover. The
    // plugin row's main button title lives inside a <strong> child; we
    // match against that to avoid the row's description trailing text.
    const popoverPluginButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.composer-tools-row-main'),
    ).find(
      (btn) => btn.querySelector('strong')?.textContent?.trim() === 'Airbnb',
    );
    expect(popoverPluginButton).toBeTruthy();
    fireEvent.click(popoverPluginButton!);

    await waitFor(() =>
      expect(screen.getByTestId('context-chip-strip')).toBeTruthy(),
    );

    // The draft is untouched — the composer never inserted anything,
    // so pluginInsertedTokensRef is empty.
    expect(input.value).toBe('compare @Airbnb with our spec');

    fireEvent.click(screen.getByLabelText(/Remove Plugin Airbnb/i));

    await waitFor(() =>
      expect(screen.queryByTestId('context-chip-strip')).toBeNull(),
    );
    // The user's hand-typed `@Airbnb` survives the clear because the
    // explicit-tracking set was empty for this apply path (#2929).
    expect(input.value).toBe('compare @Airbnb with our spec');
  });

  it('leaves a parser-extended mention alone on chip clear (#2929 round 5)', async () => {
    renderComposer();
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    // @-popover apply seeds `@Airbnb ` into the draft.
    fireEvent.change(input, { target: { value: '@air', selectionStart: 4 } });
    await waitFor(() => expect(screen.getByText('Airbnb')).toBeTruthy());
    fireEvent.click(screen.getByText('Airbnb'));
    await waitFor(() =>
      expect(screen.getByTestId('context-chip-strip')).toBeTruthy(),
    );

    // Simulate the user authoring a sentence around the inserted token
    // incrementally — first prepending `see (`, then appending `),
    // then ship`. Each edit is a small append that the offset diff
    // can shift cleanly without overlapping the tracked entry. A
    // single-shot whole-draft replacement (e.g. paste-over-select)
    // would legitimately drop the entry, which is the safe failure
    // mode for instance-aware tracking; that path is exercised by
    // the round-2 specs below.
    fireEvent.change(input, {
      target: { value: 'see (@Airbnb ', selectionStart: 5 },
    });
    fireEvent.change(input, {
      target: { value: 'see (@Airbnb), then ship', selectionStart: 24 },
    });

    fireEvent.click(screen.getByLabelText(/Remove Plugin Airbnb/i));

    await waitFor(() =>
      expect(screen.queryByTestId('context-chip-strip')).toBeNull(),
    );
    // Round 5: parser tokenizes `@Airbnb)` greedily (the closing
    // paren is in `[^\s@]`), so the parser sees `@Airbnb)` as a
    // single mention rather than a `@Airbnb` mention followed by
    // `)`. The tracker is now aligned with the parser via
    // `isMentionRightBoundary`, so it invalidates this entry and
    // leaves the draft alone — stripping `@Airbnb` would have
    // mutated user-authored text by tearing apart what the parser
    // treats as a single token. The orphan styled mention staying
    // visible is the conservative trade-off documented in
    // utils/pluginInsertionTracking.ts.
    expect(input.value).toBe('see (@Airbnb), then ship');
  });

  it('drops tracked tokens when the user manually deletes the inserted text, then preserves a later user-authored re-type on clear (#2929 round 2)', async () => {
    renderComposer();
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    // @-popover plugin pick seeds `@Airbnb ` and registers the token in
    // pluginInsertedTokensRef.
    fireEvent.change(input, { target: { value: '@air', selectionStart: 4 } });
    await waitFor(() => expect(screen.getByText('Airbnb')).toBeTruthy());
    fireEvent.click(screen.getByText('Airbnb'));
    await waitFor(() =>
      expect(screen.getByTestId('context-chip-strip')).toBeTruthy(),
    );
    expect(input.value).toBe('@Airbnb ');

    // The user manually wipes the inserted token from the draft. The
    // chip stays mounted (PluginsSection owns its own state) but the
    // ref must drop "Airbnb" because the inserted text is gone.
    fireEvent.change(input, { target: { value: '', selectionStart: 0 } });

    // The user now hand-types a *new* sentence containing `@Airbnb` —
    // this is user-authored, not composer-inserted.
    fireEvent.change(input, {
      target: {
        value: 'compare @Airbnb with our spec',
        selectionStart: 29,
      },
    });

    fireEvent.click(screen.getByLabelText(/Remove Plugin Airbnb/i));

    await waitFor(() =>
      expect(screen.queryByTestId('context-chip-strip')).toBeNull(),
    );
    // The user-authored `@Airbnb` survives because the lifecycle prune
    // dropped the tracked token when the original insertion was wiped.
    expect(input.value).toBe('compare @Airbnb with our spec');
  });

  it('drops tracked tokens after send resets the draft, preserving a later user-authored re-type on clear (#2929 round 2)', async () => {
    renderComposer();
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    // @-popover plugin pick seeds `@Airbnb ` and registers the token.
    fireEvent.change(input, { target: { value: '@air', selectionStart: 4 } });
    await waitFor(() => expect(screen.getByText('Airbnb')).toBeTruthy());
    fireEvent.click(screen.getByText('Airbnb'));
    await waitFor(() =>
      expect(screen.getByTestId('context-chip-strip')).toBeTruthy(),
    );

    // Round out the prompt and submit. ChatComposer.reset() runs, which
    // wipes the draft *and* clears pluginInsertedTokensRef so the next
    // turn does not inherit a stale tracking entry.
    fireEvent.change(input, {
      target: { value: '@Airbnb plan a trip', selectionStart: 19 },
    });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    await waitFor(() => expect(input.value).toBe(''));

    // The chip survives the send (PluginsSection owns its state). The
    // user starts a fresh prompt that mentions `@Airbnb` themselves.
    fireEvent.change(input, {
      target: { value: '@Airbnb again, brief me', selectionStart: 23 },
    });

    fireEvent.click(screen.getByLabelText(/Remove Plugin Airbnb/i));

    await waitFor(() =>
      expect(screen.queryByTestId('context-chip-strip')).toBeNull(),
    );
    // Without the reset() ref-clear, this user-authored `@Airbnb`
    // would have been deleted (#2929 round 2 regression).
    expect(input.value).toBe('@Airbnb again, brief me');
  });

  it('keeps a user-authored duplicate `@Airbnb` mention intact when the chip clears (#2929 round 3)', async () => {
    // The reviewer-flagged sequence: composer inserts `@Airbnb` via
    // the popover; the user keeps that insertion AND types a
    // separate `@Airbnb` of their own elsewhere in the same draft.
    // Range-based tracking pins the composer instance at start=0
    // so the chip clear strips only that range — the user's
    // duplicate, untracked, survives.
    renderComposer();
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: '@air', selectionStart: 4 } });
    await waitFor(() => expect(screen.getByText('Airbnb')).toBeTruthy());
    fireEvent.click(screen.getByText('Airbnb'));
    await waitFor(() =>
      expect(screen.getByTestId('context-chip-strip')).toBeTruthy(),
    );
    expect(input.value).toBe('@Airbnb ');

    // User extends the draft by appending text that includes a
    // hand-typed `@Airbnb`. Each fireEvent is a single-point append
    // so the diff sees a clean `[oldLen, oldLen, newLen]` range that
    // sits *after* the entry — the entry stays at start=0.
    fireEvent.change(input, {
      target: { value: '@Airbnb compare ', selectionStart: 16 },
    });
    fireEvent.change(input, {
      target: {
        value: '@Airbnb compare @Airbnb with our spec',
        selectionStart: 37,
      },
    });

    fireEvent.click(screen.getByLabelText(/Remove Plugin Airbnb/i));

    await waitFor(() =>
      expect(screen.queryByTestId('context-chip-strip')).toBeNull(),
    );
    // The composer's `@Airbnb` at offset 0 is excised by the
    // range strip; the user's hand-typed `@Airbnb` at offset 16
    // is untracked and stays. Leading space is collapsed by
    // `[ \t]{2,}` only when adjacent to another space — since
    // the strip leaves `' compare @Airbnb with our spec'`, the
    // single leading space remains.
    expect(input.value).toContain('@Airbnb with our spec');
    expect(input.value).not.toContain('@Airbnb compare');
    expect(input.value).toMatch(/^\s?compare @Airbnb with our spec$/);
  });

  it('reconciles tracked offsets across edits before and after the entry (#2929 round 3)', async () => {
    // Append-after-entry then prepend-before-entry: the diff sees
    // each edit as a small range that does not overlap the tracked
    // insertion, so the offset shifts correctly and chip clear
    // still removes only the composer instance.
    renderComposer();
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: '@air', selectionStart: 4 } });
    await waitFor(() => expect(screen.getByText('Airbnb')).toBeTruthy());
    fireEvent.click(screen.getByText('Airbnb'));
    await waitFor(() =>
      expect(screen.getByTestId('context-chip-strip')).toBeTruthy(),
    );

    // Append `here is more text` after the entry — entry stays at 0.
    fireEvent.change(input, {
      target: { value: '@Airbnb here is more text', selectionStart: 25 },
    });
    // Prepend `prefix ` before the entry — entry shifts to start=7.
    fireEvent.change(input, {
      target: {
        value: 'prefix @Airbnb here is more text',
        selectionStart: 7,
      },
    });

    fireEvent.click(screen.getByLabelText(/Remove Plugin Airbnb/i));

    await waitFor(() =>
      expect(screen.queryByTestId('context-chip-strip')).toBeNull(),
    );
    // The tracked `@Airbnb` is gone but `prefix` and the appended
    // text on either side of it are intact.
    expect(input.value).not.toContain('@Airbnb');
    expect(input.value).toContain('prefix');
    expect(input.value).toContain('here is more text');
  });

  it('reconciles tracked offsets across a tools-menu MCP insert that lands before the entry (#2929 round 4)', async () => {
    // The reviewer-flagged sequence: composer inserts `@Airbnb` via
    // the popover; the user then opens the tools menu, picks an MCP
    // server, and the tools panel prepends `@<mcp> ` at cursor 0.
    // That setDraft path bypassed handleChange before round 4, so
    // the tracked offset stayed at 0 even though the actual `@Airbnb`
    // had moved. The post-clear strip then no-op'd via the
    // `isInsertionStillValid` guard, leaving an orphaned mention —
    // exactly the original #2881 symptom in a supported flow.
    const mcpFetchMock = vi.fn(async (url: string) => {
      if (url === '/api/mcp/servers') {
        // Return one enabled MCP server so the tools menu's MCP tab
        // has something to insert.
        return new Response(
          JSON.stringify({
            servers: [
              {
                id: 'github',
                label: 'github',
                transport: 'stdio',
                enabled: true,
              },
            ],
            templates: [],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }
      if (url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/api/plugins/') && url.endsWith('/apply')) {
        return new Response(JSON.stringify(APPLY_RESULT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/skills') {
        return new Response(JSON.stringify({ skills: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', mcpFetchMock);

    render(
      <ChatComposer
        projectId="project-1"
        projectFiles={[]}
        streaming={false}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onOpenMcpSettings={vi.fn()}
      />,
    );
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    // 1. @-popover pick lands `@Airbnb ` at offset 0.
    fireEvent.change(input, { target: { value: '@air', selectionStart: 4 } });
    await waitFor(() => expect(screen.getByText('Airbnb')).toBeTruthy());
    fireEvent.click(screen.getByText('Airbnb'));
    await waitFor(() =>
      expect(screen.getByTestId('context-chip-strip')).toBeTruthy(),
    );
    expect(input.value).toBe('@Airbnb ');

    // 2. Open the composer tools menu, switch to the MCP tab.
    const trigger = document.querySelector(
      '.composer-tools-trigger',
    ) as HTMLButtonElement | null;
    expect(trigger).toBeTruthy();
    fireEvent.click(trigger!);
    await waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());

    const mcpTabButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.composer-tools-tab'),
    ).find((btn) => btn.textContent?.toLowerCase().includes('mcp'));
    expect(mcpTabButton).toBeTruthy();
    fireEvent.click(mcpTabButton!);

    const githubRow = await waitFor(() => {
      const row = Array.from(
        document.querySelectorAll<HTMLButtonElement>('.composer-tools-row'),
      ).find((btn) => btn.querySelector('strong')?.textContent === 'github');
      expect(row).toBeTruthy();
      return row!;
    });
    // 3. Position the textarea cursor at offset 0 immediately before
    //    triggering onInsert. React re-renders during the menu open
    //    + tab switch can drop the cursor on jsdom under CI (locally
    //    they preserve selection but Actions does not), so we set
    //    it as late as possible to make the read deterministic.
    input.focus();
    input.setSelectionRange(0, 0);

    // 4. Click the github server. The MCP panel's onInsert prepends
    //    `@github ` at cursor 0, going through `updateDraft` which
    //    must reconcile the tracked Airbnb offset from 0 → 8.
    fireEvent.click(githubRow);

    await waitFor(() => expect(input.value).toBe('@github @Airbnb '));

    // 4. Click the chip × — strip should excise the (now reconciled)
    //    Airbnb at offset 8, leaving the user's MCP `@github` alone.
    fireEvent.click(screen.getByLabelText(/Remove Plugin Airbnb/i));

    await waitFor(() =>
      expect(screen.queryByTestId('context-chip-strip')).toBeNull(),
    );
    // Without the round-4 updateDraft chokepoint, this would still
    // contain `@Airbnb` (orphan mention) because the tracked offset
    // would point at `@github`'s start, fail validity, and the strip
    // would no-op.
    expect(input.value).not.toContain('@Airbnb');
    expect(input.value).toContain('@github');
  });

  it('tracks two consecutive composer-inserted `@Airbnb` instances independently (#2929 round 3)', async () => {
    // User picks the same plugin from the @-popover twice in a row.
    // Each insertion gets its own entry in pluginInsertedTokensRef,
    // and the chip clear strips both ranges.
    renderComposer();
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    // First pick.
    fireEvent.change(input, { target: { value: '@air', selectionStart: 4 } });
    await waitFor(() => expect(screen.getByText('Airbnb')).toBeTruthy());
    fireEvent.click(screen.getByText('Airbnb'));
    await waitFor(() =>
      expect(screen.getByTestId('context-chip-strip')).toBeTruthy(),
    );
    expect(input.value).toBe('@Airbnb ');

    // User triggers the popover again at the end of the draft. The
    // chip already shows "Airbnb" too, so we have to scope the click
    // to the mention-popover container; otherwise getByText resolves
    // to the chip label and the click does nothing.
    fireEvent.change(input, {
      target: { value: '@Airbnb @air', selectionStart: 12 },
    });
    await waitFor(() => {
      const popover = screen.getByTestId('mention-popover');
      const airbnbButton = popover.querySelector<HTMLElement>(
        '.mention-item--plugin',
      );
      expect(airbnbButton?.textContent).toContain('Airbnb');
    });
    const popoverAirbnbButton = screen
      .getByTestId('mention-popover')
      .querySelector<HTMLElement>('.mention-item--plugin')!;
    fireEvent.click(popoverAirbnbButton);
    // Second pick lands `@Airbnb ` after the first; the input now
    // holds two composer-inserted instances.
    await waitFor(() =>
      expect(input.value).toBe('@Airbnb @Airbnb '),
    );

    fireEvent.click(screen.getByLabelText(/Remove Plugin Airbnb/i));

    await waitFor(() =>
      expect(screen.queryByTestId('context-chip-strip')).toBeNull(),
    );
    // Both tracked ranges removed; the residual whitespace gets
    // collapsed to a single space (or empty) by the strip.
    expect(input.value).not.toContain('@Airbnb');
    expect(input.value.trim()).toBe('');
  });

  it('does not tear `@Airbnb/foo` apart on chip clear (#2929 round 5)', async () => {
    // The parser's `@[^\s@]+` greedy regex tokenizes `@Airbnb/foo`
    // as a single mention. If the tracker considered the `@Airbnb`
    // prefix valid for stripping, the post-clear strip would
    // remove `@Airbnb` and leave `/foo` dangling — that is
    // user-authored text mutation, not orphan removal. The
    // round-5 right-boundary rule (aligned with the parser via
    // `isMentionRightBoundary`) invalidates this entry on clear,
    // leaving the draft alone.
    renderComposer();
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: '@air', selectionStart: 4 } });
    await waitFor(() => expect(screen.getByText('Airbnb')).toBeTruthy());
    fireEvent.click(screen.getByText('Airbnb'));
    await waitFor(() =>
      expect(screen.getByTestId('context-chip-strip')).toBeTruthy(),
    );

    // User extends the inserted token by deleting the trailing
    // space and typing `/foo`. After the edit, the parser sees
    // `@Airbnb/foo` as one mention.
    fireEvent.change(input, {
      target: { value: '@Airbnb', selectionStart: 7 },
    });
    fireEvent.change(input, {
      target: { value: '@Airbnb/foo', selectionStart: 11 },
    });

    fireEvent.click(screen.getByLabelText(/Remove Plugin Airbnb/i));

    await waitFor(() =>
      expect(screen.queryByTestId('context-chip-strip')).toBeNull(),
    );
    // Draft stays intact — the strip was a no-op because the entry
    // was invalidated by the round-5 right-boundary rule.
    expect(input.value).toBe('@Airbnb/foo');
  });

  it('preserves the previous-plugin `@<token>` when a new plugin is applied via tools-menu and then cleared (#2929 round 6)', async () => {
    // Reviewer-flagged replace-plugin sequence:
    //   1. @-pick plugin A → draft=`@A `, tracked entry for A
    //   2. tools-menu apply plugin B → chip strip switches A → B,
    //      `applyById(B)` does NOT touch the draft, so `@A` is now
    //      visually orphaned but still in the textarea.
    //   3. clear B's chip → onCleared must NOT strip the user's
    //      (now-orphaned) `@A`, since it was never B's. Pre-round-6
    //      tracking was global-per-composer and `onCleared` removed
    //      every entry regardless of which plugin owned it, so
    //      step 3 deleted `@A`. The fix scopes entries by `pluginId`
    //      and drops non-active entries on `setActivePlugin`.
    const PLUGIN_B = {
      ...PLUGIN,
      id: 'second-plugin',
      title: 'SecondPlugin',
      manifest: { ...PLUGIN.manifest, name: 'second-plugin', title: 'SecondPlugin' },
    };
    const replaceFetchMock = vi.fn(async (url: string) => {
      if (url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [PLUGIN, PLUGIN_B] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/mcp/servers') {
        return new Response(JSON.stringify({ servers: [], templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/api/plugins/') && url.endsWith('/apply')) {
        return new Response(JSON.stringify(APPLY_RESULT), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/skills') {
        return new Response(JSON.stringify({ skills: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', replaceFetchMock);

    renderComposer();
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    // Step 1: @-popover pick plugin A (Airbnb).
    fireEvent.change(input, { target: { value: '@air', selectionStart: 4 } });
    await waitFor(() => expect(screen.getByText('Airbnb')).toBeTruthy());
    fireEvent.click(screen.getByText('Airbnb'));
    await waitFor(() =>
      expect(screen.getByTestId('context-chip-strip')).toBeTruthy(),
    );
    expect(input.value).toBe('@Airbnb ');

    // Step 2: tools-menu plugins-tab apply plugin B (SecondPlugin).
    // This goes through `pluginsSectionRef.current.applyById` without
    // writing to the draft, so the textarea retains `@Airbnb `.
    const trigger = document.querySelector(
      '.composer-tools-trigger',
    ) as HTMLButtonElement | null;
    expect(trigger).toBeTruthy();
    fireEvent.click(trigger!);
    await waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());

    const popoverPluginButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.composer-tools-row-main'),
    ).find(
      (btn) => btn.querySelector('strong')?.textContent?.trim() === 'SecondPlugin',
    );
    expect(popoverPluginButton).toBeTruthy();
    fireEvent.click(popoverPluginButton!);

    await waitFor(() =>
      expect(screen.getByLabelText(/Remove Plugin SecondPlugin/i)).toBeTruthy(),
    );
    // Draft is unchanged — applyById did not write — but the chip
    // strip now reflects SecondPlugin instead of Airbnb.
    expect(input.value).toBe('@Airbnb ');

    // Step 3: clear SecondPlugin's chip. `@Airbnb` belongs to a
    // different (no-longer-active) plugin and must survive.
    fireEvent.click(screen.getByLabelText(/Remove Plugin SecondPlugin/i));

    await waitFor(() =>
      expect(screen.queryByTestId('context-chip-strip')).toBeNull(),
    );
    expect(input.value).toBe('@Airbnb ');
  });

  // Round 7 — transactional applyById. PluginsSectionHandle.applyById
  // returns null on `/apply` failure; before round 7 the tracker was
  // committed eagerly (active id changed, entries pushed/dropped)
  // before that result was known. A failure left the chip strip
  // showing the previously-active plugin while the tracker reflected
  // a half-applied state, so subsequent clears either deleted
  // user-visible just-inserted text or no-op'd over an orphan that
  // should have been cleaned. The fix snapshots tracker (and draft,
  // for the picker path) before mutation and rolls back when
  // `applyById` returns null.
  function makeFailingApplyFetch() {
    return vi.fn(async (url: string) => {
      if (url === '/api/mcp/servers') {
        return new Response(JSON.stringify({ servers: [], templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/api/plugins/') && url.endsWith('/apply')) {
        // Simulate `/apply` 5xx — `applyPlugin()` returns null,
        // `PluginsSectionHandle.applyById` propagates that null.
        return new Response('apply failed', { status: 500 });
      }
      if (url === '/api/skills') {
        return new Response(JSON.stringify({ skills: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
  }

  it('rolls back the @-picker insertion when applyById fails (#2929 round 7)', async () => {
    // The picker path commits the draft (replaceMentionWithText) then
    // pushes a tracked entry then awaits applyById. If apply fails,
    // the draft must be restored — the chip never mounted, so a
    // later "clear the previously-active chip" must not strip the
    // ghost `@<token>` that the user can see in the textarea but
    // can't tie to any chip.
    vi.stubGlobal('fetch', makeFailingApplyFetch());
    renderComposer();
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: '@air', selectionStart: 4 } });
    await waitFor(() => expect(screen.getByText('Airbnb')).toBeTruthy());
    fireEvent.click(screen.getByText('Airbnb'));

    // Apply 500'd, so the chip strip never mounts. Wait for the
    // network rejection path to settle, then assert the textarea
    // has been rolled back to the user's pre-pick `@air` query.
    await waitFor(() => {
      expect(screen.queryByTestId('context-chip-strip')).toBeNull();
      expect(input.value).toBe('@air');
    });
  });

  it('preserves user keystrokes that arrive during a pending applyById that fails (#2929 round 8)', async () => {
    // Reviewer-flagged sequence: textarea stays interactive during
    // the `/apply` await, so the user can type more characters
    // between the popover pick and the apply response. If apply
    // 500s, the round-7 unconditional `setDraft(prevDraftValue)`
    // rollback would clobber those newer keystrokes — real prompt-
    // data-loss in the changed flow. The round-8 fix gates the
    // draft-restore on the textarea still being in the post-
    // optimistic-write state; if it has moved past, only the
    // tracker is restored and the user's edits stay.
    //
    // The test uses a deferred Response so the `/apply` fetch is
    // pending after the popover click; we then fire a `change`
    // event simulating the user typing during the await, and only
    // then resolve the deferred Response with a 500.
    let resolveApply: ((value: Response) => void) | null = null;
    const deferredApply = new Promise<Response>((resolve) => {
      resolveApply = resolve;
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/mcp/servers') {
        return new Response(JSON.stringify({ servers: [], templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/api/plugins/') && url.endsWith('/apply')) {
        return deferredApply;
      }
      if (url === '/api/skills') {
        return new Response(JSON.stringify({ skills: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderComposer();
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: '@air', selectionStart: 4 } });
    await waitFor(() => expect(screen.getByText('Airbnb')).toBeTruthy());
    fireEvent.click(screen.getByText('Airbnb'));

    // The optimistic write happened; `/apply` is in flight. Draft
    // is currently `@Airbnb `. Simulate user typing more text
    // before the apply response arrives.
    expect(input.value).toBe('@Airbnb ');
    fireEvent.change(input, {
      target: { value: '@Airbnb extra typing', selectionStart: 20 },
    });

    // Now resolve the in-flight apply with a 500.
    expect(resolveApply).not.toBeNull();
    resolveApply!(new Response('apply failed', { status: 500 }));

    // Wait for the rollback path to run. The tracker should be
    // restored (so a future chip clear is a no-op for this entry),
    // but the draft must NOT be rewritten back to `@air` — that
    // would clobber the user's `extra typing`.
    await waitFor(() => {
      expect(screen.queryByTestId('context-chip-strip')).toBeNull();
    });
    expect(input.value).toBe('@Airbnb extra typing');
  });

  it('rolls back the active-plugin id when tools-menu applyById fails (#2929 round 7)', async () => {
    // The tools-menu / details-modal paths do not write to the
    // draft, but they DO change the active-plugin id (filtering
    // out entries from any previously-active plugin). If apply
    // fails, the tracker must restore the original active id so
    // a later clear of the (still-mounted) original chip strips
    // its `@<token>` correctly.
    //
    // Sequence: @-popover pick A succeeds (apply mock returns
    // success the first time), tracker = [Airbnb at 0]; tools-menu
    // re-pick A but apply now 500s (we install a failing fetch
    // mock right before the second click); tracker should NOT have
    // dropped Airbnb's entry. Clear A's chip — `@Airbnb` strips.
    let applyCallCount = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/mcp/servers') {
        return new Response(JSON.stringify({ servers: [], templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/api/plugins/') && url.endsWith('/apply')) {
        applyCallCount++;
        if (applyCallCount === 1) {
          return new Response(JSON.stringify(APPLY_RESULT), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        // Second apply (tools-menu re-pick) fails.
        return new Response('apply failed', { status: 500 });
      }
      if (url === '/api/skills') {
        return new Response(JSON.stringify({ skills: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderComposer();
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    // Step 1: @-popover pick (apply succeeds).
    fireEvent.change(input, { target: { value: '@air', selectionStart: 4 } });
    await waitFor(() => expect(screen.getByText('Airbnb')).toBeTruthy());
    fireEvent.click(screen.getByText('Airbnb'));
    await waitFor(() =>
      expect(screen.getByTestId('context-chip-strip')).toBeTruthy(),
    );
    expect(input.value).toBe('@Airbnb ');

    // Step 2: tools-menu re-pick (apply will fail). The tracker
    // pre-round-7 dropped Airbnb's entry on `setActivePlugin` and
    // never restored it; round 7's snapshot+rollback restores it.
    const trigger = document.querySelector(
      '.composer-tools-trigger',
    ) as HTMLButtonElement | null;
    expect(trigger).toBeTruthy();
    fireEvent.click(trigger!);
    await waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());

    const popoverPluginButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.composer-tools-row-main'),
    ).find(
      (btn) => btn.querySelector('strong')?.textContent?.trim() === 'Airbnb',
    );
    expect(popoverPluginButton).toBeTruthy();
    fireEvent.click(popoverPluginButton!);

    // Wait for the failed apply to settle. The chip strip should
    // still be the original (no remount), and clicking × on it must
    // strip `@Airbnb` from the draft — which only works if
    // Airbnb's entry survived the rollback.
    await waitFor(() => expect(applyCallCount).toBe(2));
    expect(screen.getByTestId('context-chip-strip')).toBeTruthy();

    fireEvent.click(screen.getByLabelText(/Remove Plugin Airbnb/i));
    await waitFor(() =>
      expect(screen.queryByTestId('context-chip-strip')).toBeNull(),
    );
    expect(input.value).not.toContain('@Airbnb');
  });

  it('strips the unmounting plugin\'s `@<token>` (not the in-flight target\'s) when the user clears the original chip during a pending @-popover replace (#2929 round 9)', async () => {
    // Round 9 (codex) — pending-apply race in `insertPluginMention`.
    //
    // Pre-fix, `insertPluginMention` ran:
    //   pluginInsertedTokensRef.current.push(B);   // sync
    //   setActivePlugin(B.id);                     // sync — drops A's entries
    //   await pluginsSectionRef.current.applyById(B);
    //
    // So during the await, the chip strip still showed A but the
    // tracker reflected B. If the user clicked A's `×` in this
    // window, `onCleared` saw only B's entry, stripped the freshly
    // optimistic `@B` from the draft (deleting user-visible text),
    // and left A's `@A` orphaned (the original #2881 symptom).
    //
    // Fix: defer `setActivePlugin(B.id)` until the apply resolves
    // successfully, AND have `onCleared` filter the tracker by
    // `pluginsSectionRef.current?.getActiveRecord()?.id` so the
    // strip is scoped to the plugin whose chip is actually
    // unmounting. PluginsSection's `activeRecord` only flips on
    // successful apply, so during the pending window
    // `getActiveRecord()` reports A — exactly the chip being
    // removed.
    let resolveApply: ((value: Response) => void) | null = null;
    let applyCallCount = 0;
    const PLUGIN_B = {
      ...PLUGIN,
      id: 'second-plugin',
      title: 'SecondPlugin',
      manifest: {
        ...PLUGIN.manifest,
        name: 'second-plugin',
        title: 'SecondPlugin',
      },
    };
    const pendingFetchMock = vi.fn(async (url: string) => {
      if (url === '/api/mcp/servers') {
        return new Response(JSON.stringify({ servers: [], templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/plugins') {
        return new Response(
          JSON.stringify({ plugins: [PLUGIN, PLUGIN_B] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/api/plugins/') && url.endsWith('/apply')) {
        applyCallCount++;
        if (applyCallCount === 1) {
          // First apply (Airbnb) succeeds immediately so the chip
          // mounts and the user has something to click.
          return new Response(JSON.stringify(APPLY_RESULT), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        // Second apply (SecondPlugin) hangs until the test
        // resolves it, simulating a slow `/apply` endpoint.
        return new Promise<Response>((resolve) => {
          resolveApply = resolve;
        });
      }
      if (url === '/api/skills') {
        return new Response(JSON.stringify({ skills: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', pendingFetchMock);

    renderComposer();
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    // Step 1: @-popover pick Airbnb — apply succeeds, chip mounts,
    // tracker = [Airbnb at offset 0].
    fireEvent.change(input, { target: { value: '@air', selectionStart: 4 } });
    await waitFor(() => expect(screen.getByText('Airbnb')).toBeTruthy());
    fireEvent.click(screen.getByText('Airbnb'));
    await waitFor(() =>
      expect(screen.getByLabelText(/Remove Plugin Airbnb/i)).toBeTruthy(),
    );
    expect(input.value).toBe('@Airbnb ');

    // Step 2: type `@sec` after the existing `@Airbnb ` so the
    // mention popover anchors at the new position, then pick
    // SecondPlugin. The optimistic write lands `@SecondPlugin `
    // immediately; applyById is now waiting on `resolveApply`.
    fireEvent.change(input, {
      target: { value: '@Airbnb @sec', selectionStart: 12 },
    });
    await waitFor(() => {
      const popover = screen.getByTestId('mention-popover');
      expect(popover.textContent).toContain('SecondPlugin');
    });
    const popoverSecondButton = screen
      .getByTestId('mention-popover')
      .querySelector<HTMLElement>('.mention-item--plugin')!;
    fireEvent.click(popoverSecondButton);

    await waitFor(() => expect(input.value).toBe('@Airbnb @SecondPlugin '));
    expect(applyCallCount).toBe(2);
    expect(resolveApply).not.toBeNull();
    // Chip strip still shows Airbnb because PluginsSection only
    // flips `activeRecord` on successful apply.
    expect(screen.getByLabelText(/Remove Plugin Airbnb/i)).toBeTruthy();

    // Step 3: in this pending window, user clicks Airbnb's `×`.
    // Pre-fix: tracker had only SecondPlugin's entry (Airbnb's
    // dropped by eager setActivePlugin), so onCleared stripped
    // `@SecondPlugin` and left `@Airbnb` orphaned. Post-fix:
    // setActivePlugin is deferred, tracker still has both
    // entries, and onCleared filters by getActiveRecord() =
    // Airbnb so only `@Airbnb` is stripped.
    fireEvent.click(screen.getByLabelText(/Remove Plugin Airbnb/i));

    await waitFor(() => {
      expect(input.value).not.toContain('@Airbnb');
      expect(input.value).toContain('@SecondPlugin');
    });

    // Step 4: resolve the in-flight apply. PluginsSection now
    // mounts SecondPlugin's chip; setActivePlugin(SecondPlugin)
    // commits, dropping any stale Airbnb entries (none — already
    // stripped by step 3). The remaining `@SecondPlugin` token
    // is properly tied to the new chip.
    resolveApply!(
      new Response(JSON.stringify(APPLY_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText(/Remove Plugin SecondPlugin/i)).toBeTruthy(),
    );

    // Step 5: clearing SecondPlugin's chip strips `@SecondPlugin`,
    // verifying that the deferred setActivePlugin fired on
    // success and the entry survived the pending-window clear.
    fireEvent.click(screen.getByLabelText(/Remove Plugin SecondPlugin/i));
    await waitFor(() =>
      expect(screen.queryByTestId('context-chip-strip')).toBeNull(),
    );
    expect(input.value).not.toContain('@SecondPlugin');
  });

  it('strips the @-popover plugin\'s `@<token>` when the user clears the original chip during a pending tools-menu replace (#2929 round 9)', async () => {
    // Round 9 (codex) — pending-apply race in the tools-menu
    // `onApply` path. Tools-menu apply doesn't write to the draft;
    // pre-fix it called `setActivePlugin(target)` synchronously,
    // which dropped the previously-active plugin's entries from
    // the tracker before `applyById` resolved. If the user clicked
    // the original chip's `×` in that pending window, `onCleared`
    // saw an empty tracker and no-op'd — leaving `@<original>`
    // orphaned in the draft (#2881 symptom recurring).
    //
    // Fix: defer setActivePlugin until applyById resolves
    // successfully, plus the onCleared filter that scopes the
    // strip to `getActiveRecord()?.id`.
    let resolveApply: ((value: Response) => void) | null = null;
    let applyCallCount = 0;
    const PLUGIN_B = {
      ...PLUGIN,
      id: 'second-plugin',
      title: 'SecondPlugin',
      manifest: {
        ...PLUGIN.manifest,
        name: 'second-plugin',
        title: 'SecondPlugin',
      },
    };
    const toolsMenuPendingFetchMock = vi.fn(async (url: string) => {
      if (url === '/api/mcp/servers') {
        return new Response(JSON.stringify({ servers: [], templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/plugins') {
        return new Response(
          JSON.stringify({ plugins: [PLUGIN, PLUGIN_B] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/api/plugins/') && url.endsWith('/apply')) {
        applyCallCount++;
        if (applyCallCount === 1) {
          return new Response(JSON.stringify(APPLY_RESULT), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Promise<Response>((resolve) => {
          resolveApply = resolve;
        });
      }
      if (url === '/api/skills') {
        return new Response(JSON.stringify({ skills: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', toolsMenuPendingFetchMock);

    renderComposer();
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    // Step 1: @-popover pick Airbnb — apply succeeds, chip mounts,
    // tracker = [Airbnb at offset 0], draft = `@Airbnb `.
    fireEvent.change(input, { target: { value: '@air', selectionStart: 4 } });
    await waitFor(() => expect(screen.getByText('Airbnb')).toBeTruthy());
    fireEvent.click(screen.getByText('Airbnb'));
    await waitFor(() =>
      expect(screen.getByLabelText(/Remove Plugin Airbnb/i)).toBeTruthy(),
    );
    expect(input.value).toBe('@Airbnb ');

    // Step 2: open tools-menu Plugins tab and pick SecondPlugin.
    // Tools-menu apply doesn't write to the draft, but pre-fix it
    // dropped Airbnb's tracker entry synchronously. applyById is
    // now waiting on `resolveApply` — chip strip still shows
    // Airbnb.
    const trigger = document.querySelector(
      '.composer-tools-trigger',
    ) as HTMLButtonElement | null;
    expect(trigger).toBeTruthy();
    fireEvent.click(trigger!);
    await waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());

    const popoverSecondPluginButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.composer-tools-row-main'),
    ).find(
      (btn) => btn.querySelector('strong')?.textContent?.trim() === 'SecondPlugin',
    );
    expect(popoverSecondPluginButton).toBeTruthy();
    fireEvent.click(popoverSecondPluginButton!);

    await waitFor(() => expect(applyCallCount).toBe(2));
    expect(resolveApply).not.toBeNull();
    // Chip strip still mounted for Airbnb (apply hasn't resolved).
    expect(screen.getByLabelText(/Remove Plugin Airbnb/i)).toBeTruthy();
    // Draft unchanged because tools-menu doesn't write.
    expect(input.value).toBe('@Airbnb ');

    // Step 3: user clicks Airbnb's `×` while tools-menu's
    // applyById(SecondPlugin) is still in flight. Pre-fix:
    // setActivePlugin(SecondPlugin) at the start of `onApply`
    // already dropped Airbnb's entry, so onCleared had nothing to
    // strip and `@Airbnb` stayed orphaned. Post-fix:
    // setActivePlugin is deferred, tracker still has Airbnb's
    // entry, and onCleared filters by getActiveRecord() = Airbnb
    // so `@Airbnb` is stripped.
    fireEvent.click(screen.getByLabelText(/Remove Plugin Airbnb/i));

    await waitFor(() => expect(input.value).not.toContain('@Airbnb'));

    // Step 4: resolve the in-flight tools-menu apply. Chip strip
    // remounts for SecondPlugin and setActivePlugin(SecondPlugin)
    // commits.
    resolveApply!(
      new Response(JSON.stringify(APPLY_RESULT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText(/Remove Plugin SecondPlugin/i)).toBeTruthy(),
    );
    // Draft remains stripped — applyById's success doesn't
    // re-introduce `@Airbnb`.
    expect(input.value).not.toContain('@Airbnb');
  });

  it('strips the failed target insertion (and leaves intervening-clear state intact) when applyById fails after the user clears the original chip mid-flight (#2929 round 10)', async () => {
    // Round 10 (codex) — failure-path race in `insertPluginMention`.
    //
    // Pre-fix, when `applyById` returned null, the rollback ran:
    //   pluginInsertedTokensRef.current = prevEntries;
    //   activePluginIdRef.current = prevActiveId;
    //
    // restoring the tracker as it was before the optimistic push.
    // That assumed nothing else had touched the tracker during the
    // await — but the round-9 `onCleared` filter explicitly mutates
    // the tracker to strip the unmounting plugin's entries. If the
    // user clicked the still-mounted original chip's × during the
    // pending replace AND then `applyById` resolved with a 500,
    // wholesale-restoring `prevEntries` would (a) resurrect the
    // already-stripped entries with stale offsets and (b) leave the
    // optimistic `@<target>` orphaned in the draft with no chip
    // mounted — the original #2881 symptom recurring inside the
    // failure window.
    //
    // Fix: detect "intervening clear" via
    // `activePluginIdRef.current === null && prevActiveId !== null`
    // (onCleared nulls the active id, the deferred setActivePlugin
    // never ran in the failure branch), and on detection remove
    // ONLY our optimistic entry (located by `insertionId` so a
    // duplicate-pick of the same plugin during the await is still
    // disambiguated) and strip ONLY its `@<target>` from the draft,
    // leaving the rest of `onCleared`'s work intact.
    let resolveApply: ((value: Response) => void) | null = null;
    let applyCallCount = 0;
    const PLUGIN_B = {
      ...PLUGIN,
      id: 'second-plugin',
      title: 'SecondPlugin',
      manifest: {
        ...PLUGIN.manifest,
        name: 'second-plugin',
        title: 'SecondPlugin',
      },
    };
    const r10FetchMock = vi.fn(async (url: string) => {
      if (url === '/api/mcp/servers') {
        return new Response(JSON.stringify({ servers: [], templates: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/plugins') {
        return new Response(
          JSON.stringify({ plugins: [PLUGIN, PLUGIN_B] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/api/plugins/') && url.endsWith('/apply')) {
        applyCallCount++;
        if (applyCallCount === 1) {
          // First apply (Airbnb) succeeds so the chip mounts.
          return new Response(JSON.stringify(APPLY_RESULT), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        // Second apply (SecondPlugin) hangs until the test resolves
        // it — we will resolve with a 500 below.
        return new Promise<Response>((resolve) => {
          resolveApply = resolve;
        });
      }
      if (url === '/api/skills') {
        return new Response(JSON.stringify({ skills: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', r10FetchMock);

    renderComposer();
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    // Step 1: @-popover pick Airbnb — apply succeeds, chip mounts.
    fireEvent.change(input, { target: { value: '@air', selectionStart: 4 } });
    await waitFor(() => expect(screen.getByText('Airbnb')).toBeTruthy());
    fireEvent.click(screen.getByText('Airbnb'));
    await waitFor(() =>
      expect(screen.getByLabelText(/Remove Plugin Airbnb/i)).toBeTruthy(),
    );
    expect(input.value).toBe('@Airbnb ');

    // Step 2: pick SecondPlugin from the @-popover — applyById is
    // deferred, draft now holds `@Airbnb @SecondPlugin `.
    fireEvent.change(input, {
      target: { value: '@Airbnb @sec', selectionStart: 12 },
    });
    await waitFor(() => {
      const popover = screen.getByTestId('mention-popover');
      expect(popover.textContent).toContain('SecondPlugin');
    });
    const popoverSecondButton = screen
      .getByTestId('mention-popover')
      .querySelector<HTMLElement>('.mention-item--plugin')!;
    fireEvent.click(popoverSecondButton);

    await waitFor(() => expect(input.value).toBe('@Airbnb @SecondPlugin '));
    expect(applyCallCount).toBe(2);
    expect(resolveApply).not.toBeNull();
    expect(screen.getByLabelText(/Remove Plugin Airbnb/i)).toBeTruthy();

    // Step 3: clear Airbnb's chip while applyById(SecondPlugin) is
    // in flight. Round 9's getActiveRecord-scoped onCleared strips
    // `@Airbnb` and leaves `@SecondPlugin` intact; activePluginIdRef
    // is nulled.
    fireEvent.click(screen.getByLabelText(/Remove Plugin Airbnb/i));
    await waitFor(() => {
      expect(input.value).not.toContain('@Airbnb');
      expect(input.value).toContain('@SecondPlugin');
    });

    // Step 4: resolve the in-flight apply with a 500. Pre-fix:
    // wholesale `prevEntries` restore resurrects Airbnb's stale
    // entry, AND `@SecondPlugin` stays orphaned in the draft
    // (no chip mounts because apply failed). Post-fix:
    // intervenedClear branch removes ONLY SecondPlugin's entry and
    // strips ONLY `@SecondPlugin` from the draft.
    resolveApply!(new Response('apply failed', { status: 500 }));

    await waitFor(() => expect(input.value).not.toContain('@SecondPlugin'));
    // Both `@<token>` insertions are gone, no chip is mounted, and
    // the tracker holds no stale entries (verified indirectly: a
    // hand-typed `@Airbnb` later would survive a never-mounted-chip
    // clear, but we cannot hand-type one here without remounting
    // the chip — the empty value below is the strongest assertion
    // we can make on the public surface).
    expect(screen.queryByTestId('context-chip-strip')).toBeNull();
    expect(input.value.trim()).toBe('');
  });

  it('keeps tracked offsets correct under React StrictMode double-invoke (#2929 round 5)', async () => {
    // React's StrictMode (enabled in apps/web/next.config.ts via
    // `reactStrictMode: true`) double-invokes setState updaters in
    // development to surface impurity. An earlier version of
    // `updateDraft` mutated `pluginInsertedTokensRef.current`
    // inside the `setDraft` updater, which meant the ref was
    // shifted twice for every tracked-mention-moving edit (e.g.
    // the round-4 tools-menu MCP prepend) and the second shift
    // pushed the offset out of bounds — `stripPluginInsertedTokens`
    // then no-op'd via `isInsertionStillValid`, reproducing the
    // original #2881 orphan-mention symptom on every keystroke in
    // dev. The fix moves reconcile out of the updater and uses a
    // synchronous `draftRef` mirror as `prev`, so double-invoke
    // is harmless. Rendering inside `<StrictMode>` here would
    // catch a regression at the integration layer.
    render(
      <StrictMode>
        <ChatComposer
          projectId="project-1"
          projectFiles={[]}
          streaming={false}
          onEnsureProject={async () => 'project-1'}
          onSend={vi.fn()}
          onStop={vi.fn()}
          onOpenMcpSettings={vi.fn()}
        />
      </StrictMode>,
    );
    const input = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;

    // @-popover pick lands `@Airbnb ` at offset 0.
    fireEvent.change(input, { target: { value: '@air', selectionStart: 4 } });
    await waitFor(() => expect(screen.getByText('Airbnb')).toBeTruthy());
    fireEvent.click(screen.getByText('Airbnb'));
    await waitFor(() =>
      expect(screen.getByTestId('context-chip-strip')).toBeTruthy(),
    );

    // User keeps the insertion and types a separate user-authored
    // `@Airbnb` later — the round-3 reviewer scenario. With the
    // round-5 fix, the tracked entry stays at offset 0 even after
    // multiple StrictMode-doubled updateDraft passes; without the
    // fix, it would shift to 8, then 16, drop, and the strip would
    // remove nothing (or in the worst case both `@Airbnb`s).
    fireEvent.change(input, {
      target: { value: '@Airbnb compare ', selectionStart: 16 },
    });
    fireEvent.change(input, {
      target: {
        value: '@Airbnb compare @Airbnb with our spec',
        selectionStart: 37,
      },
    });

    fireEvent.click(screen.getByLabelText(/Remove Plugin Airbnb/i));

    await waitFor(() =>
      expect(screen.queryByTestId('context-chip-strip')).toBeNull(),
    );
    // Composer's `@Airbnb` at offset 0 stripped; user's at offset
    // 16 preserved. Same assertion as the round-3 spec, but now
    // under StrictMode.
    expect(input.value).toContain('@Airbnb with our spec');
    expect(input.value).not.toContain('@Airbnb compare');
  });
});
