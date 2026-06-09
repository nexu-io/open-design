// Plan §3.F5 / spec §8 — composable Plugins section.
//
// Bundles the Phase 2A primitives (InlinePluginsRail, ContextChipStrip,
// PluginInputsForm, the renderPluginBriefTemplate helper) into one
// reusable widget. NewProjectPanel and ChatComposer can drop this in
// with one line and treat the rest of the composer state as untouched.
//
// API contract:
//   - `onApplied(brief, applied)` fires every time the section's brief
//     output changes (plugin applied OR inputs edited). Hosts wire this
//     to whichever input they own (the project name field on Home, the
//     conversation input inside ChatComposer).
//   - `onCleared()` fires when the user removes a context chip,
//     clearing the active plugin.
//   - `onValidityChange(valid)` mirrors the inputs-form validity so the
//     host can disable Send while required inputs are missing.
//   - `showRail` controls whether the in-section InlinePluginsRail is
//     rendered. Defaults to true (NewProjectPanel keeps the wide rail).
//     ChatComposer passes `false` because plugins moved to the
//     composer's tools-menu and the @-mention picker — leaving the
//     section as a pure context-bar that hosts the active plugin chip.
//   - The forwarded ref exposes `applyById(pluginId)` so external entry
//     points (the tools-menu Plugins tab, the @-mention picker, future
//     keyboard shortcuts) can apply a plugin without re-implementing
//     the request lifecycle.

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useState,
} from 'react';
import type {
  ApplyResult,
  ContextItem,
  InstalledPluginRecord,
} from '@open-design/contracts';
import {
  applyPlugin,
  renderPluginBriefTemplate,
} from '../state/projects';
import { useI18n } from '../i18n';
import { ContextChipStrip } from './ContextChipStrip';
import { InlinePluginsRail } from './InlinePluginsRail';

interface Props {
  // Active project the apply will be scoped to. Omit on Home.
  projectId?: string | null;
  // Inline rail layout: 'wide' on Home, 'strip' inside ChatComposer.
  variant?: 'wide' | 'strip';
  // Filter the rail (Phase 2B). When unspecified the daemon-wide list
  // is shown. `kinds` whitelists `od.kind` values — used by the
  // ChatComposer mount to exclude bundled atoms from the in-project
  // strip (atoms are pipeline-side, not user-applicable). `pluginIds`
  // is a hard id whitelist — ChatComposer uses it when the project is
  // pinned to a single plugin so the rail collapses to that one card.
  filter?: {
    taskKind?: string;
    mode?: string;
    kinds?: string[];
    pluginIds?: string[];
  };
  // When false, the in-section rail is omitted. Hosts that source
  // plugins from another surface (ChatComposer's tools-menu / @-picker)
  // pass false so the section behaves as a pure context-bar.
  showRail?: boolean;
  // Optional hooks — see file header.
  onApplied?: (brief: string, applied: ApplyResult) => void;
  onCleared?: () => void;
  onValidityChange?: (valid: boolean) => void;
  // Forwarded to ContextChipStrip so chips can open the plugin details
  // modal when the user clicks one (kind === 'plugin').
  onChipDetails?: (item: ContextItem) => void;
  // When false, the applied-plugin chip is NOT rendered here — the host
  // (ChatComposer) renders it inside the shared staged-context row instead,
  // so the plugin chip sits inline with the design-system picker and file
  // chips rather than on its own line. The section still manages apply state
  // and exposes the imperative handle.
  renderActiveChip?: boolean;
}

export interface PluginsSectionHandle {
  // Imperatively apply a plugin by id. Mirrors what InlinePluginsRail
  // does on click but lets ChatComposer drive the apply from the
  // tools-menu Plugins tab and the @-mention popover. Resolves with
  // the ApplyResult on success or null on failure (matching applyPlugin).
  applyById: (pluginId: string, record?: InstalledPluginRecord | null) => Promise<ApplyResult | null>;
  // Imperatively clear the active plugin (drops the context chips +
  // inputs form, fires onCleared). Used by tools-menu's "Replace" /
  // "Clear" affordance and by chip remove paths that bypass the strip.
  clear: () => void;
  // Read the currently active plugin record (or null). Lets the
  // tools-menu reflect the active state without duplicating the
  // section's internal state.
  getActiveRecord: () => InstalledPluginRecord | null;
}

