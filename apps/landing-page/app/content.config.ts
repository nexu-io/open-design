/*
 * Content collections — single source of truth for the multi-page
 * landing pages (`/skills/`, `/systems/`, `/craft/`, `/templates/`) plus
 * the blog routes under `/blog/`.
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

// Blog posts live in `app/content/blog/*.md`. Each post must declare a typed
// frontmatter block matching the schema below. The list page reads the
// collection via `getCollection('blog')` and the dynamic route renders each
// entry via `getEntry('blog', slug)`. Underscore-prefixed files (e.g.
// `_topics.md` — the topic backlog used by the blog-factory skill) are
// excluded from the loader so they never get parsed as posts.
const blog = defineCollection({
  loader: glob({
    pattern: ['*.md', '!_*.md'],
    base: './app/content/blog',
  }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    category: z.enum(['Product', 'Guides', 'Use cases', 'Community']),
    readingTime: z.number().int().positive(),
    summary: z.string(),
  }),
});

export const collections = { skills, systems, craft, templates, blog };
