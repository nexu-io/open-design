import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context: { site: URL }) {
  const posts = (await getCollection('blog')).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime(),
  );

  return rss({
    title: 'Open Design Blog',
    description:
      'Editorial notes on Open Design, agent-native design workflows, BYOK, skills, systems, and community.',
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
