/*
 * Content collections — single source of truth for the multi-page
 * landing pages (`/skills/`, `/systems/`, `/craft/`, `/templates/`) plus
 * the blog routes under `/blog/`.
 */

import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const localizedContentSchema = z
  .record(
    z.string(),
    z
      .object({
        name: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        summary: z.string().optional(),
        category: z.string().optional(),
        tagline: z.string().optional(),
        atmosphere: z.string().optional(),
        body: z.string().optional(),
        bodyHtml: z.string().optional(),
        triggers: z.array(z.string()).optional(),
        examplePrompt: z.string().optional(),
        example_prompt: z.string().optional(),
      })
      .passthrough(),
  )
  .optional();

const skillSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    triggers: z.array(z.string()).optional(),
    i18n: localizedContentSchema,
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

const designTemplates = defineCollection({
  loader: glob({
    base: '../../design-templates',
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
  schema: z.object({ i18n: localizedContentSchema }).passthrough(),
});

const craft = defineCollection({
  loader: glob({
    base: '../../craft',
    pattern: '*.md',
  }),
  schema: z.object({ i18n: localizedContentSchema }).passthrough(),
});

// `templates/live-artifacts/<slug>/README.md` — legacy Live Artifact bundles.
// The public `/templates/` catalog is primarily sourced from
// `design-templates/*/SKILL.md`; these remain available as compatibility
// records while older live-artifact bundles still exist in the repo.
const templates = defineCollection({
  loader: glob({
    base: '../../templates/live-artifacts',
    pattern: '*/README.md',
  }),
  schema: z.object({ i18n: localizedContentSchema }).passthrough(),
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
  schema: z
    .object({
      title: z.string(),
      date: z.coerce.date(),
      category: z.enum(['Product', 'Guides', 'Use cases', 'Community']),
      readingTime: z.number().int().positive(),
      summary: z.string(),
      i18n: z
        .record(
          z.string(),
          z
            .object({
              title: z.string().optional(),
              summary: z.string().optional(),
              category: z.string().optional(),
              body: z.string().optional(),
              bodyHtml: z.string().optional(),
            })
            .passthrough(),
        )
        .optional(),
    })
    .passthrough(),
});

// Tutorials live in `app/content/tutorials/*.md`. Each entry maps to a
// single YouTube video and renders a click-through preview on
// `/tutorials/<slug>/`.
const tutorials = defineCollection({
  loader: glob({
    pattern: ['*.md', '!_*.md'],
    base: './app/content/tutorials',
  }),
  schema: z.object({
    title: z.string(),
    youtubeId: z.string().regex(/^[\w-]{11}$/, 'youtubeId must be 11 chars'),
    summary: z.string(),
    date: z.coerce.date(),
    category: z.enum(['Getting started', 'Tutorial', 'Demo', 'Review', 'Community']),
    durationSeconds: z.number().int().positive(),
    author: z.string(),
    official: z.boolean().default(false),
    thumbnail: z.string().url().optional(),
  }),
});

export const collections = { skills, designTemplates, systems, craft, templates, blog, tutorials };
