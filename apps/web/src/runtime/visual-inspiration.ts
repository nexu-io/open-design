export type VisualInspirationSource = 'template' | 'community';

export type VisualInspirationSurface =
  | 'web'
  | 'mobile'
  | 'deck'
  | 'image'
  | 'video'
  | 'audio'
  | 'other';

export interface VisualInspirationCandidate {
  id: string;
  source: VisualInspirationSource;
  title: string;
  description: string;
  prompt?: string;
  tags: string[];
  surface: VisualInspirationSurface;
  mode?: string | null;
  platform?: string | null;
  scenario?: string | null;
  featured?: number | null;
  previewUrl?: string | null;
  previewKind?: string | null;
}

export interface RankedVisualInspirationCandidate extends VisualInspirationCandidate {
  score: number;
  matchedTerms: string[];
}

export type VisualInspirationSourceFilter = 'all' | VisualInspirationSource;
export type VisualInspirationSurfaceFilter = 'all' | 'web' | 'mobile';

interface RankOptions {
  currentSkillId?: string | null;
  sourceFilter?: VisualInspirationSourceFilter;
  surfaceFilter?: VisualInspirationSurfaceFilter;
  limit?: number;
}

const KEYWORD_GROUPS: string[][] = [
  ['ppt', 'presentation', 'presentations', 'slide', 'slides', 'deck', 'keynote', '幻灯片', '演示', '路演', '汇报', 'PPT'],
  ['portfolio', 'showcase', 'case', 'cases', 'work', 'works', '作品集', '案例集', '展示', '项目集'],
  ['landing', 'homepage', 'website', 'web', 'site', 'hero', '落地页', '官网', '网页', '网站', '首屏'],
  ['mobile', 'ios', 'android', 'app', 'phone', '移动', '手机', '应用', '小程序'],
  ['dashboard', 'analytics', 'chart', 'charts', 'data', 'metric', 'metrics', '看板', '仪表盘', '数据', '图表'],
  ['brand', 'identity', 'system', 'guideline', 'visual', 'logo', '品牌', '视觉', '规范', 'VI'],
  ['image', 'poster', 'visual', 'campaign', 'social', '图片', '海报', '视觉图', '社媒'],
  ['video', 'motion', 'storyboard', 'film', 'reel', '视频', '动效', '分镜', '短片'],
  ['audio', 'voice', 'sfx', 'music', 'sound', '音频', '配音', '音效', '音乐'],
  ['minimal', 'clean', 'simple', 'modern', '现代', '极简', '简洁'],
  ['editorial', 'magazine', 'newspaper', 'publication', '编辑', '杂志', '报纸'],
  ['luxury', 'premium', 'refined', 'elegant', '高端', '奢华', '精致'],
  ['playful', 'illustration', 'fun', 'game', '游戏', '插画', '活泼', '趣味'],
  ['tech', 'developer', 'saas', 'ai', 'devtools', '科技', '开发者', '工具', '产品'],
];

const MATCHED_TERM_LABELS: Array<[string, string[]]> = [
  ['deck', KEYWORD_GROUPS[0]!],
  ['portfolio', KEYWORD_GROUPS[1]!],
  ['web', KEYWORD_GROUPS[2]!],
  ['mobile', KEYWORD_GROUPS[3]!],
  ['dashboard', KEYWORD_GROUPS[4]!],
  ['brand', KEYWORD_GROUPS[5]!],
  ['image', KEYWORD_GROUPS[6]!],
  ['video', KEYWORD_GROUPS[7]!],
  ['audio', KEYWORD_GROUPS[8]!],
  ['minimal', KEYWORD_GROUPS[9]!],
  ['editorial', KEYWORD_GROUPS[10]!],
  ['luxury', KEYWORD_GROUPS[11]!],
  ['playful', KEYWORD_GROUPS[12]!],
  ['tech', KEYWORD_GROUPS[13]!],
];

