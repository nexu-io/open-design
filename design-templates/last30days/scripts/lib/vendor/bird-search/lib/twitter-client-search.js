import { TWITTER_API_BASE } from './twitter-client-constants.js';
import { buildSearchFeatures } from './twitter-client-features.js';
import { extractCursorFromInstructions, parseTweetsFromInstructions } from './twitter-client-utils.js';
const RAW_QUERY_MISSING_REGEX = /must be defined/i;
function isQueryIdMismatch(payload) {
    try {
        const parsed = JSON.parse(payload);
        return (parsed.errors?.some((error) => {
            if (error?.extensions?.code === 'GRAPHQL_VALIDATION_FAILED') {
                return true;
            }
            if (error?.path?.includes('rawQuery') && RAW_QUERY_MISSING_REGEX.test(error.message ?? '')) {
                return true;
            }
            return false;
        }) ?? false);
    }
    catch {
        return false;
    }
}
export function withSearch(Base) {
    class TwitterClientSearch extends Base {
        // biome-ignore lint/complexity/noUselessConstructor lint/suspicious/noExplicitAny: TS mixin constructor requirement.
        constructor(...args) {
            super(...args);
        }
        /**
         * Search for tweets matching a query
         */
        async search(query, count = 20, options = {}) {
            return this.searchPaged(query, count, options);
        }
        /**
         * Get all search results (paged)
         */
        async getAllSearchResults(query, options) {
            return this.searchPaged(query, Number.POSITIVE_INFINITY, options);
        }
        async searchPaged(query, limit, options = {}) {
            const features = buildSearchFeatures();
            const pageSize = 20;
            const seen = new Set();
            const tweets = [];
            let cursor = options.cursor;
            let nextCursor;
            let pagesFetched = 0;
            const { includeRaw = false, maxPages } = options;
            const fetchPage = async (pageCount, pageCursor) => {
                let lastError;
                let had404 = false;
                const queryIds = await this.getSearchTimelineQueryIds();
                for (const queryId of queryIds) {
                    const variables = {
                        rawQuery: query,
                        count: pageCount,
                        querySource: 'typed_query',
                        product: 'Latest',
                        ...(pageCursor ? { cursor: pageCursor } : {}),
                    };
                    const params = new URLSearchParams({
                        variables: JSON.stringify(variables),
                    });
                    const url = `${TWITTER_API_BASE}/${queryId}/SearchTimeline?${params.toString()}`;
                    try {
                        const response = await this.fetchWithTimeout(url, {
                            method: 'POST',
                            headers: this.getHeaders(),
                            body: JSON.stringify({ features, queryId }),
                        });
                        if (response.status === 404) {
                            had404 = true;
                            lastError = `HTTP ${response.status}`;
                            continue;
                        }
                        if (!response.ok) {
                            const text = await response.text();
                            const shouldRefreshQueryIds = (response.status === 400 || response.status === 422) && isQueryIdMismatch(text);
                            return {
                                success: false,
                                error: `HTTP ${response.status}: ${text.slice(0, 200)}`,
                                had404: had404 || shouldRefreshQueryIds,
                            };
                        }
                        const data = (await response.json());
                        if (data.errors && data.errors.length > 0) {
                            const shouldRefreshQueryIds = data.errors.some((error) => error?.extensions?.code === 'GRAPHQL_VALIDATION_FAILED');
                            return {
                                success: false,
                                error: data.errors.map((e) => e.message).join(', '),
                                had404: had404 || shouldRefreshQueryIds,
                            };
                        }
                        const instructions = data.data?.search_by_raw_query?.search_timeline?.timeline?.instructions;
                        const pageTweets = parseTweetsFromInstructions(instructions, { quoteDepth: this.quoteDepth, includeRaw });
                        const nextCursor = extractCursorFromInstructions(instructions);
                        return { success: true, tweets: pageTweets, cursor: nextCursor, had404 };
                    }
                    catch (error) {
                        lastError = error instanceof Error ? error.message : String(error);
                    }
                }
                return { success: false, error: lastError ?? 'Unknown error fetching search results', had404 };
            };
            const fetchWithRefresh = async (pageCount, pageCursor) => {
                const firstAttempt = await fetchPage(pageCount, pageCursor);
                if (firstAttempt.success) {
                    return firstAttempt;
                }
                if (firstAttempt.had404) {
                    await this.refreshQueryIds();
                    const secondAttempt = await fetchPage(pageCount, pageCursor);
                    if (secondAttempt.success) {
                        return secondAttempt;
                    }
                    return { success: false, error: secondAttempt.error };
                }
                return { success: false, error: firstAttempt.error };
            };
            const unlimited = limit === Number.POSITIVE_INFINITY;
            while (unlimited || tweets.length < limit) {
                const pageCount = unlimited ? pageSize : Math.min(pageSize, limit - tweets.length);
                const page = await fetchWithRefresh(pageCount, cursor);
                if (!page.success) {
                    return { success: false, error: page.error };
                }
                pagesFetched += 1;
                let added = 0;
                for (const tweet of page.tweets) {
                    if (seen.has(tweet.id)) {
                        continue;
                    }
                    seen.add(tweet.id);
                    tweets.push(tweet);
                    added += 1;
                    if (!unlimited && tweets.length >= limit) {
                        break;
                    }
                }
                const pageCursor = page.cursor;
                if (!pageCursor || pageCursor === cursor || page.tweets.length === 0 || added === 0) {
                    nextCursor = undefined;
                    break;
                }
                if (maxPages && pagesFetched >= maxPages) {
                    nextCursor = pageCursor;
                    break;
                }
                cursor = pageCursor;
                nextCursor = pageCursor;
            }
            return { success: true, tweets, nextCursor };
        }
    }
    return TwitterClientSearch;
}
//# sourceMappingURL=twitter-client-search.js.map