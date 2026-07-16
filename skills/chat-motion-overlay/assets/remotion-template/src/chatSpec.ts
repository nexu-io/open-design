export const chatSpec = {
  title: "聊天记录",
  timestamp: "今天",
  durationInFrames: 90,
  timing: {"start": 15, "gap": 18, "hold": 36},
  sceneConfig: {
    "container": "wechat",
    "avatarMode": "preset",
    "deviceFrame": "iphone-dynamic-island",
    "nicknameMode": "hidden",
    "deliveryFormat": "mov",
    "output": "mov-alpha",
    "showTimestamp": true
  },
  participants: [],
  messages: []
} as const;
