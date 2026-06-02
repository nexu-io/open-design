import assert from 'node:assert/strict';
import test from 'node:test';

import { framePrompt, type DesignLabContext } from './design-lab-context.ts';

const fullContext: DesignLabContext = {
    client: { slug: 'acme' },
    styleGuide: 'Use restrained surfaces and crisp hierarchy.',
    brandStyleGuide: 'Prefer editorial spacing over dense card walls.',
    scenarioOverride: 'For dashboards, keep data controls compact.',
    neverRules: [
        {
            id: 'no-x',
            rule: 'no neon',
            detector: {
                type: 'color',
                pattern: '#0f0',
                target: 'palette'
            }
        }
    ],
    cases: [
        {
            slug: 'calm-dashboard',
            scenario: 'dashboard',
            quotes_from_user: ['This feels focused.'],
            aspects: [
                {
                    dimension: 'palette',
                    verdict: 'like',
                    note: 'muted contrast with a single accent'
                },
                {
                    dimension: 'density',
                    verdict: 'dislike',
                    note: 'too sparse for operators'
                }
            ],
            tags: ['dashboard'],
            tokens: {
                palette: ['#101820', '#f5f7f8'],
                fonts: ['Inter', 'Newsreader']
            }
        }
    ],
    antiCases: [
        {
            slug: 'neon-wall',
            scenario: 'dashboard',
            quotes_from_user: ['This is too loud.'],
            aspects: [
                {
                    dimension: 'palette',
                    verdict: 'dislike',
                    note: 'neon green overwhelms the content'
                }
            ],
            tags: ['anti-pattern'],
            tokens: {
                palette: ['#0f0']
            }
        }
    ],
    retrievedFrom: ['design-lab']
};

test('framePrompt adds semantic design-lab sections without raw JSON framing', () => {
    const prompt = framePrompt('BASE', fullContext);

    assert.match(prompt, /BASE/);
    assert.match(prompt, /## HARD CONSTRAINTS/);
    assert.match(prompt, /no-x/);
    assert.match(prompt, /#0f0/);
    assert.match(prompt, /## Liked references/);
    assert.match(prompt, /calm-dashboard/);
    assert.doesNotMatch(prompt, /\{\s*"styleGuide":/);
});

test('framePrompt returns the base prompt when context is missing or empty', () => {
    assert.equal(framePrompt('BASE', null), 'BASE');
    assert.equal(framePrompt('BASE', {}), 'BASE');
});

test('framePrompt omits missing sections while keeping available semantic sections', () => {
    const prompt = framePrompt('BASE', {
        styleGuide: 'Follow the brand guide.',
        cases: [
            {
                slug: 'quiet-editor',
                aspects: [
                    {
                        dimension: 'spacing',
                        verdict: 'like',
                        note: 'comfortable rhythm'
                    }
                ]
            }
        ]
    });

    assert.match(prompt, /## Brand style guide/);
    assert.match(prompt, /## Liked references/);
    assert.match(prompt, /quiet-editor/);
    assert.doesNotMatch(prompt, /## Avoid/);
});
