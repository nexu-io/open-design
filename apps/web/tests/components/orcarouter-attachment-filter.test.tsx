// @vitest-environment jsdom

/**
 * Attachment-aware model narrowing, asserted against the OPTIONS the selector
 * actually receives.
 *
 * The spec is explicit that a send-time guard is not the requirement: when an
 * image is staged, the list handed to the model selector must itself contain
 * only chat models that declare an image input, and a now-incompatible
 * selection must be cleared. These tests drive the real components and read the
 * rendered option list, so a regression that keeps drawing the wrong models
 * fails here rather than at the first rejected request.
 */

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  filterOptionsForModalities,
  mergeProviderModelOptions,
  resetProviderModelsDiscovery,
  resolveProviderModelOptions,
  setProviderModelsDiscovery,
} from '../../src/components/providerModelsCache';
import {
  modalitiesForFiles,
  resetStagedModalities,
  setStagedModalities,
  useStagedModalities,
} from '../../src/state/stagedAttachments';
import type { ApiProtocol, ProviderModelOption } from '../../src/types';
import { SelectorProbe } from '../../src/components/OrcaRouterModelPicker';

/** A live-catalogue-shaped option carrying the modality evidence. */
function option(id: string, inputModalities?: string[]): ProviderModelOption {
  return {
    id,
    label: id,
    ...(inputModalities ? { metadata: { inputModalities } } : {}),
  };
}

describe('modalitiesForFiles', () => {
  it('maps staged MIME types onto the modalities that constrain model choice', () => {
    expect(modalitiesForFiles([])).toEqual([]);
    expect(modalitiesForFiles([{ type: 'image/png' }])).toEqual(['image']);
    expect(modalitiesForFiles([{ type: 'image/png' }, { type: 'image/jpeg' }]))
      .toEqual(['image']);
    expect(modalitiesForFiles([{ type: 'image/png' }, { type: 'audio/mpeg' }]))
      .toEqual(['image', 'audio']);
    expect(modalitiesForFiles([{ type: 'video/mp4' }])).toEqual(['video']);
  });

  it('ignores file types that ride the ordinary text path', () => {
    // A PDF or a source file is not a model-capability constraint.
    expect(modalitiesForFiles([{ type: 'application/pdf' }])).toEqual([]);
    expect(modalitiesForFiles([{ type: 'text/plain' }])).toEqual([]);
    expect(modalitiesForFiles([{ type: undefined }])).toEqual([]);
  });
});

describe('filterOptionsForModalities', () => {
  const MODELS: ProviderModelOption[] = [
    option('openai/gpt-5.5', ['text', 'image', 'file']),
    option('deepseek/deepseek-v4-pro', ['text']),
    option('google/gemini-3.5-flash', ['text', 'image', 'video', 'audio']),
    // A row that published no modality evidence at all.
    option('orcarouter/auto'),
  ];

  it('leaves the list untouched when nothing is staged', () => {
    expect(filterOptionsForModalities(MODELS, 'orcarouter', []))
      .toEqual(MODELS);
  });

  it('keeps only models that explicitly declare an image input', () => {
    const filtered = filterOptionsForModalities(MODELS, 'orcarouter', ['image']);
    expect(filtered.map((m) => m.id)).toEqual([
      'openai/gpt-5.5',
      'google/gemini-3.5-flash',
    ]);
    // Fail closed: the text-only model and the undeclared one are both out.
    expect(filtered.map((m) => m.id)).not.toContain('deepseek/deepseek-v4-pro');
    expect(filtered.map((m) => m.id)).not.toContain('orcarouter/auto');
  });

  it('narrows further for audio and video, never widening', () => {
    expect(filterOptionsForModalities(MODELS, 'orcarouter', ['image', 'video'])
      .map((m) => m.id)).toEqual(['google/gemini-3.5-flash']);
    expect(filterOptionsForModalities(MODELS, 'orcarouter', ['audio'])
      .map((m) => m.id)).toEqual(['google/gemini-3.5-flash']);
  });

  it('is a no-op for providers that publish no modality evidence', () => {
    // Unknown capability must not be read as "unsupported" — every other
    // provider's list would otherwise empty out the moment a user attached a
    // screenshot.
    for (const protocol of ['openai', 'anthropic', 'aihubmix'] as ApiProtocol[]) {
      expect(filterOptionsForModalities(MODELS, protocol, ['image'])).toEqual(MODELS);
    }
  });

  it('treats a model whose metadata has no modality list as unknown', () => {
    const withEmptyMetadata: ProviderModelOption[] = [
      { id: 'x/one', label: 'x/one', metadata: { contextWindowTokens: 100 } },
    ];
    expect(filterOptionsForModalities(withEmptyMetadata, 'orcarouter', ['image']))
      .toEqual([]);
  });

  it('applies on top of the merged live-plus-seed list the pickers build', () => {
    // The seed list is only a fallback, but it is the list a first-run user
    // sees, and it must obey the same rule.
    const merged = mergeProviderModelOptions(
      [option('openai/gpt-5.5', ['text', 'image', 'file'])],
      ['deepseek/deepseek-v4-pro'],
    );
    // The seed entry carries no modality metadata, so an image attachment
    // excludes it rather than guessing.
    expect(filterOptionsForModalities(merged, 'orcarouter', ['image'])
      .map((m) => m.id)).toEqual(['openai/gpt-5.5']);
  });
});

