import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    category: z.string(),
    readingTime: z.string(),
    summary: z.string(),
  }),
});

export const collections = { blog };
