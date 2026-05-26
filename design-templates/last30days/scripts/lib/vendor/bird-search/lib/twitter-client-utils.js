export function normalizeQuoteDepth(value) {
    if (value === undefined || value === null) {
        return 1;
    }
    if (!Number.isFinite(value)) {
        return 1;
    }
    return Math.max(0, Math.floor(value));
}
export function firstText(...values) {
    for (const value of values) {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed) {
                return trimmed;
            }
        }
    }
    return undefined;
}
export function collectTextFields(value, keys, output) {
    if (!value) {
        return;
    }
    if (typeof value === 'string') {
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            collectTextFields(item, keys, output);
        }
        return;
    }
    if (typeof value === 'object') {
        for (const [key, nested] of Object.entries(value)) {
            if (keys.has(key)) {
                if (typeof nested === 'string') {
                    const trimmed = nested.trim();
                    if (trimmed) {
                        output.push(trimmed);
                    }
                    continue;
                }
            }
            collectTextFields(nested, keys, output);
        }
    }
}
export function uniqueOrdered(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
        if (seen.has(value)) {
            continue;
        }
        seen.add(value);
        result.push(value);
    }
    return result;
}
/**
 * Renders a Draft.js content_state into readable markdown/text format.
 * Handles blocks (paragraphs, headers, lists) and entities (code blocks, links, tweets, dividers).
 */
export function renderContentState(contentState) {
    if (!contentState?.blocks || contentState.blocks.length === 0) {
        return undefined;
    }
    // Build entity lookup map from array/object formats
    const entityMap = new Map();
    const rawEntityMap = contentState.entityMap ?? [];
    if (Array.isArray(rawEntityMap)) {
        for (const entry of rawEntityMap) {
            const key = Number.parseInt(entry.key, 10);
            if (!Number.isNaN(key)) {
                entityMap.set(key, entry.value);
            }
        }
    }
    else {
        for (const [key, value] of Object.entries(rawEntityMap)) {
            const keyNumber = Number.parseInt(key, 10);
            if (!Number.isNaN(keyNumber)) {
                entityMap.set(keyNumber, value);
            }
        }
    }
    const outputLines = [];
    let orderedListCounter = 0;
    let previousBlockType;
    for (const block of contentState.blocks) {
        // Reset ordered list counter when leaving ordered list context
        if (block.type !== 'ordered-list-item' && previousBlockType === 'ordered-list-item') {
            orderedListCounter = 0;
        }
        switch (block.type) {
            case 'unstyled': {
                // Plain paragraph - just output text with any inline formatting
                const text = renderBlockText(block, entityMap);
                if (text) {
                    outputLines.push(text);
                }
                break;
            }
            case 'header-one': {
                const text = renderBlockText(block, entityMap);
                if (text) {
                    outputLines.push(`# ${text}`);
                }
                break;
            }
            case 'header-two': {
                const text = renderBlockText(block, entityMap);
                if (text) {
                    outputLines.push(`## ${text}`);
                }
                break;
            }
            case 'header-three': {
                const text = renderBlockText(block, entityMap);
                if (text) {
                    outputLines.push(`### ${text}`);
                }
                break;
            }
            case 'unordered-list-item': {
                const text = renderBlockText(block, entityMap);
                if (text) {
                    outputLines.push(`- ${text}`);
                }
                break;
            }
            case 'ordered-list-item': {
                orderedListCounter++;
                const text = renderBlockText(block, entityMap);
                if (text) {
                    outputLines.push(`${orderedListCounter}. ${text}`);
                }
                break;
            }
            case 'blockquote': {
                const text = renderBlockText(block, entityMap);
                if (text) {
                    outputLines.push(`> ${text}`);
                }
                break;
            }
            case 'atomic': {
                // Atomic blocks are placeholders for embedded entities
                const entityContent = renderAtomicBlock(block, entityMap);
                if (entityContent) {
                    outputLines.push(entityContent);
                }
                break;
            }
            default: {
                // Fallback: just output the text
                const text = renderBlockText(block, entityMap);
                if (text) {
                    outputLines.push(text);
                }
            }
        }
        previousBlockType = block.type;
    }
    const result = outputLines.join('\n\n');
    return result.trim() || undefined;
}
/**
 * Renders text content of a block, applying inline link entities.
 */
