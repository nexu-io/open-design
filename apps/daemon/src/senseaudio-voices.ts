import { createHash } from 'node:crypto';
import { resolveProviderConfig } from './media-config.js';

const SENSEAUDIO_DEFAULT_BASE_URL = 'https://api.senseaudio.cn';
const SENSEAUDIO_VOICE_CACHE_TTL_MS = 10 * 60 * 1000;

export interface SenseAudioPersonaEntry {
  name: string;
  description: string;
  // Map: voice_id -> variant emotion label. Iteration order is the
  // persona's default-first order (Object.keys()[0] is the default
  // voice_id passed to --voice).
  variants: Record<string, string>;
}

export type SenseAudioCatalogue = Record<string, SenseAudioPersonaEntry>;

// Variant-suffix emotion labels are documented at docs.senseaudio.cn but
// NOT returned by /v1/get_voice. This map is the only persona-side
// metadata we add on top of the API response. voice_ids absent from the
// map fall back to "通用" at lookup time.
const VARIANT_LABELS: Record<string, string> = {
  // 亢奋主播
  male_0027_a: '热情介绍', male_0027_b: '卖点解读', male_0027_c: '促销逼单',
  // 可靠青叔
  male_0028_a: '内容剖析', male_0028_b: '开场介绍', male_0028_c: '广告中插',
  male_0028_d: '轻松铺陈', male_0028_e: '细心提问', male_0028_f: '主题升华',
  // 利落青年
  male_0029_a: '内容剖析', male_0029_b: '开场介绍', male_0029_c: '广告中插',
  male_0029_d: '轻松铺陈', male_0029_e: '细心提问', male_0029_f: '主题升华',
  // 青春女声
  female_0036_a: '内容剖析', female_0036_b: '开场介绍', female_0036_c: '广告中插',
  female_0036_d: '轻松铺陈', female_0036_e: '细心提问', female_0036_f: '主题升华',
  // 知心少女
  female_0035_a: '内容剖析', female_0035_b: '开场介绍', female_0035_c: '广告中插',
  female_0035_d: '轻松铺陈', female_0035_e: '细心提问', female_0035_f: '主题升华',
  // 亲切女孩
  female_0038_a: '平稳通用', female_0038_b: '温柔讲解', female_0038_c: '致歉安慰',
  female_0038_d: '严肃告知', female_0038_e: '清晰播报', female_0038_f: '耐心关怀',
  // 自然少女
  female_0037_a: '劝导', female_0037_b: '委屈', female_0037_c: '温柔',
  female_0037_d: '严肃', female_0037_e: '平稳',
  // 嗲嗲台妹
  female_0033_a: '平稳', female_0033_b: '开心', female_0033_c: '撒娇',
  female_0033_d: '低落', female_0033_e: '委屈', female_0033_f: '生气',
  // 魅力姐姐
  female_0027_a: '平稳', female_0027_b: '撒娇', female_0027_c: '病娇',
  female_0027_d: '低落', female_0027_e: '妩媚', female_0027_f: '傲娇',
  // 乐观少年
  male_0026_a: '平稳', male_0026_b: '开心', male_0026_c: '深情',
  // 气质学姐
  female_0008_a: '生气', female_0008_b: '开心', female_0008_c: '平稳',
  // 温柔霸总
  male_0025_a: '平稳', male_0025_b: '严肃', male_0025_c: '深情',
  // 风流浪子
  male_0014_a: '开心', male_0014_b: '平稳', male_0014_c: '低落',
  // 柔弱公子
  male_0021_a: '平稳', male_0021_b: '低落', male_0021_c: '开心',
  male_0021_d: '生气', male_0021_e: '深情',
  // 森系少女
  female_0018_a: '害羞', female_0018_b: '开心',
  // 俏皮女孩
  female_0016_a: '开心', female_0016_b: '低落', female_0016_c: '傲娇',
  // 哭泣少女
  female_0015_a: '低落', female_0015_b: '生气',
  // 羞涩甜妹
  female_0023_a: '平稳', female_0023_b: '开心', female_0023_c: '傲娇',
  // 冷酷少女
  female_0017_a: '傲娇', female_0017_b: '平稳', female_0017_c: '低落',
  // 可爱萌娃
  child_0001_a: '开心', child_0001_b: '平稳',
};

const FALLBACK_VARIANT_LABEL = '通用';

interface RawVoice {
  voice_id: string;
  voice_name: string;
  description: string;
}

type CacheEntry = { expiresAt: number; catalogue: SenseAudioCatalogue };
const cache = new Map<string, CacheEntry>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function asDescription(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(asString).filter(Boolean).join(' / ').replace(/\s+/g, ' ');
  }
  return asString(value).replace(/\s+/g, ' ');
}

function cacheKey(projectRoot: string, baseUrl: string, apiKey: string): string {
  const fingerprint = createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
  return [projectRoot, baseUrl, fingerprint].join('\0');
}

function cloneCatalogue(catalogue: SenseAudioCatalogue): SenseAudioCatalogue {
  const out: SenseAudioCatalogue = {};
  for (const [key, entry] of Object.entries(catalogue)) {
    out[key] = { ...entry, variants: { ...entry.variants } };
  }
  return out;
}

