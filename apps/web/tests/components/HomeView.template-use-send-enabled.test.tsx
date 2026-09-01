// @vitest-environment jsdom

// Community-template "Use" must land the composer in a sendable state.
//
// Clicking 「使用」 on a community template detail dialog routes through
// HomeView.routePluginUse('use-with-query'), which seeds the composer with the
// template's own brief and binds the template as the run's driver. For a
// template whose `od.inputs` are `required: true` with no `default` (the real
// `example-html-ppt-pitch-deck` ships three such fields) the bind left
// `active.inputsValid === false`, and `submitDisabled` folded that into the
// send button — so the user saw a full prompt next to a permanently dead Send
// whose tooltip still read "Type something to run". Typing did not help: the
// gate was never about the prompt.
//
// The fields have no input surface on that path at all. #3645 removed the Home
// composer's inline plugin-inputs form, and a template whose query carries no
// `{{...}}` placeholders has no prompt -> inputs write-back either, so the gate
// asked for values the user could not supply anywhere. It now stands down
// exactly there, and stays where it is still meaningful (a tracked
// `queryTemplate`, or the media composer's own fields). The daemon remains the
// authority — `validateInputs` still throws MissingInputError — so these specs
// also pin that a daemon rejection reads as the missing fields rather than a
// generic apply failure.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { HomeView } from '../../src/components/HomeView';
import { createPluginUseHandoff } from '../../src/components/home-hero/plugin-authoring';
import { I18nProvider } from '../../src/i18n';
import { writeHomeGuideStage } from '../../src/components/home-hero/firstRunGuide';

let workspaceContextForTest: WorkspaceCollabContext | null = null;
const reloadTeamProjects = vi.fn();

vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>()),
  useWorkspaceContext: () => ({
    context: workspaceContextForTest,
    loading: false,
  }),
  useTeamProjects: () => ({
    projects: [],
    loading: false,
    reload: reloadTeamProjects,
  }),
}));

const BASE = {
  version: '0.1.0',
  trust: 'bundled' as const,
  sourceKind: 'bundled' as const,
  capabilitiesGranted: ['prompt:inject'],
  installedAt: 0,
  updatedAt: 0,
};

// Shaped after plugins/_official/examples/html-ppt-pitch-deck/open-design.json:
// three required fields with a `placeholder` but no `default`, and a useCase
// query that carries no `{{...}}` placeholders (so the seed comes from the
// description and no queryTemplate is tracked -> no write-back surface).
const PITCH_DECK = {
  ...BASE,
  id: 'example-html-ppt-pitch-deck',
  title: 'Write a Demo Day Pitch like a Top Accelerator Partner',
  source: '/tmp/pitch-deck',
  fsPath: '/tmp/pitch-deck',
  manifest: {
    name: 'example-html-ppt-pitch-deck',
    title: 'Write a Demo Day Pitch like a Top Accelerator Partner',
    version: '0.1.0',
    description: 'A decision-grade fundraising pitch deck for accelerator partners and angels.',
    od: {
      kind: 'scenario',
      mode: 'deck',
      taskKind: 'new-generation',
      useCase: {
        query:
          'Write a Demo Day pitch as a decision-grade fundraising deck. Confirm the essentials first, then produce the slide plan.',
      },
      inputs: [
        {
          name: 'one_line_pitch',
          label: 'Name + one-line pitch',
          type: 'text',
          required: true,
          placeholder: 'Company name and one sentence explaining what it does',
        },
        {
          name: 'key_traction_numbers',
          label: 'Key traction numbers',
          type: 'text',
          required: true,
          placeholder: 'Revenue, growth, users, pilots, retention, pipeline',
        },
        {
          name: 'ask_and_use_of_funds',
          label: 'Ask + use of funds',
          type: 'text',
          required: true,
          placeholder: 'Round size and how the capital will be used',
        },
      ],
    },
  },
};

// A second unfillable template, so "two Use in a row" swaps an unfillable bind
// for another unfillable bind.
const DESIGN_BRIEF = {
  ...PITCH_DECK,
  id: 'example-design-brief',
  title: 'Write a Design Brief like a Studio Principal',
  source: '/tmp/design-brief',
  fsPath: '/tmp/design-brief',
  manifest: {
    ...PITCH_DECK.manifest,
    name: 'example-design-brief',
    title: 'Write a Design Brief like a Studio Principal',
    description: 'A decision-grade design brief for studio engagements.',
    od: {
      ...PITCH_DECK.manifest.od,
      inputs: [
        {
          name: 'brief',
          label: 'Brief',
          type: 'text',
          required: true,
          placeholder: 'What is being designed and why',
        },
      ],
    },
  },
};

