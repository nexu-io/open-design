import { buildBlogRss } from '../_lib/blog-rss';

export async function GET(context: { site: URL }) {
  return buildBlogRss(context);
}
