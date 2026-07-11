import React, {type ReactNode} from "react";

export const DeviceFrame = ({children}: {children: ReactNode}) => {
  return (
    <div
      style={{
        width: 820,
        height: 1660,
        borderRadius: 88,
        background: "#101516",
        padding: 20,
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 22,
          left: "50%",
          transform: "translateX(-50%)",
          width: 180,
          height: 42,
          borderRadius: 999,
          background: "#070909",
          zIndex: 4,
        }}
      />
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 70,
          overflow: "hidden",
          background: "transparent",
        }}
      >
        {children}
      </div>
    </div>
  );
};