function renderBlockText(block, entityMap) {
    let text = block.text;
    // Handle LINK entities by appending URL in markdown format
    // Process in reverse order to not mess up offsets
    const linkRanges = (block.entityRanges ?? [])
        .filter((range) => {
        const entity = entityMap.get(range.key);
        return entity?.type === 'LINK' && entity.data.url;
    })
        .sort((a, b) => b.offset - a.offset);
    for (const range of linkRanges) {
        const entity = entityMap.get(range.key);
        if (entity?.data.url) {
            const linkText = text.slice(range.offset, range.offset + range.length);
            const markdownLink = `[${linkText}](${entity.data.url})`;
            text = text.slice(0, range.offset) + markdownLink + text.slice(range.offset + range.length);
        }
    }
    return text.trim();
}
/**
 * Renders an atomic block by looking up its entity and returning appropriate content.
 */
function renderAtomicBlock(block, entityMap) {
    const entityRanges = block.entityRanges ?? [];
    if (entityRanges.length === 0) {
        return undefined;
    }
    const entityKey = entityRanges[0].key;
    const entity = entityMap.get(entityKey);
    if (!entity) {
        return undefined;
    }
    switch (entity.type) {
        case 'MARKDOWN':
            // Code blocks and other markdown content - output as-is
            return entity.data.markdown?.trim();
        case 'DIVIDER':
            return '---';
        case 'TWEET':
            if (entity.data.tweetId) {
                return `[Embedded Tweet: https://x.com/i/status/${entity.data.tweetId}]`;
            }
            return undefined;
        case 'LINK':
            if (entity.data.url) {
                return `[Link: ${entity.data.url}]`;
            }
            return undefined;
        case 'IMAGE':
            // Images in atomic blocks - could extract URL if available
            return '[Image]';
        default:
            return undefined;
    }
}
export function extractArticleText(result) {
    const article = result?.article;
    if (!article) {
        return undefined;
    }
    const articleResult = article.article_results?.result ?? article;
    if (process.env.BIRD_DEBUG_ARTICLE === '1') {
        console.error('[bird][debug][article] payload:', JSON.stringify({
            rest_id: result?.rest_id,
            article: articleResult,
            note_tweet: result?.note_tweet?.note_tweet_results?.result ?? null,
        }, null, 2));
    }
    const title = firstText(articleResult.title, article.title);
    // Try to render from rich content_state first (Draft.js format with blocks + entityMap)
    // This preserves code blocks, embedded tweets, markdown, etc.
    const contentState = article.article_results?.result?.content_state;
    const richBody = renderContentState(contentState);
    if (richBody) {
        // Rich content found - prepend title if not already included
        if (title) {
            const normalizedTitle = title.trim();
            const trimmedBody = richBody.trimStart();
            const headingMatches = [`# ${normalizedTitle}`, `## ${normalizedTitle}`, `### ${normalizedTitle}`];
            const hasTitle = trimmedBody === normalizedTitle ||
                trimmedBody.startsWith(`${normalizedTitle}\n`) ||
                headingMatches.some((heading) => trimmedBody.startsWith(heading));
            if (!hasTitle) {
                return `${title}\n\n${richBody}`;
            }
        }
        return richBody;
    }
    // Fallback to plain text extraction for articles without rich content_state
    let body = firstText(articleResult.plain_text, article.plain_text, articleResult.body?.text, articleResult.body?.richtext?.text, articleResult.body?.rich_text?.text, articleResult.content?.text, articleResult.content?.richtext?.text, articleResult.content?.rich_text?.text, articleResult.text, articleResult.richtext?.text, articleResult.rich_text?.text, article.body?.text, article.body?.richtext?.text, article.body?.rich_text?.text, article.content?.text, article.content?.richtext?.text, article.content?.rich_text?.text, article.text, article.richtext?.text, article.rich_text?.text);
    if (body && title && body.trim() === title.trim()) {
        body = undefined;
    }
    if (!body) {
        const collected = [];
        collectTextFields(articleResult, new Set(['text', 'title']), collected);
        collectTextFields(article, new Set(['text', 'title']), collected);
        const unique = uniqueOrdered(collected);
        const filtered = title ? unique.filter((value) => value !== title) : unique;
        if (filtered.length > 0) {
            body = filtered.join('\n\n');
        }
    }
    if (title && body && !body.startsWith(title)) {
        return `${title}\n\n${body}`;
    }
    return body ?? title;
}
export function extractNoteTweetText(result) {
    const note = result?.note_tweet?.note_tweet_results?.result;
    if (!note) {
        return undefined;
    }
    return firstText(note.text, note.richtext?.text, note.rich_text?.text, note.content?.text, note.content?.richtext?.text, note.content?.rich_text?.text);
}
export function extractTweetText(result) {
    return extractArticleText(result) ?? extractNoteTweetText(result) ?? firstText(result?.legacy?.full_text);
}
export function extractArticleMetadata(result) {
    const article = result?.article;
    if (!article) {
        return undefined;
    }
    const articleResult = article.article_results?.result ?? article;
    const title = firstText(articleResult.title, article.title);
    if (!title) {
        return undefined;
    }
    // preview_text is available in home timeline responses
    const previewText = firstText(articleResult.preview_text, article.preview_text);
    return { title, previewText };
}
export function extractMedia(result) {
    // Prefer extended_entities (has video info), fall back to entities
    const rawMedia = result?.legacy?.extended_entities?.media ?? result?.legacy?.entities?.media;
    if (!rawMedia || rawMedia.length === 0) {
        return undefined;
    }
    const media = [];
    for (const item of rawMedia) {
        if (!item.type || !item.media_url_https) {
            continue;
        }
        const mediaItem = {
            type: item.type,
            url: item.media_url_https,
        };
        // Get dimensions from largest available size
        const sizes = item.sizes;
        if (sizes?.large) {
            mediaItem.width = sizes.large.w;
            mediaItem.height = sizes.large.h;
        }
        else if (sizes?.medium) {
            mediaItem.width = sizes.medium.w;
            mediaItem.height = sizes.medium.h;
        }
        // For thumbnails/previews
        if (sizes?.small) {
            mediaItem.previewUrl = `${item.media_url_https}:small`;
        }
        // Extract video URL for video/animated_gif
        if ((item.type === 'video' || item.type === 'animated_gif') && item.video_info?.variants) {
            // Prefer highest bitrate MP4, fall back to first MP4 when bitrate is missing.
            const mp4Variants = item.video_info.variants.filter((v) => v.content_type === 'video/mp4' && typeof v.url === 'string');
            const mp4WithBitrate = mp4Variants
                .filter((v) => typeof v.bitrate === 'number')
                .sort((a, b) => b.bitrate - a.bitrate);
            const selectedVariant = mp4WithBitrate[0] ?? mp4Variants[0];
            if (selectedVariant) {
                mediaItem.videoUrl = selectedVariant.url;
            }
            if (typeof item.video_info.duration_millis === 'number') {
                mediaItem.durationMs = item.video_info.duration_millis;
            }
        }
        media.push(mediaItem);
    }
    return media.length > 0 ? media : undefined;
}
export function unwrapTweetResult(result) {
    if (!result) {
        return undefined;
    }
    if (result.tweet) {
        return result.tweet;
    }
    return result;
}
export function mapTweetResult(result, quoteDepthOrOptions) {
    const options = typeof quoteDepthOrOptions === 'number' ? { quoteDepth: quoteDepthOrOptions } : quoteDepthOrOptions;
    const { quoteDepth, includeRaw = false } = options;
    const userResult = result?.core?.user_results?.result;
    const userLegacy = userResult?.legacy;
    const userCore = userResult?.core;
    const username = userLegacy?.screen_name ?? userCore?.screen_name;
    const name = userLegacy?.name ?? userCore?.name ?? username;
    const userId = userResult?.rest_id;
    if (!result?.rest_id || !username) {
        return undefined;
    }
    const text = extractTweetText(result);
    if (!text) {
        return undefined;
    }
    let quotedTweet;
    if (quoteDepth > 0) {
        const quotedResult = unwrapTweetResult(result.quoted_status_result?.result);
        if (quotedResult) {
            quotedTweet = mapTweetResult(quotedResult, { quoteDepth: quoteDepth - 1, includeRaw });
        }
    }
    const media = extractMedia(result);
    const article = extractArticleMetadata(result);
    const tweetData = {
        id: result.rest_id,
        text,
        createdAt: result.legacy?.created_at,
        replyCount: result.legacy?.reply_count,
        retweetCount: result.legacy?.retweet_count,
        likeCount: result.legacy?.favorite_count,
        conversationId: result.legacy?.conversation_id_str,
        inReplyToStatusId: result.legacy?.in_reply_to_status_id_str ?? undefined,
        author: {
            username,
            name: name || username,
        },
        authorId: userId,
        quotedTweet,
        media,
        article,
    };
    if (includeRaw) {
        tweetData._raw = result;
    }
    return tweetData;
}
export function findTweetInInstructions(instructions, tweetId) {
    if (!instructions) {
        return undefined;
    }
    for (const instruction of instructions) {
        for (const entry of instruction.entries || []) {
            const result = entry.content?.itemContent?.tweet_results?.result;
            if (result?.rest_id === tweetId) {
                return result;
            }
        }
    }
    return undefined;
}
export function collectTweetResultsFromEntry(entry) {
    const results = [];
    const pushResult = (result) => {
        if (result?.rest_id) {
            results.push(result);
        }
    };
    const content = entry.content;
    pushResult(content?.itemContent?.tweet_results?.result);
    pushResult(content?.item?.itemContent?.tweet_results?.result);
    for (const item of content?.items ?? []) {
        pushResult(item?.item?.itemContent?.tweet_results?.result);
        pushResult(item?.itemContent?.tweet_results?.result);
        pushResult(item?.content?.itemContent?.tweet_results?.result);
    }
    return results;
}
export function parseTweetsFromInstructions(instructions, quoteDepthOrOptions) {
    const options = typeof quoteDepthOrOptions === 'number' ? { quoteDepth: quoteDepthOrOptions } : quoteDepthOrOptions;
    const { quoteDepth, includeRaw = false } = options;
    const tweets = [];
    const seen = new Set();
    for (const instruction of instructions ?? []) {
        for (const entry of instruction.entries ?? []) {
            const results = collectTweetResultsFromEntry(entry);
            for (const result of results) {
                const mapped = mapTweetResult(result, { quoteDepth, includeRaw });
                if (!mapped || seen.has(mapped.id)) {
                    continue;
                }
                seen.add(mapped.id);
                tweets.push(mapped);
            }
        }
    }
    return tweets;
}
export function extractCursorFromInstructions(instructions, cursorType = 'Bottom') {
    for (const instruction of instructions ?? []) {
        for (const entry of instruction.entries ?? []) {
            const content = entry.content;
            if (content?.cursorType === cursorType && typeof content.value === 'string' && content.value.length > 0) {
                return content.value;
            }
        }
    }
    return undefined;
}
export function parseUsersFromInstructions(instructions) {
    if (!instructions) {
        return [];
    }
    const users = [];
    for (const instruction of instructions) {
        if (!instruction.entries) {
            continue;
        }
        for (const entry of instruction.entries) {
            const content = entry?.content;
            const rawUserResult = content?.itemContent?.user_results?.result;
            const userResult = rawUserResult?.__typename === 'UserWithVisibilityResults' && rawUserResult.user
                ? rawUserResult.user
                : rawUserResult;
            if (!userResult || userResult.__typename !== 'User') {
                continue;
            }
            const legacy = userResult.legacy;
            const core = userResult.core;
            const username = legacy?.screen_name ?? core?.screen_name;
            if (!userResult.rest_id || !username) {
                continue;
            }
            users.push({
                id: userResult.rest_id,
                username,
                name: legacy?.name ?? core?.name ?? username,
                description: legacy?.description,
                followersCount: legacy?.followers_count,
                followingCount: legacy?.friends_count,
                isBlueVerified: userResult.is_blue_verified,
                profileImageUrl: legacy?.profile_image_url_https ?? userResult.avatar?.image_url,
                createdAt: legacy?.created_at ?? core?.created_at,
            });
        }
    }
    return users;
}
//# sourceMappingURL=twitter-client-utils.js.map