function ModalityProbe({ onChange }: { onChange: (modalities: readonly string[]) => void }) {
  const modalities = useStagedModalities();
  useEffect(() => { onChange(modalities); });
  return null;
}

describe('staged modality store', () => {
  afterEach(() => {
    resetStagedModalities();
  });

  it('notifies subscribers only when the modality set actually changes', () => {
    const seen: Array<readonly string[]> = [];
    render(
      <ModalityProbe onChange={(modalities) => { seen.push([...modalities]); }} />,
    );
    act(() => setStagedModalities(['image']));
    act(() => setStagedModalities(['image']));
    act(() => setStagedModalities(['image', 'audio']));
    cleanup();
    // The duplicate publish produced no extra render.
    expect(seen).toEqual([[], ['image'], ['image', 'audio']]);
  });
});

const CATALOGUE: ProviderModelOption[] = [
  option('openai/gpt-5.5', ['text', 'image', 'file']),
  option('deepseek/deepseek-v4-pro', ['text']),
  option('google/gemini-3.5-flash', ['text', 'image', 'video', 'audio']),
  option('orcarouter/auto'),
];

/** The probe wired to the live-catalogue fixture the daemon would return. */
function probe(props: { selected?: string; onModelChange?: (m: string) => void }) {
  return (
    <SelectorProbe
      protocol="orcarouter"
      fetchedModels={CATALOGUE}
      selected={props.selected ?? ''}
      {...(props.onModelChange ? { onModelChange: props.onModelChange } : {})}
    />
  );
}

describe('model selector options under an attachment', () => {
  afterEach(() => {
    cleanup();
    resetStagedModalities();
  });

  it('offers only image-capable chat models once an image is staged', async () => {
    // The component reads the shared store, so staging an image before render
    // is exactly the sequence the composer produces.
    setStagedModalities(['image']);
    render(probe({}));

    await waitFor(() => {
      expect(screen.getByTestId('option-ids').textContent).toBe(
        'openai/gpt-5.5,google/gemini-3.5-flash',
      );
    });
  });

  it('lists every chat model when nothing is staged', async () => {
    render(probe({}));
    await waitFor(() => {
      expect(screen.getByTestId('option-ids').textContent).toBe(
        'openai/gpt-5.5,deepseek/deepseek-v4-pro,google/gemini-3.5-flash,orcarouter/auto',
      );
    });
  });

  it('recomputes when an attachment is added to a mounted picker', async () => {
    render(probe({}));
    await waitFor(() => {
      expect(screen.getByTestId('option-ids').textContent).toContain('deepseek/deepseek-v4-pro');
    });

    // The user attaches a screenshot after the picker is already open.
    act(() => setStagedModalities(['image']));
    await waitFor(() => {
      expect(screen.getByTestId('option-ids').textContent).toBe(
        'openai/gpt-5.5,google/gemini-3.5-flash',
      );
    });
  });

  it('clears a selection the staged attachments invalidated', async () => {
    const onModelChange = vi.fn();
    render(probe({ selected: 'deepseek/deepseek-v4-pro', onModelChange }));
    await waitFor(() => {
      expect(screen.getByTestId('option-ids').textContent).toContain('deepseek/deepseek-v4-pro');
    });

    // Adding an image must not leave the text-only model silently selected.
    act(() => setStagedModalities(['image']));
    await waitFor(() => {
      expect(onModelChange).toHaveBeenCalledWith('');
    });
  });

  it('clears the selection when NO offered model can accept the attachment', async () => {
    // The options.length guard kept the current model precisely in the case
    // that most needs it cleared: a catalogue where attachment filtering
    // removes every row. A text-only account with an audio attachment retains
    // its selected text model even though nothing on offer can receive audio.
    const textOnlyCatalogue: ProviderModelOption[] = [
      option('deepseek/deepseek-v4-pro', ['text']),
      option('openai/gpt-5.5-no-audio', ['text', 'image']),
    ];
    const onModelChange = vi.fn();
    render(
      <SelectorProbe
        protocol="orcarouter"
        fetchedModels={textOnlyCatalogue}
        selected="deepseek/deepseek-v4-pro"
        onModelChange={onModelChange}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('option-ids').textContent).toContain('deepseek/deepseek-v4-pro');
    });

    act(() => setStagedModalities(['audio']));
    await waitFor(() => {
      // The filtered list is genuinely empty…
      expect(screen.getByTestId('option-ids').textContent).toBe('');
      // …and the incompatible selection does not survive it.
      expect(onModelChange).toHaveBeenCalledWith('');
    });
  });

  it('does not clear a selection while discovery is still in flight', async () => {
    // An empty filtered list means two opposite things. While discovery is
    // loading it is "not yet"; treating that as "nothing qualifies" would wipe
    // the user's model on every mount.
    const onModelChange = vi.fn();
    render(
      <SelectorProbe
        protocol="orcarouter"
        fetchedModels={[]}
        discoveryKey="orcarouter"
        selected="openai/gpt-5.5"
        onModelChange={onModelChange}
      />,
    );
    act(() => {
      setProviderModelsDiscovery('orcarouter', 'loading');
      setStagedModalities(['image']);
    });
    await act(async () => { await Promise.resolve(); });
    expect(onModelChange).not.toHaveBeenCalled();
  });

  it('clears once discovery settles with nothing modality-compatible', async () => {
    const onModelChange = vi.fn();
    render(
      <SelectorProbe
        protocol="orcarouter"
        fetchedModels={[option('deepseek/deepseek-v4-pro', ['text'])]}
        discoveryKey="orcarouter-settled"
        selected="deepseek/deepseek-v4-pro"
        onModelChange={onModelChange}
      />,
    );
    act(() => {
      setProviderModelsDiscovery('orcarouter-settled', 'ready');
      setStagedModalities(['image']);
    });
    await waitFor(() => {
      expect(onModelChange).toHaveBeenCalledWith('');
    });
  });
});