export const PluginsSection = forwardRef<PluginsSectionHandle, Props>(
  function PluginsSection(props, ref) {
    const { locale } = useI18n();
    const [applied, setApplied] = useState<ApplyResult | null>(null);
    const [activeRecord, setActiveRecord] = useState<InstalledPluginRecord | null>(null);

    const handleApplied = useCallback(
      (record: InstalledPluginRecord | null, result: ApplyResult) => {
        setActiveRecord(record);
        setApplied(result);
        // Seed inputs from their schema defaults. The inputs form is no longer
        // rendered in the composer, so these defaults are the values that ride
        // the brief — users no longer edit them inline.
        const initialInputs: Record<string, unknown> = {};
        for (const field of result.inputs ?? []) {
          if (field.default !== undefined) initialInputs[field.name] = field.default;
        }
        const brief = renderPluginBriefTemplate(result.query ?? '', initialInputs);
        props.onApplied?.(brief, result);
      },
      [props],
    );

    const clear = useCallback(() => {
      setApplied(null);
      setActiveRecord(null);
      props.onCleared?.();
    }, [props]);

    const onChipRemove = useCallback(
      (_item: ContextItem) => {
        clear();
      },
      [clear],
    );

    useImperativeHandle(
      ref,
      () => ({
        applyById: async (pluginId, record = null) => {
          const result = await applyPlugin(pluginId, {
            ...(props.projectId ? { projectId: props.projectId } : {}),
            locale,
          });
          if (!result) return null;
          handleApplied(record, result);
          return result;
        },
        clear,
        getActiveRecord: () => activeRecord,
      }),
      [props.projectId, locale, handleApplied, clear, activeRecord],
    );

    const showRail = props.showRail ?? true;
    const renderActiveChip = props.renderActiveChip ?? true;

    // Surface the applied plugin as a SINGLE context chip — like a file
    // context — never the per-category (design-system / asset / skill)
    // fan-out the plugin emits. The full plugin context still rides the
    // turn via `appliedPluginSnapshot` on the send path; we only drop the
    // noisy categorized DISPLAY here. The lone chip keeps its remove (×)
    // and click-to-inspect (PluginDetailsModal) affordances.
    const chipItems: ContextItem[] = (() => {
      if (!applied) return [];
      const recordId = activeRecord?.id;
      if (recordId) {
        return [
          {
            kind: 'plugin',
            id: recordId,
            label: activeRecord?.title ?? recordId,
          },
        ];
      }
      // Fallback when the record isn't resolved: show only the plugin
      // self-chip the snapshot emitted, still never the fan-out.
      const self = (applied.contextItems ?? []).find(
        (it) => it.kind === 'plugin',
      );
      return self ? [self] : [];
    })();

    // Host renders the chip elsewhere AND there's no rail to show: this mount
    // is a pure state/handle container, so render nothing (keeps it out of the
    // composer's flex column gap).
    if (!renderActiveChip && !showRail) return null;

    return (
      <div className="plugins-section" data-testid="plugins-section">
        {renderActiveChip && applied ? (
          <div className="plugins-section__active" data-active-plugin-id={activeRecord?.id}>
            <ContextChipStrip
              items={chipItems}
              onRemove={onChipRemove}
              {...(props.onChipDetails ? { onSelect: props.onChipDetails } : {})}
            />
            {/*
              The per-plugin inputs form (e.g. MODEL / ASPECT RATIO selects)
              is intentionally NOT rendered inside the composer: it cluttered
              the input area with a model-picker-looking panel on every applied
              plugin. Inputs fall back to their schema `default` values (seeded
              in handleApplied), so the brief still renders fully. When a plugin
              genuinely needs a user decision, that should surface as an
              AskUserQuestion card in the chat stream, not as composer chrome.
            */}
          </div>
        ) : null}
        {showRail ? (
          <InlinePluginsRail
            {...(props.projectId !== undefined ? { projectId: props.projectId } : {})}
            variant={props.variant ?? 'wide'}
            {...(props.filter ? { filter: props.filter } : {})}
            onApplied={(record, result) => handleApplied(record, result)}
          />
        ) : null}
      </div>
    );
  },
);
