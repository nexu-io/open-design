import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
const DEFAULT_CACHE_FILENAME = 'query-ids-cache.json';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DISCOVERY_PAGES = [
    'https://x.com/?lang=en',
    'https://x.com/explore',
    'https://x.com/notifications',
    'https://x.com/settings/profile',
];
const BUNDLE_URL_REGEX = /https:\/\/abs\.twimg\.com\/responsive-web\/client-web(?:-legacy)?\/[A-Za-z0-9.-]+\.js/g;
const QUERY_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const OPERATION_PATTERNS = [
    {
        regex: /e\.exports=\{queryId\s*:\s*["']([^"']+)["']\s*,\s*operationName\s*:\s*["']([^"']+)["']/gs,
        operationGroup: 2,
        queryIdGroup: 1,
    },
    {
        regex: /e\.exports=\{operationName\s*:\s*["']([^"']+)["']\s*,\s*queryId\s*:\s*["']([^"']+)["']/gs,
        operationGroup: 1,
        queryIdGroup: 2,
    },
    {
        regex: /operationName\s*[:=]\s*["']([^"']+)["'](.{0,4000}?)queryId\s*[:=]\s*["']([^"']+)["']/gs,
        operationGroup: 1,
        queryIdGroup: 3,
    },
    {
        regex: /queryId\s*[:=]\s*["']([^"']+)["'](.{0,4000}?)operationName\s*[:=]\s*["']([^"']+)["']/gs,
        operationGroup: 3,
        queryIdGroup: 1,
    },
];
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
};
async function fetchText(fetchImpl, url) {
    const response = await fetchImpl(url, { headers: HEADERS });
    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status} for ${url}: ${body.slice(0, 120)}`);
    }
    return response.text();
}
function resolveDefaultCachePath() {
    const override = process.env.BIRD_QUERY_IDS_CACHE;
    if (override && override.trim().length > 0) {
        return path.resolve(override.trim());
    }
    return path.join(homedir(), '.config', 'bird', DEFAULT_CACHE_FILENAME);
}
function parseSnapshot(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const record = raw;
    const fetchedAt = typeof record.fetchedAt === 'string' ? record.fetchedAt : null;
    const ttlMs = typeof record.ttlMs === 'number' && Number.isFinite(record.ttlMs) ? record.ttlMs : null;
    const ids = record.ids && typeof record.ids === 'object' ? record.ids : null;
    const discovery = record.discovery && typeof record.discovery === 'object' ? record.discovery : null;
    if (!fetchedAt || !ttlMs || !ids || !discovery) {
        return null;
    }
    const pages = Array.isArray(discovery.pages) ? discovery.pages : null;
    const bundles = Array.isArray(discovery.bundles) ? discovery.bundles : null;
    if (!pages || !bundles) {
        return null;
    }
    const normalizedIds = {};
    for (const [key, value] of Object.entries(ids)) {
        if (typeof value === 'string' && value.trim().length > 0) {
            normalizedIds[key] = value.trim();
        }
    }
    return {
        fetchedAt,
        ttlMs,
        ids: normalizedIds,
        discovery: {
            pages: pages.filter((p) => typeof p === 'string'),
            bundles: bundles.filter((b) => typeof b === 'string'),
        },
    };
}
async function readSnapshotFromDisk(cachePath) {
    try {
        const raw = await readFile(cachePath, 'utf8');
        return parseSnapshot(JSON.parse(raw));
    }
    catch {
        return null;
    }
}
async function writeSnapshotToDisk(cachePath, snapshot) {
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(cachePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}
async function discoverBundles(fetchImpl) {
    const bundles = new Set();
    for (const page of DISCOVERY_PAGES) {
        try {
            const html = await fetchText(fetchImpl, page);
            for (const match of html.matchAll(BUNDLE_URL_REGEX)) {
                bundles.add(match[0]);
            }
        }
        catch {
            // ignore discovery page failures; other pages often work
        }
    }
    const discovered = [...bundles];
    if (discovered.length === 0) {
        throw new Error('No client bundles discovered; x.com layout may have changed.');
    }
    return discovered;
}
function extractOperations(bundleContents, bundleLabel, targets, discovered) {
    for (const pattern of OPERATION_PATTERNS) {
        pattern.regex.lastIndex = 0;
        while (true) {
            const match = pattern.regex.exec(bundleContents);
            if (match === null) {
                break;
            }
            const operationName = match[pattern.operationGroup];
            const queryId = match[pattern.queryIdGroup];
            if (!operationName || !queryId) {
                continue;
            }
            if (!targets.has(operationName)) {
                continue;
            }
            if (!QUERY_ID_REGEX.test(queryId)) {
                continue;
            }
            if (discovered.has(operationName)) {
                continue;
            }
            discovered.set(operationName, { queryId, bundle: bundleLabel });
            if (discovered.size === targets.size) {
                return;
            }
        }
    }
}
async function fetchAndExtract(fetchImpl, bundleUrls, targets) {
    const discovered = new Map();
    const CONCURRENCY = 6;
    for (let i = 0; i < bundleUrls.length; i += CONCURRENCY) {
        const chunk = bundleUrls.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map(async (url) => {
            if (discovered.size === targets.size) {
                return;
            }
            const label = url.split('/').at(-1) ?? url;
            try {
                const js = await fetchText(fetchImpl, url);
                extractOperations(js, label, targets, discovered);
            }
            catch {
                // ignore failed bundles
            }
        }));
        if (discovered.size === targets.size) {
            break;
        }
    }
    return discovered;
}
export function createRuntimeQueryIdStore(options = {}) {
    const fetchImpl = options.fetchImpl ?? fetch;
    const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    const cachePath = options.cachePath ? path.resolve(options.cachePath) : resolveDefaultCachePath();
    let memorySnapshot = null;
    let loadOnce = null;
    let refreshInFlight = null;
    const loadSnapshot = async () => {
        if (memorySnapshot) {
            return memorySnapshot;
        }
        if (!loadOnce) {
            loadOnce = (async () => {
                const fromDisk = await readSnapshotFromDisk(cachePath);
                memorySnapshot = fromDisk;
                return fromDisk;
            })();
        }
        return loadOnce;
    };
    const getSnapshotInfo = async () => {
        const snapshot = await loadSnapshot();
        if (!snapshot) {
            return null;
        }
        const fetchedAtMs = new Date(snapshot.fetchedAt).getTime();
        const ageMs = Number.isFinite(fetchedAtMs) ? Math.max(0, Date.now() - fetchedAtMs) : Number.POSITIVE_INFINITY;
        const effectiveTtl = Number.isFinite(snapshot.ttlMs) ? snapshot.ttlMs : ttlMs;
        const isFresh = ageMs <= effectiveTtl;
        return { snapshot, cachePath, ageMs, isFresh };
    };
    const getQueryId = async (operationName) => {
        const info = await getSnapshotInfo();
        if (!info) {
            return null;
        }
        return info.snapshot.ids[operationName] ?? null;
    };
    const refresh = async (operationNames, opts = {}) => {
        if (refreshInFlight) {
            return refreshInFlight;
        }
        refreshInFlight = (async () => {
            const current = await getSnapshotInfo();
            if (!opts.force && current?.isFresh) {
                return current;
            }
            const targets = new Set(operationNames);
            const bundleUrls = await discoverBundles(fetchImpl);
            const discovered = await fetchAndExtract(fetchImpl, bundleUrls, targets);
            if (discovered.size === 0) {
                return current ?? null;
            }
            const ids = {};
            for (const name of operationNames) {
                const entry = discovered.get(name);
                if (entry?.queryId) {
                    ids[name] = entry.queryId;
                }
            }
            const snapshot = {
                fetchedAt: new Date().toISOString(),
                ttlMs,
                ids,
                discovery: {
                    pages: [...DISCOVERY_PAGES],
                    bundles: bundleUrls.map((url) => url.split('/').at(-1) ?? url),
                },
            };
            await writeSnapshotToDisk(cachePath, snapshot);
            memorySnapshot = snapshot;
            return getSnapshotInfo();
        })().finally(() => {
            refreshInFlight = null;
        });
        return refreshInFlight;
    };
    return {
        cachePath,
        ttlMs,
        getSnapshotInfo,
        getQueryId,
        refresh,
        clearMemory() {
            memorySnapshot = null;
            loadOnce = null;
        },
    };
}
export const runtimeQueryIds = createRuntimeQueryIdStore();
//# sourceMappingURL=runtime-query-ids.js.map