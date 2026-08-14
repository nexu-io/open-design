// Shared CTA-action shaping for the comparison (/alternatives/*) and agent
// (/agents/*-design/) landing pages.
//
// These pages lead with the desktop download: drop the generic "get started"
// CTA (the /quickstart/ action) and surface only two buttons — Download,
// emphasized as the primary, and Star on GitHub as the secondary. Actions are
// matched by their locale-stable hrefs, so this holds across every translation
// without editing per-locale copy.
//
// The download button always points at the on-site download page
// (DOWNLOAD_HREF), regardless of what the (drifted) per-locale copy had — the
// English base used /download/ while older translated copy linked straight to
// GitHub /releases; both are normalised here to the localized download page.

export const CTA_REPO = 'https://github.com/nexu-io/open-design';
export const CTA_REPO_RELEASES = `${CTA_REPO}/releases`;
export const DEEPSEEK_HARNESS_REPO = 'https://github.com/deepseek-ai/deepseek-harness';
// On-site download page; ctaHref() localizes this per locale.
export const DOWNLOAD_HREF = '/download/';
const GET_STARTED_HREF = '/quickstart/';

export type CtaAction = {
  label: string;
  href: string;
  variant?: string;
  external?: boolean;
};

const isStar = (a: CtaAction) => a.href === CTA_REPO;

export const downloadFirstCtas = (actions: readonly CtaAction[]): CtaAction[] => {
  const kept = actions.filter((a) => a.href !== GET_STARTED_HREF);
  const download = kept.find((a) => !isStar(a));
  const star = kept.find(isStar);
  if (!download) return [...actions]; // unexpected shape: leave untouched
  const out: CtaAction[] = [
    { ...download, href: DOWNLOAD_HREF, external: false, variant: 'primary' },
  ];
  if (star) out.push({ ...star, variant: 'ghost' });
  return out;
};

// DeepSeek Harness translations originally shipped with the generic Open Design
// CTA trio. Prefer translated labels when the current two-action shape exists;
// otherwise retain the locale's translated download label and use a
// language-neutral brand label for the upstream repository. This avoids leaking
// an English sentence into every legacy locale without fabricating translations.
export const deepseekHarnessHeroCtas = (
  actions: readonly CtaAction[],
): CtaAction[] => {
  const download = actions.find(
    (action) => action.href === DOWNLOAD_HREF || action.href === CTA_REPO_RELEASES,
  );
  const harness = actions.find((action) => action.href === DEEPSEEK_HARNESS_REPO);

  return [
    {
      ...(download ?? { label: 'Open Design' }),
      href: DOWNLOAD_HREF,
      external: false,
      variant: 'primary',
    },
    {
      ...(harness ?? { label: 'DeepSeek Harness · GitHub' }),
      href: DEEPSEEK_HARNESS_REPO,
      external: true,
      variant: 'ghost',
    },
  ];
};