describe('selection provenance', () => {
  afterEach(() => {
    cleanup();
    resetStagedModalities();
  });

  it('does not discard a custom selection made under another protocol', async () => {
    // The effect is invoked for EVERY API protocol, although only OrcaRouter's
    // options are narrowed. With an OpenAI-compatible custom model that is
    // absent from the suggested/catalogue rows, staging an image used to call
    // onModelChange('') and throw away the user's explicit choice.
    const onModelChange = vi.fn();
    render(
      <SelectorProbe
        protocol="openai"
        fetchedModels={[option('gpt-5.5', ['text', 'image'])]}
        suggestedModelIds={['gpt-5.5']}
        selected="my-custom-vllm-model"
        onModelChange={onModelChange}
      />,
    );
    act(() => setStagedModalities(['image']));
    await act(async () => { await Promise.resolve(); });
    expect(onModelChange).not.toHaveBeenCalled();
  });
});

describe('live catalogue authority', () => {
  afterEach(() => {
    resetStagedModalities();
    resetProviderModelsDiscovery();
  });

  it('uses a successful live catalogue alone, seed never merged in', () => {
    // A restricted account that can call one model must offer that one model —
    // not that model plus five unrelated seeds.
    const options = resolveProviderModelOptions({
      protocol: 'orcarouter',
      discovery: 'ready',
      fetchedModels: [option('orcarouter/only-model', ['text', 'image'])],
      suggestedModelIds: [
        'openai/gpt-5.5',
        'anthropic/claude-opus-4.8',
        'google/gemini-3.5-flash',
        'deepseek/deepseek-v4-pro',
        'orcarouter/auto',
      ],
    });
    expect(options.map((m) => m.id)).toEqual(['orcarouter/only-model']);
  });

  it('treats a successful EMPTY catalogue as the answer, not as a fallback trigger', () => {
    const options = resolveProviderModelOptions({
      protocol: 'orcarouter',
      discovery: 'ready',
      fetchedModels: [],
      suggestedModelIds: ['openai/gpt-5.5'],
    });
    expect(options).toEqual([]);
  });

  it('falls back to the metadata-preserving seed only when discovery degraded', () => {
    const seed = [option('openai/gpt-5.5', ['text', 'image', 'file'])];
    const options = resolveProviderModelOptions({
      protocol: 'orcarouter',
      discovery: 'degraded',
      fetchedModels: [],
      seedOptions: seed,
      suggestedModelIds: ['openai/gpt-5.5'],
    });
    expect(options).toEqual(seed);
    // The metadata survives, so an image attachment still narrows correctly:
    // plain suggested ids would all disappear instead.
    expect(filterOptionsForModalities(options, 'orcarouter', ['image']))
      .toEqual(seed);
  });

  it('keeps the degraded seed usable under an attachment instead of emptying the list', () => {
    // postOrcaRouterModels drops the metadata-rich fallback on failure, so the
    // seed ids arrive with no metadata and every one of them disappears under
    // attachment filtering. The metadata-preserving seed is what prevents that.
    const plainSeedIds = ['openai/gpt-5.5', 'anthropic/claude-opus-4.8'];
    const withoutMetadata = resolveProviderModelOptions({
      protocol: 'orcarouter',
      discovery: 'degraded',
      fetchedModels: [],
      suggestedModelIds: plainSeedIds,
    });
    expect(filterOptionsForModalities(withoutMetadata, 'orcarouter', ['image']))
      .toEqual([]);
  });
});