// Control: shaped after example-fs-electric-studio — required fields that all
// carry a `default`, so the gate is satisfied at bind time and Send was never
// blocked. Must keep working untouched.
const CONTROL_DECK = {
  ...BASE,
  id: 'example-fs-electric-studio',
  title: 'Write a B2B SaaS Sales Proposal like a Tier-1 Enterprise AE',
  source: '/tmp/electric-studio',
  fsPath: '/tmp/electric-studio',
  manifest: {
    name: 'example-fs-electric-studio',
    title: 'Write a B2B SaaS Sales Proposal like a Tier-1 Enterprise AE',
    version: '0.1.0',
    description: 'A decision-grade B2B sales deck.',
    od: {
      kind: 'scenario',
      mode: 'deck',
      taskKind: 'new-generation',
      useCase: { query: 'Write a B2B SaaS sales proposal as a decision-grade deck.' },
      inputs: [
        { name: 'deckType', type: 'text', required: true, default: 'studio / agency capabilities deck' },
        { name: 'topic', type: 'text', required: true, default: "the user's brief" },
        { name: 'audience', type: 'text', required: true, default: 'a general professional audience' },
      ],
    },
  },
};

// The gate must SURVIVE where the user can still act: this query carries a
// `{{topic}}` placeholder, so examplePresetSeedPrompt returns the rendered query
// and HomeView tracks its `queryTemplate` — editing the hydrated value in the
// composer writes back into `active.inputs`. Required-and-blank must keep
// blocking Send here.
const WRITE_BACK_PLUGIN = {
  ...BASE,
  id: 'write-back-plugin',
  title: 'Write Back Plugin',
  source: '/tmp/write-back',
  fsPath: '/tmp/write-back',
  manifest: {
    name: 'write-back-plugin',
    title: 'Write Back Plugin',
    version: '0.1.0',
    description: '',
    od: {
      kind: 'scenario',
      taskKind: 'new-generation',
      useCase: { query: 'Build a landing page about {{topic}}.' },
      inputs: [{ name: 'topic', type: 'text', required: true }],
    },
  },
};

// A tracked queryTemplate is NOT by itself an input surface. With no description
// the seed falls through to the rendered query, so HomeView tracks that query as
// the write-back template — but the query names no `{{...}}` placeholder, so
// editing the composer can never reach `brief`. This is also the shape a reload
// lands in: re-applying a plugin without an explicit queryTemplate derives one
// from the manifest (HomeView usePlugin), placeholders or not.
const NO_PLACEHOLDER_QUERY = {
  ...BASE,
  id: 'example-live-dashboard',
  title: 'Live Dashboard',
  source: '/tmp/live-dashboard',
  fsPath: '/tmp/live-dashboard',
  manifest: {
    name: 'example-live-dashboard',
    title: 'Live Dashboard',
    version: '0.1.0',
    description: '',
    od: {
      kind: 'scenario',
      taskKind: 'new-generation',
      useCase: { query: 'Build a live operations dashboard with a decision-grade layout.' },
      inputs: [
        { name: 'brief', label: 'Brief', type: 'text', required: true, placeholder: 'What to build' },
      ],
    },
  },
};

// The QA-reported third card. Its required `workspace_name` has no default and
// its prompt contains no placeholder that could write a value back.
const LIVE_DASHBOARD = {
  ...BASE,
  id: 'example-live-dashboard-workspace',
  title: 'Notion-style Team Dashboard',
  source: '/tmp/live-dashboard-workspace',
  fsPath: '/tmp/live-dashboard-workspace',
  manifest: {
    name: 'example-live-dashboard-workspace',
    title: 'Notion-style Team Dashboard',
    version: '0.1.0',
    description: 'Build a Notion-style team dashboard with live KPIs.',
    od: {
      kind: 'scenario',
      taskKind: 'new-generation',
      useCase: {
        query: 'Build a Notion-style team dashboard with live KPIs.',
      },
      inputs: [
        { name: 'workspace_name', type: 'string', required: true },
        { name: 'page_title', type: 'string', default: 'Team Dashboard' },
      ],
    },
  },
};

const ALL = [
  PITCH_DECK,
  DESIGN_BRIEF,
  CONTROL_DECK,
  WRITE_BACK_PLUGIN,
  NO_PLACEHOLDER_QUERY,
  LIVE_DASHBOARD,
];
const postedPluginInputs: Array<{ pluginId: string; inputs: Record<string, unknown> }> = [];

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

