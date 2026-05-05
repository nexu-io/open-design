/*
 * Global wire — the slim editorial ticker between the hero and About.
 *
 * The cities row (top) is decorative and stays static. The contributors
 * row (bottom, reverse direction) renders a static fallback at build time;
 * `app/pages/index.astro` enhances it with a tiny inline GitHub fetch so
 * the browser never downloads React.
 *
 *   GET https://api.github.com/repos/nexu-io/open-design/contributors
 *
 * Each entry becomes a `<a class='wire-item is-link'>` linking straight
 * to the contributor's GitHub profile. We:
 *
 *   - filter out bot accounts (`type === 'Bot'` or `*[bot]` logins),
 *   - keep the top N by contribution count,
 *   - apply named editorial roles to known handles (kami, guizang…)
 *     and fall back to "<count> commits" for everyone else,
 *   - always append a trailing "@you · be next" link to the
 *     contributors graph so the editorial CTA stays intact.
 *
 * If the fetch is blocked (offline, rate limited, network failure), the
 * fallback list stays visible — the section never goes empty.
 */

const REPO = 'https://github.com/nexu-io/open-design';
const REPO_CONTRIBUTORS_PAGE = `${REPO}/graphs/contributors`;

const ext = {
  target: '_blank',
  rel: 'noreferrer noopener',
} as const;

const TRAILING_CTA: Contributor = {
  handle: 'you',
  role: 'be next',
  href: REPO_CONTRIBUTORS_PAGE,
};

type Contributor = {
  handle: string;
  role: string;
  href: string;
};

// SSR-safe initial list. Used until the GitHub fetch resolves AND as
// the permanent fallback when the network is unavailable. Mirrors the
// canonical wire row in `skills/open-design-landing/example.html` so
// hydration is byte-stable against the static reference rendering.
const FALLBACK: ReadonlyArray<Contributor> = [
  { handle: 'tw93', role: 'kami', href: 'https://github.com/tw93' },
  { handle: 'op7418', role: 'guizang', href: 'https://github.com/op7418' },
  {
    handle: 'alchaincyf',
    role: 'huashu',
    href: 'https://github.com/alchaincyf',
  },
  {
    handle: 'multica-ai',
    role: 'daemon',
    href: 'https://github.com/multica-ai',
  },
  {
    handle: 'OpenCoworkAI',
    role: 'codesign',
    href: 'https://github.com/OpenCoworkAI',
  },
  { handle: 'nexu-io', role: 'studio', href: 'https://github.com/nexu-io' },
  TRAILING_CTA,
];

type City = { name: string; coord: string };

export function Wire({ cities }: { cities: ReadonlyArray<City> }) {
  // Doubled tracks are required for the seamless `translateX(-50%)`
  // marquee loop defined in globals.css.
  const cityTrack = [...cities, ...cities];
  const contribTrack = [...FALLBACK, ...FALLBACK];

  return (
    <section
      className='wire'
      data-od-id='wire'
      aria-label='Global wire — cities and contributors'
    >
      <div className='container wire-inner'>
        <div className='wire-left'>
          <span className='wire-mark' aria-hidden='true'>
            <span className='wire-pulse' />
          </span>
          <span className='wire-title'>
            <b>From the field</b>
            <span>
              Open · {cities.length} cities ·{' '}
              <span data-wire-contributors-count>{FALLBACK.length - 1}</span>{' '}
              contributors
            </span>
          </span>
        </div>
        <div className='wire-rows'>
          <div className='wire-row'>
            <div className='marquee-track' aria-hidden='true'>
              {cityTrack.map((c, i) => (
                <span className='wire-item' key={`city-${i}`}>
                  <span className='wire-dot'>·</span>
                  <span className='wire-coord'>{c.coord}</span>
                  <span className='wire-name'>{c.name}</span>
                </span>
              ))}
            </div>
          </div>
          <div className='wire-row reverse'>
            <div className='marquee-track' data-wire-contributors-track>
              {contribTrack.map((c, i) => (
                <a
                  className='wire-item is-link'
                  key={`contrib-${i}-${c.handle}`}
                  href={c.href}
                  aria-label={`Open ${c.handle} on GitHub`}
                  {...ext}
                >
                  <span className='wire-dot'>·</span>
                  <span className='wire-handle'>@{c.handle}</span>
                  <span className='wire-role'>{c.role}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
