import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const SIDECAR_URL = process.env.DESIGN_LAB_SIDECAR_URL ?? 'http://127.0.0.1:5174';
const TOKEN_PATH = `${homedir()}/.claude/state/design-lab/api-token`;

export interface DesignLabContext {
    client?: unknown;
    styleGuide?: string;
    brandStyleGuide?: string;
    scenarioOverride?: string;
    cases?: CaseSummary[];
    antiCases?: CaseSummary[];
    neverRules?: NeverRule[];
    retrievedFrom?: string[];
}

export interface CaseAspect {
    dimension?: string;
    verdict?: 'like' | 'dislike' | string;
    note?: string;
}

export interface CaseSummary {
    slug?: string;
    scenario?: string;
    quotes_from_user?: string[];
    aspects?: CaseAspect[];
    tags?: string[];
    tokens?: {
        palette?: unknown;
        fonts?: unknown;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export interface NeverRule {
    id?: string;
    rule?: string;
    detector?: {
        type?: string;
        pattern?: string;
        target?: string;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

function readDesignLabToken(): string | null {
    try {
        const token = readFileSync(TOKEN_PATH, 'utf8').trim();
        return token.length > 0 ? token : null;
    } catch {
        return null;
    }
}

async function fetchContextOnce(url: URL, token: string): Promise<Response> {
    return fetch(url, {
        headers: {
            'Accept': 'application/json',
            'X-Design-Lab-Token': token
        }
    });
}

export async function loadDesignLabContext(input: {
    client?: string;
    scenario?: string;
}): Promise<DesignLabContext | null> {
    const url = new URL('/api/context', SIDECAR_URL);
    if (input.client) url.searchParams.set('client', input.client);
    if (input.scenario) url.searchParams.set('scenario', input.scenario);

    let token = readDesignLabToken();
    if (!token) return null;

    try {
        let resp = await fetchContextOnce(url, token);

        if (resp.status === 401) {
            // Token rotated after sidecar cold spawn. Re-read once, then fail soft.
            token = readDesignLabToken();
            if (!token) return null;
            resp = await fetchContextOnce(url, token);
        }

        if (!resp.ok) return null;
        return await resp.json() as DesignLabContext;
    } catch {
        return null;
    }
}

function cleanText(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function cleanList(values: unknown): string[] {
    if (!Array.isArray(values)) return [];
    return values
        .map(cleanText)
        .filter((value): value is string => value !== null);
}

function compactTokenValue(value: unknown): string | null {
    if (Array.isArray(value)) {
        const compact = value
            .map((item) => typeof item === 'string' ? item.trim() : String(item))
            .filter((item) => item.length > 0)
            .join(', ');
        return compact.length > 0 ? compact : null;
    }

    if (typeof value === 'string') return cleanText(value);
    if (value && typeof value === 'object') return JSON.stringify(value);
    if (value === null || value === undefined) return null;
    return String(value);
}

function pushSection(sections: string[], title: string, lines: string[]): void {
    const body = lines.filter((line) => line.trim().length > 0);
    if (body.length === 0) return;
    sections.push([title, ...body].join('\n'));
}

function formatCase(
    item: CaseSummary,
    aspectVerdict: 'like' | 'dislike',
    tokenKeys: Array<keyof NonNullable<CaseSummary['tokens']>>
): string[] {
    const lines: string[] = [];
    const slug = cleanText(item.slug) ?? 'unnamed-reference';
    lines.push(`- ${slug}`);

    const tokens = item.tokens ?? {};
    const tokenLines = tokenKeys
        .map((key) => {
            const value = compactTokenValue(tokens[key]);
            return value ? `  - ${key}: ${value}` : null;
        })
        .filter((line): line is string => line !== null);
    lines.push(...tokenLines);

    for (const quote of cleanList(item.quotes_from_user)) {
        lines.push(`  - quote: ${quote}`);
    }

    const aspects = Array.isArray(item.aspects) ? item.aspects : [];
    for (const aspect of aspects) {
        if (aspect.verdict !== aspectVerdict) continue;
        const dimension = cleanText(aspect.dimension);
        const note = cleanText(aspect.note);
        if (!dimension || !note) continue;
        lines.push(`  - ${dimension}: ${note}`);
    }

    return lines.length > 1 ? lines : [];
}

export function framePrompt(basePrompt: string, context: DesignLabContext | null): string {
    if (!context) return basePrompt;

    const sections: string[] = [];
    const styleGuide = cleanText(context.styleGuide);
    const brandStyleGuide = cleanText(context.brandStyleGuide);
    pushSection(
        sections,
        '## Brand style guide (follow)',
        [styleGuide, brandStyleGuide].filter((value): value is string => value !== null)
    );

    const scenarioOverride = cleanText(context.scenarioOverride);
    pushSection(
        sections,
        '## Scenario override (takes precedence over the brand guide)',
        scenarioOverride ? [scenarioOverride] : []
    );

    const neverRules = Array.isArray(context.neverRules) ? context.neverRules : [];
    pushSection(
        sections,
        '## HARD CONSTRAINTS — NEVER violate',
        neverRules.flatMap((rule) => {
            const id = cleanText(rule.id);
            const ruleText = cleanText(rule.rule);
            if (!id || !ruleText) return [];
            const pattern = cleanText(rule.detector?.pattern);
            return pattern
                ? [`- ${id}: ${ruleText} (detector: ${pattern})`]
                : [`- ${id}: ${ruleText}`];
        })
    );

    const cases = Array.isArray(context.cases) ? context.cases : [];
    pushSection(
        sections,
        '## Liked references — emulate these',
        cases.flatMap((item) => formatCase(item, 'like', ['palette', 'fonts']))
    );

    const antiCases = Array.isArray(context.antiCases) ? context.antiCases : [];
    pushSection(
        sections,
        '## Avoid — anti-patterns',
        antiCases.flatMap((item) => formatCase(item, 'dislike', []))
    );

    if (sections.length === 0) return basePrompt;

    return [
        basePrompt,
        '',
        ...sections.flatMap((section) => [section, '']),
        'Apply the brand guide + scenario override; emulate liked references; never violate the hard constraints.'
    ].join('\n').trimEnd();
}

export async function buildGenerationPrompt(basePrompt: string, input: {
    client?: string;
    scenario?: string;
}): Promise<string> {
    const context = await loadDesignLabContext(input);
    return framePrompt(basePrompt, context);
}
