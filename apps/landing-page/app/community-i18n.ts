/*
 * Community pages content — localized copy + non-localized data.
 *
 * These four pages (`/community/`, `/community/contributors/`,
 * `/community/ambassadors/`, `/community/moderators/`) used to live as
 * hand-written static HTML under `public/community/`, English-only and
 * outside the Astro i18n routing. They are now real Astro routes rendered
 * per-locale through `sub-page-layout.astro`.
 *
 * Split of concerns:
 *   - COMMUNITY_DATA  — structural, NON-translatable facts (avatars, social
 *     links, GitHub logins, PR numbers, install command, roster identities).
 *     Shared across every locale; never duplicated per language.
 *   - CommunityCopy   — every translatable string, as a plain string tree.
 *     Some strings carry inline markup (`<em>`, `<a>`, `<code>`, `<b>`,
 *     `<br/>`, `<span class="num">…`); those are rendered with `set:html`.
 *     Translators translate the text and keep the tags/attributes intact.
 *
 * `en` is the authoritative base. Other locales are DeepPartial overrides
 * merged over `en` via `mergeCopy` (so an untranslated string falls back to
 * English rather than breaking the layout).
 */
import { DEFAULT_LOCALE, type LandingLocaleCode } from './i18n';
import { COMMUNITY_OVERRIDES } from './community-locales';

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (infer U)[]
    ? U[]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

