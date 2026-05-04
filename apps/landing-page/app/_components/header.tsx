/*
 * Sticky Header — static markup rendered at build time. Headroom-style
 * hide/show and the live GitHub star count are attached by the tiny inline
 * script in `app/pages/index.astro`, so this marketing page ships no React
 * runtime to the browser.
 */

const REPO = 'https://github.com/nexu-io/open-design';
const REPO_RELEASES = `${REPO}/releases`;
const REPO_SKILLS = `${REPO}/tree/main/skills`;
const REPO_DESIGN_SYSTEMS = `${REPO}/tree/main/design-systems`;

const ext = {
  target: '_blank',
  rel: 'noreferrer noopener',
} as const;

export function Header() {
  return (
    <header className='nav' data-od-id='nav' data-nav-headroom>
      <div className='container nav-inner'>
        <a href='#top' className='brand'>
          <span className='brand-mark'>Ø</span>
          <span>Open Design</span>
          <span className='brand-meta'>
            <b>Studio Nº 01</b>Berlin / Open / Earth
          </span>
        </a>
        <nav>
          <ul className='nav-links'>
            <li>
              <a href={REPO_SKILLS} {...ext}>
                Skills<span className='num'>31</span>
              </a>
            </li>
            <li>
              <a href={REPO_DESIGN_SYSTEMS} {...ext}>
                Systems<span className='num'>72</span>
              </a>
            </li>
            <li>
              <a href='#agents'>
                Agents<span className='num'>12</span>
              </a>
            </li>
            <li>
              <a href='#labs'>
                Labs<span className='num'>05</span>
              </a>
            </li>
            <li>
              <a href='#contact'>Contact</a>
            </li>
          </ul>
        </nav>
        <div className='nav-side'>
          <a
            className='nav-cta ghost'
            href={REPO_RELEASES}
            aria-label='Download Open Design desktop'
            title='Download the desktop app'
            {...ext}
          >
            Download
          </a>
          <a
            className='nav-cta'
            href={REPO}
            aria-label='Star Open Design on GitHub'
            title='Click to star us on GitHub'
            {...ext}
          >
            Star · <span data-github-stars>0</span>
          </a>
          <span className='status-dot' aria-hidden='true' />
        </div>
      </div>
    </header>
  );
}
