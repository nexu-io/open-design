import React from "react";
import {AbsoluteFill} from "remotion";
import {BubbleScene} from "./BubbleScene";
import {DeviceFrame} from "./DeviceFrame";
import type {ChatSpec} from "./types";

export const ChatMotionOverlay = ({chatSpec}: {chatSpec: ChatSpec}) => {
  const content = <BubbleScene chatSpec={chatSpec} />;
  const wrapped = chatSpec.sceneConfig.deviceFrame === "iphone-dynamic-island" ? <DeviceFrame>{content}</DeviceFrame> : content;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {wrapped}
    </AbsoluteFill>
  );
};