/** Deep-merge a locale override over the English base; arrays replace wholesale. */
function mergeCopy<T>(base: T, override: DeepPartial<T> | undefined): T {
  if (!override) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const baseValue = out[key];
    if (
      baseValue &&
      value &&
      typeof baseValue === 'object' &&
      typeof value === 'object' &&
      !Array.isArray(baseValue) &&
      !Array.isArray(value)
    ) {
      out[key] = mergeCopy(baseValue, value as DeepPartial<typeof baseValue>);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

/* ------------------------------------------------------------------ *
 * Non-localized structural data
 * ------------------------------------------------------------------ */

export const COMMUNITY_LINKS = {
  discord: 'https://discord.gg/mHAjSMV6gz',
  discussions: 'https://github.com/nexu-io/open-design/discussions',
  repo: 'https://github.com/nexu-io/open-design',
  plugins: 'https://open-design.ai/plugins/',
  contributing: 'https://github.com/nexu-io/open-design/blob/main/CONTRIBUTING.md',
  goodFirstIssues:
    'https://github.com/nexu-io/open-design/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22',
  ambassadorForm:
    'https://docs.google.com/forms/d/e/1FAIpQLSfQryELmEWDLfaAaJqNJatuTQMVfun7bvI7rbt7hLbTrQvYGg/viewform?usp=publish-editor',
  installCommand:
    'curl -sSL https://raw.githubusercontent.com/nexu-io/open-design/main/.claude/skills/od-contribute/install.sh | bash',
  heroCardImage:
    'https://raw.githubusercontent.com/nexu-io/open-design/bot-cards/data/cards/dev-kp-eloper-signal-2026-05-26T03-19-40-361Z.png',
} as const;

export interface MaintainerData {
  login: string;
  avatar: string;
  github: string;
}

/** Maintainer identities. Bios/roles are localized (see `contributors.maintainerCards`). */
export const MAINTAINERS: readonly MaintainerData[] = [
  {
    login: 'Nagendhra-web',
    avatar: 'https://github.com/Nagendhra-web.png',
    github: 'https://github.com/Nagendhra-web',
  },
  {
    login: 'Sid-Qin',
    avatar: 'https://github.com/Sid-Qin.png',
    github: 'https://github.com/Sid-Qin',
  },
] as const;

export interface RankedContributor {
  login: string;
  avatar: string;
  prs?: number;
  commits?: number;
}

/*
 * Curated contributor ranking snapshot (generated 2026-05-26). Rendered
 * server-side into the weekly / all-time leaderboards. Core maintainers,
 * internal staff and bots are filtered out at build time by `isExcluded`.
 */
const CORE_TEAM = new Set(
  [
    'pftom', 'mrcfps', 'sophia', 'ashleyashli', 'qiongyu1999', 'zoeforfun',
    'perishcode', 'nettee', 'anthhub', 'siri-ray', 'lefarcen',
    'alchemistklk', 'shangxinyu1', 'joeylee12629-star', 'tuola-waj',
    'leilei926524-tech', 'nagendhra-web', 'sid-qin', 'chaoxiaoche',
  ].map((s) => s.toLowerCase()),
);
const BOT_LOGINS = new Set([
  'open-design-bot', 'opendesign-bot', 'nexu-bot', 'open-design-bot[bot]',
]);
const BOT_TOKEN_RE = /(?:^|[-_])(?:bot|cursor|agent)(?:$|[-_])/;

function isExcluded(login: string): boolean {
  const l = login.toLowerCase();
  if (!l) return true;
  if (CORE_TEAM.has(l)) return true;
  if (l.endsWith('[bot]')) return true;
  if (BOT_TOKEN_RE.test(l)) return true;
  return BOT_LOGINS.has(l);
}

const WEEKLY_SNAPSHOT: readonly RankedContributor[] = [
  { login: 'bulai0408', avatar: 'https://avatars.githubusercontent.com/u/31983330?v=4', prs: 19 },
  { login: '522700967-wq', avatar: 'https://avatars.githubusercontent.com/u/270050048?v=4', prs: 14 },
  { login: 'YUHAO-corn', avatar: 'https://avatars.githubusercontent.com/u/201702441?v=4', prs: 10 },
  { login: 'xxiaoxiong', avatar: 'https://avatars.githubusercontent.com/u/27723864?v=4', prs: 10 },
  { login: 'YOMXXX', avatar: 'https://avatars.githubusercontent.com/u/18409951?v=4', prs: 10 },
  { login: 'portseif', avatar: 'https://avatars.githubusercontent.com/u/13489304?v=4', prs: 9 },
  { login: 'leessju', avatar: 'https://avatars.githubusercontent.com/u/40141791?v=4', prs: 7 },
  { login: 'GHX5T-SOL', avatar: 'https://avatars.githubusercontent.com/u/200635707?v=4', prs: 7 },
  { login: 'neogenix', avatar: 'https://avatars.githubusercontent.com/u/141967?v=4', prs: 6 },
  { login: 'prantikmedhi', avatar: 'https://avatars.githubusercontent.com/u/140103052?v=4', prs: 5 },
];

const ALLTIME_SNAPSHOT: readonly RankedContributor[] = [
  { login: 'bulai0408', avatar: 'https://avatars.githubusercontent.com/u/31983330?v=4', commits: 37 },
  { login: 'Nicholas-Xiong', avatar: 'https://github.com/Nicholas-Xiong.png', commits: 35 },
  { login: 'YUHAO-corn', avatar: 'https://avatars.githubusercontent.com/u/201702441?v=4', commits: 34 },
  { login: 'leessju', avatar: 'https://avatars.githubusercontent.com/u/40141791?v=4', commits: 16 },
  { login: 'prantikmedhi', avatar: 'https://avatars.githubusercontent.com/u/140103052?v=4', commits: 15 },
  { login: '522700967-wq', avatar: 'https://avatars.githubusercontent.com/u/270050048?v=4', commits: 14 },
  { login: 'mturac', avatar: 'https://avatars.githubusercontent.com/u/345446?v=4', commits: 13 },
  { login: 'Mason', avatar: 'https://github.com/Mason.png', commits: 12 },
  { login: 'portseif', avatar: 'https://avatars.githubusercontent.com/u/13489304?v=4', commits: 10 },
  { login: 'GHX5T-SOL', avatar: 'https://avatars.githubusercontent.com/u/200635707?v=4', commits: 8 },
];

export const WEEKLY_RANKING = WEEKLY_SNAPSHOT.filter((c) => !isExcluded(c.login));
export const ALLTIME_RANKING = ALLTIME_SNAPSHOT.filter((c) => !isExcluded(c.login));

export interface RosterSocial {
  type: 'x' | 'github' | 'youtube' | 'website' | 'bilibili';
  href: string;
  /** Remix Icon glyph (from the full `remixicon.ttf`). */
  glyph: string;
  label: string;
}

/** Remix Icon glyphs (from the full `remixicon.ttf`) used across the pages. */
export const GLYPH = {
  arrow: '',
  discord: '',
  check: '',
  add: '',
  x: '',
  github: '',
  youtube: '',
  website: '',
  bilibili: '',
  stepSpark: '',
  stepDraft: '',
  stepReview: '',
  stepMerge: '',
} as const;

export interface AmbassadorData {
  name: string;
  avatar: string;
  socials: RosterSocial[];
}

/** Ambassador roster. `place` (city/country) is localized by index in `ambassadors.places`. */
export const AMBASSADORS: readonly AmbassadorData[] = [
  {
    name: 'Josh',
    avatar: '/community/ambassadors/assets/josh.jpg',
    socials: [{ type: 'x', href: 'https://x.com/Josh_is_regen', glyph: '', label: 'Josh on X' }],
  },
  {
    name: 'Captain Awesome',
    avatar: '/community/ambassadors/assets/captain-awesome.jpg',
    socials: [
      { type: 'github', href: 'https://github.com/emmagine79', glyph: '', label: 'Captain Awesome on GitHub' },
      { type: 'youtube', href: 'https://youtube.com/geekception', glyph: '', label: 'Captain Awesome on YouTube' },
      { type: 'website', href: 'http://awelahlayray.work', glyph: '', label: 'Captain Awesome website' },
    ],
  },
  {
    name: 'CATMAN',
    avatar: '/community/ambassadors/assets/catman.jpg',
    socials: [{ type: 'x', href: 'https://x.com/catmangox', glyph: '', label: 'CATMAN on X' }],
  },
  {
    name: 'Haili',
    avatar: '/community/ambassadors/assets/haili.png',
    socials: [{ type: 'bilibili', href: 'https://space.bilibili.com/28357052', glyph: '', label: 'Haili on Bilibili' }],
  },
] as const;

export interface ModeratorData {
  name: string;
  avatar: string;
}

/** Moderator roster. Role/bio are localized by index in `moderators.cards`. */
export const MODERATORS: readonly ModeratorData[] = [
  {
    name: 'Koki',
    avatar: 'https://cdn.discordapp.com/avatars/1433334626641907803/659cec9ed75df0156957ff23e81e27f1.webp?size=2048',
  },
  {
    name: 'Victor',
    avatar: 'https://cdn.discordapp.com/avatars/1174739309509759008/60d038042d7246391a6c982d6508892e.webp?size=2048',
  },
] as const;

/** Discord channel names are literal handles; only the trailing note is localized. */
export const DISCORD_CHANNELS = ['#showcase', '#plugin', '#beta-test', '#help'] as const;

/* ------------------------------------------------------------------ *
 * Localized copy
 * ------------------------------------------------------------------ */

export interface CommunityCopy {
  hub: {
    title: string;
    desc: string;
    heroTitle: string; // inline: <em>, <br/>
    heroLead: string;
    cardMetaH: string;
    cardMetaS: string;
    cardHeroAlt: string;
    cards: {
      ord: string;
      title: string;
      sub: string; // inline: <em>
      body: string;
    }[];
  };
  contributors: {
    title: string;
    desc: string;
    heroTitle: string; // inline: <em>
    heroLead: string;
    showcase: {
      kicker: string;
      h2: string; // inline: <em>
      intro: string;
      tenets: { h3: string; body: string }[]; // inline: <em>, <a>
      pane: {
        kicker: string;
        h3: string; // inline: <em>
        lede: string;
        copy: string; // "Copy" button
        copied: string; // "Copied" state
        steps: { h4: string; body: string }[]; // inline: <code>
      };
    };
    maintainers: {
      kicker: string;
      h2: string; // inline: <em>
      intro: string;
      role: string;
      /** Bios keyed by GitHub login. */
      bios: Record<string, string>;
    };
    allTime: {
      kicker: string;
      h2: string; // inline: <em>
      intro: string;
      rankLabel: string;
      week: string;
      quote: string;
      handleSuffix: string;
      statCommits: string;
      statExternalRank: string;
      headContributor: string;
      headCommits: string;
      headRank: string;
    };
    weekly: {
      kicker: string;
      h2: string; // inline: <em>
      intro: string;
      rankLabel: string;
      week: string;
      handleSuffix: string;
      /** `{name}` and `{prs}` are substituted server-side. */
      blurbTemplate: string;
      statRank: string;
      statPrs: string;
      headContributor: string;
      headPrs: string;
      headRank: string;
    };
    issues: {
      kicker: string;
      h2: string; // inline: <em>
      intro: string; // inline: <span class="num">
      loading: string;
      /** inline: <span class="num" id="issue-count">—</span> */
      foot: string;
      seeAll: string;
      empty: string;
      rateLimited: string;
    };
    onboard: {
      kicker: string;
      h2: string; // inline: <em>
      intro: string;
      steps: { n: string; h3: string; body: string }[]; // h3 inline: <em>
      cta: string;
    };
  };
  ambassadors: {
    title: string;
    desc: string;
    heroTitle: string; // inline: <em>
    heroLead: string;
    program: {
      kicker: string;
      h2: string; // inline: <em>
      applyCta: string;
      applyNote: string;
      cols: {
        n: string;
        h3: string; // inline: <em>
        lede: string;
        items: string[]; // inline: <b>
      }[];
    };
    roster: {
      kicker: string;
      h2: string; // inline: <em>
      intro: string;
      /** Aligned by index to `AMBASSADORS`. */
      places: string[];
    };
  };
  moderators: {
    title: string;
    desc: string;
    heroTitle: string; // inline: <em>
    heroLead: string;
    discord: {
      kicker: string;
      h2: string; // inline: <em>
      body: string;
      joinCta: string;
      discussionsCta: string;
      /** Aligned by index to `MODERATORS`. */
      cards: { role: string; bio: string }[];
      /** Aligned by index to `DISCORD_CHANNELS`. */
      channelNotes: string[];
    };
  };
}

const EN: CommunityCopy = {
  hub: {
    title: 'Community — Open Design',
    desc: 'The Open Design community: contributors shipping in public, ambassadors hosting local ateliers, and moderators keeping the Discord warm.',
    heroTitle: 'Open design <em>takes shape</em><br/>when you ship it.',
    heroLead:
      'Open Design is built by people, in public. Skills, DESIGN.md systems, plugins, docs: every commit is a brushstroke. Pick a door below, find your room.',
    cardMetaH: 'Auto-minted on first merge',
    cardMetaS: 'PNG · shared on X',
    cardHeroAlt:
      'Open Design contributor honor card — @dev-kp-eloper, top 99.9%, Giotto tier',
    cards: [
      {
        ord: 'I',
        title: 'Contributors',
        sub: 'The hands that <em>ship</em> the work.',
        body: 'Maintainers, weekly leaderboards, the all-time roll, and the open issues you can claim today. Plus the zero-code path for non-coders to send their first piece into the registry.',
      },
      {
        ord: 'II',
        title: 'Ambassadors',
        sub: "Open Design's <em>voice</em> in your city.",
        body: 'Open a local atelier. Convene the meetups, the demos, the late-night critiques. Backed with budget, materials, and a private channel to the core team.',
      },
      {
        ord: 'III',
        title: 'Moderators',
        sub: 'The room where <em>contributors</em> hang out.',
        body: "The front line of the agent-design era. Discord is where the world's sharpest AI-native designers gather. Meet the stewards keeping the room warm.",
      },
    ],
  },
  contributors: {
    title: 'Contributors — Open Design',
    desc: 'Contribute to Open Design: maintainers, weekly and all-time contributor leaderboards, good first issues, and a zero-code path to ship your first piece.',
    heroTitle: 'The hands that <em>ship</em> the work.',
    heroLead:
      "Open Design is built by people, in public. Skills, DESIGN.md systems, plugins, docs: every commit is a brushstroke. Pick an issue, send a PR, and earn a one-of-one honor card the moment you're merged.",
    showcase: {
      kicker: 'Plugin everything',
      h2: 'Open Design as a stage. <em>Your work</em> as the show.',
      intro:
        'The atelier is also a gallery. Helping you make the work is half the address; making sure the room comes to look is the other. Every piece you ship lands not in a vault but on a wall, where the world can find it.',
      tenets: [
        {
          h3: 'Anything <em>can be a plugin</em>.',
          body: 'Whatever the studio yields (content, a finished product, a template, a Skill, a workflow) can be folded back into a plugin. The registry accepts any shape; the door keeps no gatekeeper.',
        },
        {
          h3: 'Your debut piece, your <em>induction</em>.',
          body: "The day your first piece lands in the registry, your name joins the wall. Not a visitor's badge. A permanent line on the contributor list, beside everyone who arrived before.",
        },
        {
          h3: "Once it's in, <em>it travels</em>.",
          body: 'The registry at <a href="https://open-design.ai/plugins/" target="_blank" rel="noopener">open-design.ai/plugins</a> is only the threshold. From there the strongest pieces are carried outward: to X, to Discord\'s <span class="num">#showcase</span>, to the newsletter, to the video reels. Each handoff widens the room; the world meets your hand.',
        },
        {
          h3: 'Need a <em>first stroke</em>?',
          body: 'Walk the <a href="https://open-design.ai/plugins/" target="_blank" rel="noopener">plugin registry</a>. The works hung there are kindling for your own. Borrow the spark, then make the piece only your hand could.',
        },
      ],
      pane: {
        kicker: 'The skill',
        h3: 'Let the <em>agent</em> ship for you.',
        lede: "For makers who'd rather not touch the code. The whole contribution lives in a single skill, spoken in plain language. The brushwork falls to the agent.",
        copy: 'Copy',
        copied: 'Copied',
        steps: [
          {
            h4: 'Hand the line to the agent',
            body: 'Paste the command above into the agent within Open Design, or into whichever you already keep at hand: Claude Code, Codex, Cursor. It installs itself.',
          },
          {
            h4: 'Wake the skill',
            body: 'Type <code>/od-contribute</code>, or simply tell the agent to run what you just installed. Either phrase opens the door.',
          },
          {
            h4: 'Half a minute to the gallery',
            body: 'The agent walks the rest. Your piece is bound for the open-source repository in about thirty seconds; we review at first chance, and the moment it lands, the room meets your hand.',
          },
        ],
      },
    },
    maintainers: {
      kicker: 'Steering the ship',
      h2: 'The <em>maintainers</em>.',
      intro:
        'Maintainers protect the direction and quality of Open Design: they review contributions, keep the standard coherent, and make room for more contributors to earn their place in the project.',
      role: 'Maintainer',
      bios: {
        'Nagendhra-web':
          "Nagendhra brings a data engineer's instinct for production truth: find the failure, measure the edge case, and fix it properly. In Open Design, that shows up in deploy preflight work, asset-bundling hardening, and Windows fixes that make the project feel trustworthy when contributors ship.",
        'Sid-Qin':
          "Sid is the generalist engineer with a designer's eye for detail: the kind of maintainer who notices both the broken CLI path and the crooked interaction affordance. In Open Design, Sid keeps export flows, plugin actions, Windows shims, MIME handling, and agent plumbing sharp enough for a community to build on.",
      },
    },
    allTime: {
      kicker: 'All-time signal',
      h2: 'The contributors with <em>deep roots</em>.',
      intro:
        'A long-running record of talented contributors who keep turning ideas, fixes, and craft into the shared Open Design standard.',
      rankLabel: 'All-time contributor',
      week: 'Repository history',
      quote:
        'The long tail matters: design systems, docs fixes, examples, and small repairs are how an open design language becomes dependable.',
      handleSuffix: '· deep contributor signal',
      statCommits: 'Commits',
      statExternalRank: 'External rank',
      headContributor: 'Contributor',
      headCommits: 'Commits',
      headRank: 'Rank',
    },
    weekly: {
      kicker: "This week's signal",
      h2: 'Ten contributors leading <em>this week</em>.',
      intro:
        'A snapshot of sharp contributors landing PRs, improving the product, and making Open Design feel alive.',
      rankLabel: "This week's leader",
      week: 'Last 7 days',
      handleSuffix: '· leading this week',
      blurbTemplate:
        '{name} is setting the pace this week with {prs} merged PRs and the kind of steady craft that keeps Open Design moving.',
      statRank: 'Rank',
      statPrs: 'PRs · 7d',
      headContributor: 'Contributor',
      headPrs: 'PRs',
      headRank: 'Rank',
    },
    issues: {
      kicker: 'Pick your first contribution',
      h2: 'Open issues, <em>tagged for you</em>.',
      intro:
        'Live from <span class="num">label:&ldquo;good first issue&rdquo;</span> on the Open Design repo. Comment on an issue to claim it, and a maintainer will assign it within a day.',
      loading: 'good first issue',
      foot: 'Showing first <span class="num" id="issue-count">—</span> open good-first-issues',
      seeAll: 'See all on GitHub',
      empty: 'No open good-first-issues right now. Check back tomorrow, or open one yourself',
      rateLimited:
        'GitHub rate limit reached in preview. Open the live good-first-issue search on GitHub.',
    },
    onboard: {
      kicker: 'Four steps · any skill level',
      h2: 'From zero to <em>merged</em>, in an afternoon.',
      intro:
        "Whether you're a designer, a writer, an engineer, or someone who just spotted a typo, there's a contribution shape for you. Here's the path.",
      steps: [
        {
          n: 'Step 01',
          h3: 'Find a <em>spark</em>.',
          body: "Browse the good-first-issues list above, or open a new issue describing something you'd improve. Designers: DESIGN.md systems are the easiest entry.",
        },
        {
          n: 'Step 02',
          h3: 'Open a <em>draft</em> PR.',
          body: 'Fork, branch, push. Mark it draft. It signals you want feedback early. Mention which issue it closes. The CI is fast; bot-cards stays on its own branch.',
        },
        {
          n: 'Step 03',
          h3: 'Review with <em>a human</em>.',
          body: "A maintainer reviews within 24h. We're kind, specific, and never gatekeep. If you're stuck, drop the PR link in Discord #help.",
        },
        {
          n: 'Step 04',
          h3: 'Merge → <em>card</em>.',
          body: "The bot mints your honor card the moment you're merged and pushes it to the bot-cards branch. Share it on X with #OpenDesign, and we repost the best ones.",
        },
      ],
      cta: 'Read the contributing guide',
    },
  },
  ambassadors: {
    title: 'Ambassadors — Open Design',
    desc: "Become an Open Design ambassador: open a local atelier, host meetups and critiques, and get budget, materials, and a private channel to the core team.",
    heroTitle: "Be Open Design's <em>voice</em> in your city.",
    heroLead:
      'Open a local atelier. Convene the meetups, the demos, the late-night critiques. We back you with budget, materials, and a private channel to the core team.',
    program: {
      kicker: 'The program',
      h2: 'Vocation, <em>patronage</em>, covenant.',
      applyCta: 'Apply via Google Form',
      applyNote:
        'Ambassadors turn Open Design from a repository into something contributors can meet in a room, with ink on the table and coffee gone cold.',
      cols: [
        {
          n: 'I · Vocation',
          h3: 'Painters of <em>the local scene</em>.',
          lede: 'Designers, developers, organizers: the kind who already gather others. We give the gathering a flag.',
          items: [
            '<b>Local Atelier Host:</b> you keep a recurring meetup, study group, or late-night hack alive.',
            '<b>Online community lead:</b> Discord, WeChat, Telegram, X spaces.',
            '<b>Practising contributor or evangelist:</b> already shipping work, posting craft, ushering newcomers.',
            '<b>Comfortable carrying the name:</b> bound to the Code of Conduct, mindful of the brand.',
          ],
        },
        {
          n: 'II · Patronage',
          h3: 'What the <em>atelier</em> extends.',
          lede: 'Not a volunteer badge. A working bond, with budget, standing, and access.',
          items: [
            '<b>A page on the site:</b> portrait, city, biography, socials, the chronicle of your events.',
            '<b>First sight:</b> beta features, internal roadmap previews, releases ahead of the queue.',
            '<b>The atelier kit:</b> posters, slide decks, demo pieces, swag; a purse for venue, drinks, and photography.',
            '<b>A line to the studio:</b> private channel, monthly sync, a dedicated path for your feedback.',
            '<b>A way forward:</b> honor cards and tiers, with a path into regional lead, speaker, or paid community roles.',
          ],
        },
        {
          n: 'III · Covenant',
          h3: 'The <em>discipline</em> of the studio.',
          lede: 'A modest commitment, but binding. Extended absence folds into alumni status; the circle stays small and serious.',
          items: [
            '<b>Convene</b> at least one event per month or quarter, local or online.',
            '<b>Welcome the new hand.</b> Usher newcomers through their first contribution.',
            '<b>Listen close.</b> Gather honest feedback from users, designers, developers, teams.',
            '<b>Leave a record.</b> Publish a recap after every gathering: attendance, photographs, links, leads.',
            "<b>Carry the name well.</b> Hold to the Code of Conduct; no misuse of the mark, no deals signed on the studio's behalf.",
          ],
        },
      ],
    },
    roster: {
      kicker: 'In the field',
      h2: 'Meet the <em>ambassadors</em>.',
      intro:
        'Local organizers, creators, and community builders helping Open Design reach more designers and teams.',
      places: [
        'Sunshine Coast, Australia',
        'Kuala Lumpur, Malaysia',
        'Japan',
        'China',
      ],
    },
  },
  moderators: {
    title: 'Moderators — Open Design',
    desc: 'Meet the Open Design Discord moderators and join the room where AI-native designers ship work, open plugins, break betas, and pull one another unstuck.',
    heroTitle: 'The room where <em>contributors</em> hang out.',
    heroLead:
      'The front line of the agent-design era opens here. Discord is where the world\'s sharpest AI-native designers gather. Meet the stewards keeping the room warm.',
    discord: {
      kicker: 'Where contributors hang out',
      h2: 'Talk to the people who\'ll <em>review your PR</em>.',
      body: "The front line of the agent-design era opens here. Our Discord is where the world's sharpest AI-native designers gather: shipping work, opening plugins, breaking betas, pulling one another unstuck. Step in. Bring what you're making.",
      joinCta: 'Join the Discord',
      discussionsCta: 'GitHub Discussions',
      cards: [
        {
          role: 'From the studio',
          bio: 'From the Open Design founding team. Hopes the Discord stays a good place to be. Wave at any time, on any question.',
        },
        {
          role: 'Steward of the room',
          bio: 'A practiced hand at Discord and community-tending. Keeps the room warm, the doors open, the conversation flowing. Passionate about Open Design.',
        },
      ],
      channelNotes: ['work shipped', 'builders', 'early feedback', 'unstuck'],
    },
  },
};

/* ------------------------------------------------------------------ *
 * Locale overrides (DeepPartial; merged over EN). Each non-English locale
 * lives in its own shard under `community-locales/` and is assembled by
 * `community-locales/index.ts`.
 * ------------------------------------------------------------------ */

export function getCommunityCopy(locale: LandingLocaleCode): CommunityCopy {
  if (locale === DEFAULT_LOCALE) return EN;
  return mergeCopy(EN, COMMUNITY_OVERRIDES[locale]);
}

export { EN as COMMUNITY_EN };
