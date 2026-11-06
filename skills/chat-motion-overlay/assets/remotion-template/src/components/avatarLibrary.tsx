import React from "react";
import {Img, staticFile} from "remotion";
import type {AvatarKey, ChatSpec} from "./types";

const PRESET_FILES: Record<AvatarKey, string> = {
  "female-bunny-pink": "female-bunny-pink.png",
  "female-cat-orange": "female-cat-orange.png",
  "female-fox-yellow": "female-fox-yellow.png",
  "male-bear-mint": "male-bear-mint.png",
  "male-penguin-blue": "male-penguin-blue.png",
  "male-koala-lilac": "male-koala-lilac.png",
};

export const avatarSrcFor = (participant: ChatSpec["participants"][number]) => {
  if (participant.uploadAsset) return staticFile(participant.uploadAsset);
  const key = (participant.avatarKey in PRESET_FILES ? participant.avatarKey : "female-bunny-pink") as AvatarKey;
  return staticFile(PRESET_FILES[key]);
};

export const AvatarImage = ({
  src,
  size = 62,
}: {
  src: string;
  size?: number;
}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: 18,
      overflow: "hidden",
      flexShrink: 0,
      boxShadow: "0 4px 14px rgba(56,72,92,0.10)",
      border: "1px solid rgba(255,255,255,0.88)",
      background: "#FFFFFF",
    }}
  >
    <Img src={src} style={{width: "100%", height: "100%", objectFit: "cover", display: "block"}} />
  </div>
);
