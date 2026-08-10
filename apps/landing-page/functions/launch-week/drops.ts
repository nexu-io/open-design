/**
 * Serves the revealed Launch Week drops, and only the ones whose day has
 * arrived.
 *
 * The page itself is static, so anything baked into its HTML is readable by
 * anyone from the moment it deploys — which would hand out the running order
 * days before each reveal. The sealed cards ship in the page; the revealed
 * markup lives here and is released on the hour, without needing a deploy.
 *
 * A day opens at 12:00 UTC+8 — midday, a few hours ahead of when the day's
 * posts go out, so the page is never the last thing to know. UTC+8 observes no
 * daylight saving, so a plain UTC offset is the whole calculation.
 */
import { LW_DROP_MARKUP } from '../../app/_partials/launch-week-drops';

type PagesFunctionContext<Env> = {
  request: Request;
  env: Env;
};

type PagesFunction<Env> = (context: PagesFunctionContext<Env>) => Response | Promise<Response>;

/** Day N opens at 2026-08-{09+N} 04:00 UTC = 12:00 UTC+8. */
const OPENS_AT = [
  '2026-08-10T04:00:00Z',
  '2026-08-11T04:00:00Z',
  '2026-08-12T04:00:00Z',
  '2026-08-13T04:00:00Z',
  '2026-08-14T04:00:00Z',
].map((iso) => Date.parse(iso));

/**
 * Unlocks `?preview=` so the team can rehearse a day before it opens.
 *
 * It lives in the Pages project's encrypted secrets, never in this file and
 * never in the page. This repository is public and the page is served to
 * everyone, so a key written into either is a key everyone has — which is
 * exactly how the first version of this leaked the whole running order.
 *
 * Unset means preview is off and only the real schedule applies. Failing
 * closed is the point: a missing secret must never open the week up.
 */
type Env = { LAUNCH_WEEK_PREVIEW_KEY?: string };

function acceptedPreview(url: URL, env: Env): string | null {
  const secret = env.LAUNCH_WEEK_PREVIEW_KEY;
  if (!secret) return null;
  if (url.searchParams.get('key') !== secret) return null;
  const preview = url.searchParams.get('preview');
  if (preview === 'all') return 'all';
  return Number(preview) >= 1 && Number(preview) <= 5 ? preview : null;
}

/**
 * Where each day's "Watch the drop" button points — the X post for that day.
 *
 * The posts do not exist when the page ships, and a card whose button goes
 * nowhere is worse than a card with no button: it is the most prominent thing
 * on the live card, and the click costs the visitor a scroll to the top for
 * nothing. So a day with no entry here renders no button at all, and gains one
 * the moment its URL is filled in.
 *
 * Backfilling costs a production deploy, which needs a `landing-deployers`
 * approval — so batch the days rather than editing this every morning.
 */
const DROP_LINKS: Record<number, string> = {
  // 1: 'https://x.com/opendesign_ai/status/…',
};

/** Point the button at the day's post, or drop it entirely if there isn't one. */
function withWatchLink(html: string, day: number): string {
  const url = DROP_LINKS[day];
  return url
    ? html.replace('<a class="watch" href="#">', `<a class="watch" href="${url}" target="_blank" rel="noopener">`)
    : html.replace(/\s*<a class="watch" href="#">[\s\S]*?<\/a>/, '');
}

/**
 * Cache until the next boundary rather than for a fixed window, so the edge
 * cannot keep serving yesterday's set into the new day. Clamped to a minute so
 * a clock skew near the boundary self-corrects quickly.
 */
function secondsUntilNextOpen(now: number): number {
  const next = OPENS_AT.find((t) => t > now);
  if (next === undefined) return 3600;
  return Math.max(60, Math.min(3600, Math.floor((next - now) / 1000)));
}

export const onRequest: PagesFunction<Env> = ({ request, env }) => {
  const url = new URL(request.url);
  const locale = url.searchParams.get('locale') ?? 'en';
  const preview = acceptedPreview(url, env);

  const now = Date.now();
  const openThrough =
    preview === 'all' ? 5 : preview ? Number(preview) : OPENS_AT.filter((t) => now >= t).length;

  const byLocale = LW_DROP_MARKUP[locale] ?? LW_DROP_MARKUP.en;
  const drops = byLocale
    .slice(0, openThrough)
    .map((html, i) => ({ day: i + 1, html: withWatchLink(html, i + 1) }));

  // The page holds no key, so it cannot know whether a preview was honoured.
  // Report it back and let the response drive what the day labels say.
  return new Response(JSON.stringify({ drops, preview }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // A preview response is per-request and must never be cached publicly.
      'Cache-Control': preview
        ? 'no-store'
        : `public, max-age=60, s-maxage=${secondsUntilNextOpen(now)}`,
    },
  });
};
