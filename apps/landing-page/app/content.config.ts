/*
 * Content collections — single source of truth for the multi-page
 * landing pages (`/skills/`, `/systems/`, `/craft/`, `/templates/`).
 *
 * We do NOT mirror content into `apps/landing-page/`; instead we glob
 * the canonical Markdown bundles in the repo root (`skills/`,
 * `design-systems/`, `craft/`, `templates/`). When a contributor adds
 * a `SKILL.md` or `DESIGN.md`, it shows up on the next build with
 * zero sync step.
 *
 * Schema validation is intentionally loose because the upstream
 * repos (especially `guizang-ppt` bundled verbatim) use slightly
 * different `od:` keys. Anything we don't model is preserved on the
 * raw frontmatter and ignored by our pages.
 */

import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const skillSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    triggers: z.array(z.string()).optional(),
    od: z
      .object({
        mode: z.string().optional(),
        platform: z.string().optional(),
        scenario: z.string().optional(),
        category: z.string().optional(),
        featured: z.number().optional(),
        upstream: z.string().optional(),
        default_for: z.string().optional(),
        example_prompt: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const skills = defineCollection({
  loader: glob({
    base: '../../skills',
    pattern: '*/SKILL.md',
  }),
  schema: skillSchema,
});

// `design-systems/<slug>/DESIGN.md` files use plain Markdown without YAML
// frontmatter. We treat them as untyped Markdown bundles and parse the
// human-meaningful fields (H1, `> Category:`, palette hex codes) at
// page-render time.
const systems = defineCollection({
  loader: glob({
    base: '../../design-systems',
    pattern: '*/DESIGN.md',
  }),
  schema: z.object({}).passthrough(),
});

const craft = defineCollection({
  loader: glob({
    base: '../../craft',
    pattern: '*.md',
  }),
  schema: z.object({}).passthrough(),
});

// `templates/live-artifacts/<slug>/README.md` — Live Artifact bundles.
// We surface them under `/templates/` together with skills whose `od.mode`
// is `template` (filtered at render time, not in the schema).
const templates = defineCollection({
  loader: glob({
    base: '../../templates/live-artifacts',
    pattern: '*/README.md',
  }),
  schema: z.object({}).passthrough(),
});

export const collections = { skills, systems, craft, templates };
