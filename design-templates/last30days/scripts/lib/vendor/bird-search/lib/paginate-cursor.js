export async function paginateCursor(opts) {
    const { maxPages, pageDelayMs = 1000 } = opts;
    const seen = new Set();
    const items = [];
    let cursor = opts.cursor;
    let pagesFetched = 0;
    while (true) {
        if (pagesFetched > 0 && pageDelayMs > 0) {
            await opts.sleep(pageDelayMs);
        }
        const page = await opts.fetchPage(cursor);
        if (!page.success) {
            if (items.length > 0) {
                return { success: false, error: page.error, items, nextCursor: cursor };
            }
            return page;
        }
        pagesFetched += 1;
        for (const item of page.items) {
            const key = opts.getKey(item);
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            items.push(item);
        }
        const pageCursor = page.cursor;
        if (!pageCursor || pageCursor === cursor) {
            return { success: true, items, nextCursor: undefined };
        }
        if (maxPages !== undefined && pagesFetched >= maxPages) {
            return { success: true, items, nextCursor: pageCursor };
        }
        cursor = pageCursor;
    }
}
//# sourceMappingURL=paginate-cursor.js.map