// Mirrors the daemon: apps/daemon/src/plugins/apply.ts validateInputs rejects a
// required field with neither a posted value nor a default.
function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const href = typeof url === 'string' ? url : String(url);
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      if (href === '/api/plugins') return json({ plugins: ALL });
      const applyMatch = /^\/api\/plugins\/([^/]+)\/(?:apply|apply-local)$/.exec(href);
      if (applyMatch) {
        const record = ALL.find((entry) => entry.id === decodeURIComponent(applyMatch[1]!));
        const posted = (JSON.parse(String(init?.body ?? '{}')) as { inputs?: Record<string, unknown> })
          .inputs ?? {};
        postedPluginInputs.push({
          pluginId: decodeURIComponent(applyMatch[1]!),
          inputs: posted,
        });
        const fields = record?.manifest.od.inputs ?? [];
        const missing = fields
          .filter((field) => field.required === true)
          .filter((field) => !hasValue(posted[field.name]) && !hasValue((field as { default?: unknown }).default))
          .map((field) => field.name);
        if (missing.length > 0) return json({ error: 'missing_inputs', fields: missing }, 400);
        return json({
          ok: true,
          snapshotId: `snap-${record?.id}`,
          appliedPlugin: { id: record?.id, title: record?.title, inputs: posted },
          inputs: fields,
          contextItems: [],
        });
      }
      return json({});
    }),
  );
}

function renderHome(handoffId: number, pluginId: string) {
  return render(
    <I18nProvider initial="en">
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
        promptHandoff={createPluginUseHandoff(handoffId, pluginId, { action: 'use-with-query' })}
      />
    </I18nProvider>,
  );
}

// The reported state was permanent ("等半天了都发送不了"), so every assertion
// below is taken after the bind has settled AND after a further quiet period —
// an early frame would prove nothing either way.
async function settle(ms = 400) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function boundSubmit() {
  const submit = (await screen.findByTestId('home-hero-submit')) as HTMLButtonElement;
  await waitFor(() => {
    expect(screen.getByTestId('home-hero-active-plugin')).toBeTruthy();
  });
  await settle();
  return submit;
}

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  window.localStorage.clear();
  workspaceContextForTest = null;
  postedPluginInputs.length = 0;
  reloadTeamProjects.mockReset();
});

