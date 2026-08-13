export type ReleaseFeishuBot = {
  signSecret: string;
  webhook: string;
};

export function decodeReleaseFeishuBot(value: string): ReleaseFeishuBot | null {
  if (value.trim().length === 0) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(value) as unknown;
  } catch {
    throw new Error('release Feishu bot must use JSON tuple codec ["v1","webhook","sign-secret"]');
  }
  if (
    !Array.isArray(decoded)
    || decoded.length !== 3
    || decoded[0] !== "v1"
    || typeof decoded[1] !== "string"
    || typeof decoded[2] !== "string"
  ) throw new Error('release Feishu bot must use JSON tuple codec ["v1","webhook","sign-secret"]');
  const parsed = new URL(decoded[1]);
  const isFeishu = parsed.protocol === "https:"
    && ["open.feishu.cn", "open.larksuite.com"].includes(parsed.hostname)
    && /^\/open-apis\/bot\/v2\/hook\/[A-Za-z0-9_-]+$/u.test(parsed.pathname);
  const isLoopbackFixture = parsed.protocol === "http:"
    && ["127.0.0.1", "localhost"].includes(parsed.hostname);
  if (!isFeishu && !isLoopbackFixture) {
    throw new Error("release Feishu bot webhook must be a Feishu/Lark custom-bot v2 hook URL");
  }
  return { signSecret: decoded[2], webhook: parsed.toString() };
}
