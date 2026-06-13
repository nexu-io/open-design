// biome-ignore lint/correctness/useImportExtensions: JSON module import doesn't use .js extension.
import queryIds from './query-ids.json' with { type: 'json' };
export const TWITTER_API_BASE = 'https://x.com/i/api/graphql';
export const TWITTER_GRAPHQL_POST_URL = 'https://x.com/i/api/graphql';
export const TWITTER_UPLOAD_URL = 'https://upload.twitter.com/i/media/upload.json';
export const TWITTER_MEDIA_METADATA_URL = 'https://x.com/i/api/1.1/media/metadata/create.json';
export const TWITTER_STATUS_UPDATE_URL = 'https://x.com/i/api/1.1/statuses/update.json';
export const SETTINGS_SCREEN_NAME_REGEX = /"screen_name":"([^"]+)"/;
export const SETTINGS_USER_ID_REGEX = /"user_id"\s*:\s*"(\d+)"/;
export const SETTINGS_NAME_REGEX = /"name":"([^"\\]*(?:\\.[^"\\]*)*)"/;
// Query IDs rotate frequently; the values in query-ids.json are refreshed by
// scripts/update-query-ids.ts. The fallback values keep the client usable if
// the file is missing or incomplete.
export const FALLBACK_QUERY_IDS = {
    CreateTweet: 'TAJw1rBsjAtdNgTdlo2oeg',
    CreateRetweet: 'ojPdsZsimiJrUGLR1sjUtA',
    DeleteRetweet: 'iQtK4dl5hBmXewYZuEOKVw',
    CreateFriendship: '8h9JVdV8dlSyqyRDJEPCsA',
    DestroyFriendship: 'ppXWuagMNXgvzx6WoXBW0Q',
    FavoriteTweet: 'lI07N6Otwv1PhnEgXILM7A',
    UnfavoriteTweet: 'ZYKSe-w7KEslx3JhSIk5LA',
    CreateBookmark: 'aoDbu3RHznuiSkQ9aNM67Q',
    DeleteBookmark: 'Wlmlj2-xzyS1GN3a6cj-mQ',
    TweetDetail: '97JF30KziU00483E_8elBA',
    SearchTimeline: 'M1jEez78PEfVfbQLvlWMvQ',
    UserArticlesTweets: '8zBy9h4L90aDL02RsBcCFg',
    UserTweets: 'Wms1GvIiHXAPBaCr9KblaA',
    Bookmarks: 'RV1g3b8n_SGOHwkqKYSCFw',
    Following: 'BEkNpEt5pNETESoqMsTEGA',
    Followers: 'kuFUYP9eV1FPoEy4N-pi7w',
    Likes: 'JR2gceKucIKcVNB_9JkhsA',
    BookmarkFolderTimeline: 'KJIQpsvxrTfRIlbaRIySHQ',
    ListOwnerships: 'wQcOSjSQ8NtgxIwvYl1lMg',
    ListMemberships: 'BlEXXdARdSeL_0KyKHHvvg',
    ListLatestTweetsTimeline: '2TemLyqrMpTeAmysdbnVqw',
    ListByRestId: 'wXzyA5vM_aVkBL9G8Vp3kw',
    HomeTimeline: 'edseUwk9sP5Phz__9TIRnA',
    HomeLatestTimeline: 'iOEZpOdfekFsxSlPQCQtPg',
    ExploreSidebar: 'lpSN4M6qpimkF4nRFPE3nQ',
    ExplorePage: 'kheAINB_4pzRDqkzG3K-ng',
    GenericTimelineById: 'uGSr7alSjR9v6QJAIaqSKQ',
    TrendHistory: 'Sj4T-jSB9pr0Mxtsc1UKZQ',
    AboutAccountQuery: 'zs_jFPFT78rBpXv9Z3U2YQ',
};
export const QUERY_IDS = {
    ...FALLBACK_QUERY_IDS,
    ...queryIds,
};
export const TARGET_QUERY_ID_OPERATIONS = Object.keys(FALLBACK_QUERY_IDS);
//# sourceMappingURL=twitter-client-constants.js.map