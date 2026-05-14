/*
 * Astro Content Collection — Blog
 *
 * Posts live in `app/content/blog/*.md`. Each post must declare a typed
 * frontmatter block matching the schema below. The list page reads the
 * collection via `getCollection('blog')` and the dynamic route renders
 * each entry via `getEntry('blog', slug)`.
 */

import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  // Exclude underscore-prefixed files so internal-only docs like
  // `_topics.md` (the topic backlog used by the blog-factory skill)
  // do not get parsed as posts.
  loader: glob({ pattern: ['**/*.md', '!**/_*.md'], base: './app/content/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    category: z.enum([
      'Product',
      'Guides',
      'Use cases',
      'Community',
    ]),
    readingTime: z.number().int().positive(),
    summary: z.string(),
  }),
});

export const collections = { blog };
