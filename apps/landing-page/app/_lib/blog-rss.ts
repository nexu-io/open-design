import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function buildBlogRss(context: { site: URL }) {
  const posts = (await getCollection('blog')).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime(),
  );

  return rss({
    title: 'Marketing AX Blog',
    description:
      'Editorial notes on Marketing AX, agent-native design workflows, BYOK, skills, systems, and community.',
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.summary,
      pubDate: post.data.date,
      link: `/blog/${post.id}/`,
      categories: [post.data.category],
    })),
  });
}