const CJK_TERM_RE = /[\u3400-\u9fff][\u3400-\u9fffA-Za-z0-9#+.-]*/gu;
const WORD_RE = /[A-Za-z0-9][A-Za-z0-9#+.-]*/gu;

export function visualInspirationSearchSeed(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('[form answers'))
    .filter((line) => !/\(skipped\)/i.test(line))
    .map((line) => line.replace(/^\s*-\s*/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function rankVisualInspirations(
  candidates: VisualInspirationCandidate[],
  query: string,
  options: RankOptions = {},
): RankedVisualInspirationCandidate[] {
  const sourceFilter = options.sourceFilter ?? 'all';
  const surfaceFilter = options.surfaceFilter ?? 'all';
  const queryTokens = expandTokens(tokenize(query));
  const queryPhrase = normalize(query);
  const filtered = candidates.filter((candidate) => {
    if (sourceFilter !== 'all' && candidate.source !== sourceFilter) return false;
    if (surfaceFilter === 'web' && candidate.surface !== 'web') return false;
    if (surfaceFilter === 'mobile' && candidate.surface !== 'mobile') return false;
    return true;
  });

  return filtered
    .map((candidate, index) => {
      const titleTokens = expandTokens(tokenize(candidate.title));
      const descriptionTokens = expandTokens(tokenize(candidate.description));
      const promptTokens = expandTokens(tokenize(candidate.prompt ?? ''));
      const tagTokens = expandTokens(tokenize(candidate.tags.join(' ')));
      const metaTokens = expandTokens(tokenize([
        candidate.surface,
        candidate.mode,
        candidate.platform,
        candidate.scenario,
        candidate.source,
      ].filter(Boolean).join(' ')));
      const allTokens = new Set([
        ...titleTokens,
        ...descriptionTokens,
        ...promptTokens,
        ...tagTokens,
        ...metaTokens,
      ]);
      const matchedTerms = matchedTermLabels(queryTokens, allTokens);
      let score = 0;
      for (const token of queryTokens) {
        if (titleTokens.has(token)) score += 12;
        if (tagTokens.has(token)) score += 9;
        if (promptTokens.has(token)) score += 7;
        if (descriptionTokens.has(token)) score += 5;
        if (metaTokens.has(token)) score += 6;
      }
      if (queryPhrase && normalize(candidate.title).includes(queryPhrase)) score += 24;
      if (options.currentSkillId && candidate.id === options.currentSkillId) score += 36;
      if (candidate.source === 'template') score += 5;
      if (candidate.previewUrl) score += 4;
      if (typeof candidate.featured === 'number') {
        score += Math.max(0, 10 - candidate.featured);
      }
      if (surfaceMatchesQuery(candidate.surface, queryTokens)) score += 16;
      return { ...candidate, score, matchedTerms, index };
    })
    .filter((candidate) => candidate.score > 0 || queryTokens.size === 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((a.featured ?? Number.POSITIVE_INFINITY) !== (b.featured ?? Number.POSITIVE_INFINITY)) {
        return (a.featured ?? Number.POSITIVE_INFINITY) - (b.featured ?? Number.POSITIVE_INFINITY);
      }
      return a.index - b.index;
    })
    .slice(0, options.limit ?? 24)
    .map(({ index: _index, ...candidate }) => candidate);
}

export interface VisualInspirationContextLabels {
  selectedHeader: string;
  skippedHeader: string;
  selectedLabel: string;
  sourceLabel: string;
  tagsLabel: string;
  promptLabel: string;
  previewLabel: string;
  notesLabel: string;
  instruction: string;
  skippedBody: string;
  templateSource: string;
  communitySource: string;
}

export function formatVisualInspirationContext(
  candidate: VisualInspirationCandidate | null,
  labels: VisualInspirationContextLabels,
  notes = '',
): string {
  if (!candidate) {
    return `${labels.skippedHeader}\n${labels.skippedBody}`;
  }
  const lines = [labels.selectedHeader];
  lines.push(`- ${labels.selectedLabel}: ${candidate.title}`);
  lines.push(`- ${labels.sourceLabel}: ${candidate.source === 'template' ? labels.templateSource : labels.communitySource}`);
  if (candidate.tags.length > 0) {
    lines.push(`- ${labels.tagsLabel}: ${candidate.tags.slice(0, 8).join(', ')}`);
  }
  if (candidate.prompt?.trim()) {
    lines.push(`- ${labels.promptLabel}: ${candidate.prompt.trim()}`);
  }
  if (candidate.previewUrl) {
    lines.push(`- ${labels.previewLabel}: ${candidate.previewUrl}`);
  }
  if (notes.trim()) {
    lines.push(`- ${labels.notesLabel}: ${notes.trim()}`);
  }
  lines.push(`- ${labels.instruction}`);
  return lines.join('\n');
}

function surfaceMatchesQuery(surface: VisualInspirationSurface, queryTokens: Set<string>): boolean {
  if (surface === 'deck') return hasAny(queryTokens, ['ppt', 'presentation', 'slide', 'slides', 'deck', '幻灯片', '演示', '汇报']);
  if (surface === 'mobile') return hasAny(queryTokens, ['mobile', 'ios', 'android', 'app', 'phone', '移动', '手机', '应用']);
  if (surface === 'web') return hasAny(queryTokens, ['web', 'site', 'website', 'landing', 'homepage', '网页', '网站', '落地页']);
  if (surface === 'image') return hasAny(queryTokens, ['image', 'poster', '图片', '海报']);
  if (surface === 'video') return hasAny(queryTokens, ['video', 'motion', '视频', '动效']);
  if (surface === 'audio') return hasAny(queryTokens, ['audio', 'voice', '音频', '配音']);
  return false;
}

function hasAny(tokens: Set<string>, values: string[]): boolean {
  return values.some((value) => tokens.has(normalize(value)));
}

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  const normalized = normalize(text);
  for (const match of normalized.matchAll(WORD_RE)) {
    const token = match[0];
    if (token.length > 1) tokens.add(token);
  }
  for (const match of text.matchAll(CJK_TERM_RE)) {
    const token = normalize(match[0]);
    if (token.length > 0) tokens.add(token);
  }
  for (const group of KEYWORD_GROUPS) {
    for (const term of group) {
      const normalizedTerm = normalize(term);
      if (normalized.includes(normalizedTerm)) {
        tokens.add(normalizedTerm);
      }
    }
  }
  return tokens;
}

function matchedTermLabels(queryTokens: Set<string>, candidateTokens: Set<string>): string[] {
  const labels: string[] = [];
  const groupedTerms = new Set<string>();
  for (const [label, group] of MATCHED_TERM_LABELS) {
    const normalizedGroup = group.map(normalize);
    for (const term of normalizedGroup) groupedTerms.add(term);
    const queryHasGroup = normalizedGroup.some((term) => queryTokens.has(term));
    const candidateHasGroup = normalizedGroup.some((term) => candidateTokens.has(term));
    if (queryHasGroup && candidateHasGroup) labels.push(label);
  }
  for (const token of queryTokens) {
    if (labels.length >= 8) break;
    if (!candidateTokens.has(token) || groupedTerms.has(token) || labels.includes(token)) continue;
    labels.push(token);
  }
  return labels.slice(0, 8);
}

function expandTokens(tokens: Set<string>): Set<string> {
  const out = new Set(tokens);
  for (const group of KEYWORD_GROUPS) {
    if (group.some((term) => out.has(normalize(term)))) {
      for (const term of group) out.add(normalize(term));
    }
  }
  return out;
}

function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase().trim();
}