describe('community template Use lands a sendable composer', () => {
  it('enables Send after Use on a template whose required inputs have no default', async () => {
    writeHomeGuideStage('done');
    stubFetch();

    renderHome(1, PITCH_DECK.id);
    const submit = await boundSubmit();

    // The brief really is in the composer, so the send has content.
    expect(screen.getByTestId('home-hero-active-plugin').textContent).toContain(
      'Write a Demo Day Pitch',
    );
    expect(submit.disabled).toBe(false);
    expect(submit.getAttribute('data-tooltip')).not.toBe('Type something to run');
    expect(submit.getAttribute('data-tooltip')).toBe('Run');
  });

  it('stays sendable across two Use clicks with different templates', async () => {
    writeHomeGuideStage('done');
    stubFetch();

    const view = renderHome(1, PITCH_DECK.id);
    await boundSubmit();

    view.rerender(
      <I18nProvider initial="en">
        <HomeView
          projects={[]}
          onSubmit={() => undefined}
          onOpenProject={() => undefined}
          onViewAllProjects={() => undefined}
          promptHandoff={createPluginUseHandoff(2, DESIGN_BRIEF.id, { action: 'use-with-query' })}
        />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('home-hero-active-plugin').textContent).toContain(
        'Write a Design Brief',
      );
    });
    await settle();
    const submit = screen.getByTestId('home-hero-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it('keeps the control template (required inputs with defaults) sendable', async () => {
    writeHomeGuideStage('done');
    stubFetch();

    renderHome(1, CONTROL_DECK.id);
    const submit = await boundSubmit();
    expect(submit.disabled).toBe(false);
  });

  it('enables Send when a template is tracked but names no fillable placeholder', async () => {
    writeHomeGuideStage('done');
    stubFetch();

    // A queryTemplate exists here, so "a template is tracked" is not enough to
    // call the required field fillable — the template must actually mention it.
    renderHome(1, NO_PLACEHOLDER_QUERY.id);
    const submit = await boundSubmit();
    expect(submit.disabled).toBe(false);
  });

  it('fills live-dashboard workspace_name from the active Workspace', async () => {
    writeHomeGuideStage('done');
    workspaceContextForTest = {
      workspaceId: 'ws-qa',
      workspaceType: 'team',
      workspaceMemberId: 'wm-qa',
      role: 'member',
      memberStatus: 'active',
      lifecycleState: 'active',
      billingState: 'active',
      planId: 'team',
      providerMode: 'platform_credits',
      seatSummary: {
        seatLimit: 10,
        usedSeats: 1,
        availableSeats: 9,
        isSeatFull: false,
      },
      permissions: {
        canInviteMembers: false,
        canManageMembers: false,
        canManageBilling: false,
        canManageAutoRecharge: false,
        canShareProjects: true,
        canWriteSyncedFiles: true,
        canViewWorkspaceSettings: true,
        canManageSharedResources: false,
      },
      workspaceName: 'QA Team',
    };
    stubFetch();

    renderHome(1, LIVE_DASHBOARD.id);
    const submit = await boundSubmit();
    expect(submit.disabled).toBe(false);

    fireEvent.click(submit);

    await waitFor(() => {
      expect(postedPluginInputs).toContainEqual({
        pluginId: LIVE_DASHBOARD.id,
        inputs: expect.objectContaining({
          workspace_name: 'QA Team',
          page_title: 'Team Dashboard',
        }),
      });
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('refreshes live-dashboard workspace_name after the tab switches Workspaces', async () => {
    writeHomeGuideStage('done');
    workspaceContextForTest = {
      workspaceId: 'ws-personal',
      workspaceType: 'personal',
      workspaceMemberId: 'wm-personal',
      role: 'owner',
      memberStatus: 'active',
      lifecycleState: 'active',
      billingState: 'active',
      planId: null,
      providerMode: 'platform_credits',
      seatSummary: {
        seatLimit: 1,
        usedSeats: 1,
        availableSeats: 0,
        isSeatFull: true,
      },
      permissions: {
        canInviteMembers: false,
        canManageMembers: true,
        canManageBilling: true,
        canManageAutoRecharge: true,
        canShareProjects: true,
        canWriteSyncedFiles: true,
        canViewWorkspaceSettings: true,
        canManageSharedResources: true,
      },
      workspaceName: 'Personal Workspace',
    };
    stubFetch();

    const submittedPluginInputs: Record<string, unknown>[] = [];
    const tree = () => (
      <I18nProvider initial="en">
        <HomeView
          projects={[]}
          onSubmit={(payload) => {
            submittedPluginInputs.push(payload.pluginInputs ?? {});
          }}
          onOpenProject={() => undefined}
          onViewAllProjects={() => undefined}
          promptHandoff={createPluginUseHandoff(1, LIVE_DASHBOARD.id, { action: 'use-with-query' })}
        />
      </I18nProvider>
    );
    const view = render(tree());
    const submit = await boundSubmit();

    workspaceContextForTest = {
      ...workspaceContextForTest,
      workspaceId: 'ws-team',
      workspaceType: 'team',
      workspaceMemberId: 'wm-team',
      workspaceName: 'Design Team',
    };
    view.rerender(tree());
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);

    await waitFor(() => {
      expect(submittedPluginInputs).toContainEqual(
        expect.objectContaining({ workspace_name: 'Design Team' }),
      );
    });
  });
});

describe('required-input gate survives where the user can still fill it', () => {
  it('keeps Send blocked while a write-back placeholder is required and blank', async () => {
    writeHomeGuideStage('done');
    stubFetch();

    renderHome(1, WRITE_BACK_PLUGIN.id);
    const submit = await boundSubmit();

    // This template's query carries {{topic}}, so HomeView tracks a
    // queryTemplate and editing the composer flows back into `inputs` — the
    // gate is actionable here and must stay.
    expect(submit.disabled).toBe(true);
  });
});

describe('daemon rejection is legible', () => {
  it('names the missing fields instead of a generic apply failure', async () => {
    writeHomeGuideStage('done');
    stubFetch();

    renderHome(1, PITCH_DECK.id);
    const submit = await boundSubmit();
    expect(submit.disabled).toBe(false);

    fireEvent.click(submit);

    const alert = await waitFor(() => screen.getByRole('alert'));
    expect(alert.textContent).toContain('Name + one-line pitch');
    expect(alert.textContent).toContain('Key traction numbers');
    expect(alert.textContent).toContain('Ask + use of funds');
    expect(alert.textContent).not.toContain('Failed to apply');
  });
});
