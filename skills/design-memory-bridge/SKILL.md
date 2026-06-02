---
name: design-memory-bridge
description: |
  Pre-flight context loader that fetches design-lab memory from the
  local sidecar before generating UI, visual systems, product pages,
  dashboards, or design assets. Falls back silently to no-memory
  generation when the sidecar or token is unavailable.
---

# design-memory-bridge

Use this skill when generating UI, visual systems, product pages, dashboards, or design assets where design-lab memory can improve taste alignment.

## Design-lab bridge

Before generation, try to load design-lab context from the local sidecar:

1. Read token from `$HOME/.claude/state/design-lab/api-token`.
2. Call `GET http://127.0.0.1:5174/api/context?client=<client>&scenario=<scenario>` with `X-Design-Lab-Token`.
3. If the response is `401`, re-read the token once and retry once.
4. If token read fails, fetch throws, response is non-2xx, or retry also fails, continue with no-memory generation.
5. Never ask the user for the token and never print the token.

Recommended helper path: `lib/design-lab-context.ts` (relative to this skill).

```typescript
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const SIDECAR_URL = process.env.DESIGN_LAB_SIDECAR_URL ?? 'http://127.0.0.1:5174';
const TOKEN_PATH = `${homedir()}/.claude/state/design-lab/api-token`;

interface CaseSummary {
    slug?: string;
    quotes_from_user?: string[];
    aspects?: Array<{
        dimension?: string;
        verdict?: 'like' | 'dislike' | string;
        note?: string;
    }>;
    tokens?: {
        palette?: unknown;
        fonts?: unknown;
        [key: string]: unknown;
    };
}

interface NeverRule {
    id?: string;
    rule?: string;
    detector?: {
        pattern?: string;
        [key: string]: unknown;
    };
}

interface DesignLabContext {
    client?: unknown;
    styleGuide?: string;
    brandStyleGuide?: string;
    scenarioOverride?: string;
    cases?: CaseSummary[];
    antiCases?: CaseSummary[];
    neverRules?: NeverRule[];
    retrievedFrom?: string[];
}

function readToken(): string | null {
    try {
        const token = readFileSync(TOKEN_PATH, 'utf8').trim();
        return token || null;
    } catch {
        return null;
    }
}

async function requestContext(url: URL, token: string): Promise<Response> {
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

    let token = readToken();
    if (!token) return null;

    try {
        let response = await requestContext(url, token);
        if (response.status === 401) {
            token = readToken();
            if (!token) return null;
            response = await requestContext(url, token);
        }

        if (!response.ok) return null;
        return await response.json() as DesignLabContext;
    } catch {
        return null;
    }
}

export function framePrompt(basePrompt: string, context: DesignLabContext | null): string {
    if (!context) return basePrompt;

    const sections: string[] = [];

    // styleGuide / brandStyleGuide are follow/system guidance.
    // scenarioOverride takes precedence over the brand guide.
    // neverRules are HARD NEVER constraints.
    // cases are liked references to emulate.
    // antiCases are disliked references to avoid.
    // Build semantic sections from trimmed strings and omit empty sections.

    return sections.length > 0
        ? [
            basePrompt,
            '',
            ...sections,
            '',
            'Apply the brand guide + scenario override; emulate liked references; never violate the hard constraints.'
        ].join('\n')
        : basePrompt;
}
```

Bridge contract:

- `styleGuide` and `brandStyleGuide` → `## Brand style guide (follow)`.
- `scenarioOverride` → `## Scenario override (takes precedence over the brand guide)`.
- `neverRules` → `## HARD CONSTRAINTS — NEVER violate`; include rule id, rule text, and detector pattern when present.
- `cases` → `## Liked references — emulate these`; include slug, compact `tokens.palette` / `tokens.fonts`, user quotes, and liked aspects.
- `antiCases` → `## Avoid — anti-patterns`; include slug, user quotes, and disliked aspects.
- Never pass raw `/api/context` JSON into the generation prompt. The bridge frames context semantically so the model follows the brand guide, emulates liked references, and hard-avoids NEVER rules.

Generation flow:

```text
memory = await loadDesignLabContext({ client, scenario })
if memory:
    prompt = framePrompt(basePrompt, memory)
else:
    prompt = basePrompt
```

## Failure modes (fail-soft)

| Condition | Behavior |
|---|---|
| Token file missing / unreadable | Return `null`, generate without memory |
| Sidecar not running / fetch throws | Return `null`, generate without memory |
| HTTP 401 | Re-read token once, retry once. Still 401 → `null` |
| HTTP 4xx/5xx (non-401) | Return `null`, generate without memory |
| JSON parse error | Return `null`, generate without memory |

The bridge **must never** block, retry indefinitely, ask the user for the token, or print the token. Sidecar lifecycle (start/stop/rotate token) is owned by design-lab's `ensure-sidecar.sh`; this skill is read-only.
