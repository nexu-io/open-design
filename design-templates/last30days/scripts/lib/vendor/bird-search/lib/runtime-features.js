import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
// biome-ignore lint/correctness/useImportExtensions: JSON module import doesn't use .js extension.
import defaultOverrides from './features.json' with { type: 'json' };
const DEFAULT_CACHE_FILENAME = 'features.json';
let cachedOverrides = null;
function normalizeFeatureMap(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry === 'boolean') {
            result[key] = entry;
        }
    }
    return result;
}
function normalizeOverrides(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { global: {}, sets: {} };
    }
    const record = value;
    const global = normalizeFeatureMap(record.global);
    const sets = {};
    const rawSets = record.sets && typeof record.sets === 'object' && !Array.isArray(record.sets)
        ? record.sets
        : {};
    for (const [setName, setValue] of Object.entries(rawSets)) {
        const normalized = normalizeFeatureMap(setValue);
        if (Object.keys(normalized).length > 0) {
            sets[setName] = normalized;
        }
    }
    return { global, sets };
}
function mergeOverrides(base, next) {
    const sets = { ...base.sets };
    for (const [setName, overrides] of Object.entries(next.sets)) {
        const existing = sets[setName];
        sets[setName] = existing ? { ...existing, ...overrides } : { ...overrides };
    }
    return {
        global: { ...base.global, ...next.global },
        sets,
    };
}
function toFeatureOverrides(overrides) {
    const result = {};
    if (Object.keys(overrides.global).length > 0) {
        result.global = overrides.global;
    }
    const setEntries = Object.entries(overrides.sets).filter(([, value]) => Object.keys(value).length > 0);
    if (setEntries.length > 0) {
        result.sets = Object.fromEntries(setEntries);
    }
    return result;
}
function resolveFeaturesCachePath() {
    const override = process.env.BIRD_FEATURES_CACHE ?? process.env.BIRD_FEATURES_PATH;
    if (override && override.trim().length > 0) {
        return path.resolve(override.trim());
    }
    return path.join(homedir(), '.config', 'bird', DEFAULT_CACHE_FILENAME);
}
function readOverridesFromFile(cachePath) {
    if (!existsSync(cachePath)) {
        return null;
    }
    try {
        const raw = readFileSync(cachePath, 'utf8');
        return normalizeOverrides(JSON.parse(raw));
    }
    catch {
        return null;
    }
}
function readOverridesFromEnv() {
    const raw = process.env.BIRD_FEATURES_JSON;
    if (!raw || raw.trim().length === 0) {
        return null;
    }
    try {
        return normalizeOverrides(JSON.parse(raw));
    }
    catch {
        return null;
    }
}
function writeOverridesToDisk(cachePath, overrides) {
    const payload = toFeatureOverrides(overrides);
    return mkdir(path.dirname(cachePath), { recursive: true }).then(() => writeFile(cachePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8'));
}
export function loadFeatureOverrides() {
    if (cachedOverrides) {
        return cachedOverrides;
    }
    const base = normalizeOverrides(defaultOverrides);
    const fromFile = readOverridesFromFile(resolveFeaturesCachePath());
    const fromEnv = readOverridesFromEnv();
    let merged = base;
    if (fromFile) {
        merged = mergeOverrides(merged, fromFile);
    }
    if (fromEnv) {
        merged = mergeOverrides(merged, fromEnv);
    }
    cachedOverrides = merged;
    return merged;
}
export function getFeatureOverridesSnapshot() {
    const overrides = toFeatureOverrides(loadFeatureOverrides());
    return {
        cachePath: resolveFeaturesCachePath(),
        overrides,
    };
}
export function applyFeatureOverrides(setName, base) {
    const overrides = loadFeatureOverrides();
    const globalOverrides = overrides.global;
    const setOverrides = overrides.sets[setName];
    if (Object.keys(globalOverrides).length === 0 && (!setOverrides || Object.keys(setOverrides).length === 0)) {
        return base;
    }
    if (setOverrides) {
        return {
            ...base,
            ...globalOverrides,
            ...setOverrides,
        };
    }
    return {
        ...base,
        ...globalOverrides,
    };
}
export async function refreshFeatureOverridesCache() {
    const cachePath = resolveFeaturesCachePath();
    const base = normalizeOverrides(defaultOverrides);
    const fromFile = readOverridesFromFile(cachePath);
    const merged = mergeOverrides(base, fromFile ?? { global: {}, sets: {} });
    await writeOverridesToDisk(cachePath, merged);
    cachedOverrides = null;
    return { cachePath, overrides: toFeatureOverrides(merged) };
}
export function clearFeatureOverridesCache() {
    cachedOverrides = null;
}
//# sourceMappingURL=runtime-features.js.map