function stripSuffix(voiceId: string): string {
  // "male_0028_a" -> "male_0028"; ids without a `_X` tail return unchanged.
  return voiceId.replace(/_[a-z]$/i, '');
}

function flattenApiVoices(payload: unknown): RawVoice[] {
  if (!isRecord(payload)) return [];
  const out: RawVoice[] = [];
  for (const key of ['system_voice', 'voice_cloning', 'voice_generation']) {
    const arr = payload[key];
    if (!Array.isArray(arr)) continue;
    for (const entry of arr) {
      if (!isRecord(entry)) continue;
      const voiceId = asString(entry.voice_id);
      if (!voiceId) continue;
      out.push({
        voice_id: voiceId,
        voice_name: asString(entry.voice_name),
        description: asDescription(entry.description),
      });
    }
  }
  return out;
}

export function shapeCatalogue(rawVoices: RawVoice[]): SenseAudioCatalogue {
  // Defensive: only operate on voices with a non-empty voice_id. Group
  // by voice_name (API's truth for persona identity); voices missing a
  // voice_name fall back to bucketing under their voice_id so they
  // still surface.
  const usable = rawVoices.filter((v) => v.voice_id);
  const byPersona = new Map<string, RawVoice[]>();
  for (const voice of usable) {
    const key = voice.voice_name || voice.voice_id;
    const bucket = byPersona.get(key);
    if (bucket) bucket.push(voice);
    else byPersona.set(key, [voice]);
  }

  // Count distinct personas per prefix to detect collisions like
  // female_0030_* (each suffix is its own persona). Collisions get
  // keyed by full voice_id; everything else by the shared prefix.
  const prefixUses = new Map<string, number>();
  for (const [, voices] of byPersona) {
    const first = voices[0];
    if (!first) continue;
    const prefix = stripSuffix(first.voice_id);
    prefixUses.set(prefix, (prefixUses.get(prefix) ?? 0) + 1);
  }

  const catalogue: SenseAudioCatalogue = {};
  for (const [, voices] of byPersona) {
    if (voices.length === 0) continue;
    const sorted = [...voices].sort((a, b) => a.voice_id.localeCompare(b.voice_id));
    const first = sorted[0]!;
    const prefix = stripSuffix(first.voice_id);
    const collides = (prefixUses.get(prefix) ?? 0) > 1;
    const key = collides ? first.voice_id : prefix;
    const variants: Record<string, string> = {};
    for (const v of sorted) {
      variants[v.voice_id] = VARIANT_LABELS[v.voice_id] ?? FALLBACK_VARIANT_LABEL;
    }
    catalogue[key] = {
      name: first.voice_name || first.voice_id,
      description: first.description,
      variants,
    };
  }
  return catalogue;
}

export async function listSenseAudioCatalogue(
  projectRoot: string,
): Promise<SenseAudioCatalogue> {
  const credentials = await resolveProviderConfig(projectRoot, 'senseaudio');
  if (!credentials.apiKey) {
    throw new Error(
      'no SenseAudio API key — configure it in Settings or set OD_SENSEAUDIO_API_KEY',
    );
  }
  const baseUrl = (credentials.baseUrl || SENSEAUDIO_DEFAULT_BASE_URL).replace(/\/$/, '');
  const key = cacheKey(projectRoot, baseUrl, credentials.apiKey);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cloneCatalogue(cached.catalogue);

  const resp = await fetch(`${baseUrl}/v1/get_voice`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${credentials.apiKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ voice_type: 'all' }),
  });
  const respText = await resp.text();
  if (!resp.ok) {
    throw new Error(`senseaudio voices ${resp.status}: ${respText.slice(0, 240)}`);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(respText);
  } catch {
    throw new Error(`senseaudio voices non-JSON: ${respText.slice(0, 200)}`);
  }
  // HTTP 200 with a non-zero base_resp.status_code is still a logical
  // failure (auth, quota, …). Same envelope contract as
  // renderSenseAudioTTS in media.ts.
  if (isRecord(payload) && isRecord(payload.base_resp)) {
    const statusCode = Number(payload.base_resp.status_code ?? 0);
    if (statusCode !== 0) {
      const statusMsg = asString(payload.base_resp.status_msg) || 'unknown';
      throw new Error(`senseaudio voices api error ${statusCode}: ${statusMsg}`);
    }
  }

  // Shaping is wrapped in a try so an unexpected payload (missing arrays,
  // renamed keys, etc.) does not crash the caller — at worst we return
  // an empty catalogue and the prompt falls back to the error path.
  let catalogue: SenseAudioCatalogue = {};
  try {
    catalogue = shapeCatalogue(flattenApiVoices(payload));
  } catch (err) {
    console.warn('[senseaudio] catalogue shaping failed:', err);
  }
  cache.set(key, {
    expiresAt: now + SENSEAUDIO_VOICE_CACHE_TTL_MS,
    catalogue: cloneCatalogue(catalogue),
  });
  return catalogue;
}
