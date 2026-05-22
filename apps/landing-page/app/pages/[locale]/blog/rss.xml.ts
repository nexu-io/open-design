import { buildBlogRss } from '../../../_lib/blog-rss';
import { PREFIXED_LOCALES, isLocale, localePath } from '../../../_lib/i18n';

export function getStaticPaths() {
  return PREFIXED_LOCALES.map((locale) => ({
    params: { locale },
  }));
}

export async function GET(context: { site: URL; params: { locale?: string } }) {
  const response = await buildBlogRss(context);
  const locale = context.params.locale;
  if (!isLocale(locale)) return response;

  const xml = await response.text();
  return new Response(
    xml.replaceAll('https://open-design.ai/blog/', new URL(localePath('/blog/', locale, { prefixDefault: true }), context.site).toString()),
    {
      headers: response.headers,
      status: response.status,
    },
  );
}
