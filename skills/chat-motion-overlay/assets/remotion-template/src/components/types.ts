export type AvatarKey =
  | "female-bunny-pink"
  | "female-cat-orange"
  | "female-fox-yellow"
  | "male-bear-mint"
  | "male-penguin-blue"
  | "male-koala-lilac";

export type ChatSpec = {
  title: string;
  timestamp: string;
  durationInFrames: number;
  timing: {start: number; gap: number; hold: number};
  sceneConfig: {
    container: "none" | "wechat" | "telegram" | "messenger";
    avatarMode: "preset" | "upload" | "mixed";
    deviceFrame: "none" | "iphone-dynamic-island";
    nicknameMode: "hidden" | "first-message-only" | "always";
    deliveryFormat: "mov" | "webm" | "json" | "remotion" | "hyperframe" | "preview";
    output: "mov-alpha" | "webm-alpha" | "json-spec" | "remotion-component" | "hyperframe-ready" | "preview-only";
    showTimestamp: boolean;
  };
  participants: ReadonlyArray<{id: string; name: string; side: "left" | "right"; avatarKey: AvatarKey | string; uploadAsset?: string | null}>;
  messages: ReadonlyArray<{
    id: string;
    speaker: string;
    text: string;
    side: "left" | "right";
    avatarKey: AvatarKey | string;
    appearAt: number;
    highlight?: boolean;
  }>;
};
