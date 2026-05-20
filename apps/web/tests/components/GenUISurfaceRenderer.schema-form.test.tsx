// @vitest-environment jsdom

// Plan §6 Phase 2A.5 — JSON Schema → React form bridge.
//
// These tests pin the renderer's behavior for the strict schema
// subset we ship: top-level `properties` whose leaves are scalars or
// single-level enums. Anything that strays should fall back to the
// JSON textarea so a power user can still answer it. We assert on
// rendered controls + on the value shape that lands in `onAnswered`.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GenUISurfaceSpec } from '@open-design/contracts';

import { GenUISurfaceRenderer } from '../../src/components/GenUISurfaceRenderer';

afterEach(cleanup);

function surface(partial: Partial<GenUISurfaceSpec> & Pick<GenUISurfaceSpec, 'id' | 'kind'>): GenUISurfaceSpec {
  return {
    persist: 'run',
    ...partial,
  } as GenUISurfaceSpec;
}

describe('GenUISurfaceRenderer — Phase 2A.5 form/choice schema bridge', () => {
  it('renders a structured form for a string + select + integer + boolean schema', async () => {
    const onAnswered = vi.fn().mockResolvedValue(undefined);
    render(
      <GenUISurfaceRenderer
        pending={{
          surface: surface({
            id: 'discovery',
            kind: 'form',
            prompt: 'Tell me about the brief',
            schema: {
              type: 'object',
              required: ['topic', 'audience'],
              properties: {
                topic: { type: 'string', title: 'Topic' },
                audience: { type: 'string', enum: ['VC pitch', 'general'] },
                slides: { type: 'integer', title: 'Slide count', minimum: 1, maximum: 20 },
                dark: { type: 'boolean', title: 'Dark mode' },
              },
            },
          }),
          runId: 'run-1',
        }}
        onAnswered={onAnswered}
      />,
    );

    // Inputs render with the right control kind.
    const topic = screen.getByTestId('genui-field-control-topic') as HTMLInputElement;
    expect(topic.tagName).toBe('INPUT');
    expect(topic.type).toBe('text');
    const audience = screen.getByTestId('genui-field-control-audience') as HTMLSelectElement;
    expect(audience.tagName).toBe('SELECT');
    expect(audience.value).toBe('VC pitch');
    const slides = screen.getByTestId('genui-field-control-slides') as HTMLInputElement;
    expect(slides.type).toBe('number');
    expect(slides.step).toBe('1');
    const dark = screen.getByTestId('genui-field-control-dark') as HTMLInputElement;
    expect(dark.type).toBe('checkbox');

    // Local validation: required string missing → form should not submit.
    fireEvent.click(screen.getByTestId('genui-form-submit'));
    expect(onAnswered).not.toHaveBeenCalled();
    expect(screen.getByText(/Topic is required/i)).toBeTruthy();

    // Fill in and submit; onAnswered receives the right shape.
    fireEvent.change(topic, { target: { value: 'plugin demo' } });
    fireEvent.change(audience, { target: { value: 'general' } });
    fireEvent.change(slides, { target: { value: '5' } });
    fireEvent.click(dark);
    fireEvent.click(screen.getByTestId('genui-form-submit'));

    expect(onAnswered).toHaveBeenCalledTimes(1);
    expect(onAnswered.mock.calls[0]![0]).toEqual({
      topic: 'plugin demo',
      audience: 'general',
      slides: 5,
      dark: true,
    });
  });

  it('seeds defaultValue into the form so re-asks prefill', () => {
    render(
      <GenUISurfaceRenderer
        pending={{
          surface: surface({
            id: 'tone',
            kind: 'form',
            schema: {
              type: 'object',
              required: ['tone'],
              properties: {
                tone: { type: 'string', enum: ['warm', 'cool'] },
                notes: { type: 'string' },
              },
            },
          }),
          runId: 'run-2',
          defaultValue: { tone: 'cool', notes: 'keep it tight' },
        }}
        onAnswered={vi.fn()}
      />,
    );
    expect((screen.getByTestId('genui-field-control-tone') as HTMLSelectElement).value).toBe('cool');
    expect((screen.getByTestId('genui-field-control-notes') as HTMLInputElement).value).toBe('keep it tight');
  });

  it('renders a single-enum choice through the existing button-group renderer (no schema-form for choice with one enum)', async () => {
    // Single-enum schemas already get the `GenericChoiceSurface`
    // rendering via the kind === 'choice' branch above the schema
    // bridge — the buttons are the canonical UI for choices. This
    // test makes sure the ordering didn't regress.
    const onAnswered = vi.fn().mockResolvedValue(undefined);
    render(
      <GenUISurfaceRenderer
        pending={{
          surface: surface({
            id: 'direction',
            kind: 'choice',
            prompt: 'Pick a direction',
            schema: {
              type: 'object',
              required: ['decision'],
              properties: {
                decision: { type: 'string', enum: ['warm', 'cool', 'neutral'] },
              },
            },
          }),
          runId: 'run-3',
        }}
        onAnswered={onAnswered}
      />,
    );

    fireEvent.click(screen.getByTestId('genui-choice-cool'));
    expect(onAnswered).toHaveBeenCalledWith({ decision: 'cool' });
  });

  it('falls back to the JSON textarea when the schema has unsupported leaves (object/array)', () => {
    render(
      <GenUISurfaceRenderer
        pending={{
          surface: surface({
            id: 'nested',
            kind: 'form',
            schema: {
              type: 'object',
              properties: {
                meta: { type: 'object', properties: { x: { type: 'string' } } },
              },
            },
          }),
          runId: 'run-4',
        }}
        onAnswered={vi.fn()}
      />,
    );
    // No structured field inputs were emitted.
    expect(screen.queryByTestId('genui-field-control-meta')).toBeNull();
    // The free-form JSON textarea is the visible surface instead.
    expect(screen.getByTestId('genui-form-textarea')).toBeTruthy();
  });
});
