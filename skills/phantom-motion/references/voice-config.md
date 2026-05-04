# TTS 声音配置参考

## Gemini 3.1 Flash TTS Preview

### API Endpoint
```
POST https://generativelanguage.googleapis.com/v1alpha/models/gemini-3.1-flash-tts-preview:generateContent?key={API_KEY}
```

### 推荐声音配置

| 声音 ID | 性别 | 特点 | 推荐场景 |
|---------|------|------|---------|
| Fenrir | 男声 | 低沉浑厚，沉稳有力 | 纪录片解说、科技讲解 |
| Aoede | 女声 | 温柔优雅，知性亲切 | 科普教育、生活方式 |
| Puck | 男声 | 清晰明亮，年轻活力 | 快节奏内容、产品演示 |
| Kore | 女声 | 专业沉着，权威感 | 商业报告、新闻播报 |
| Charon | 男声 | 深沉磁性，戏剧感 | 史诗叙事、艺术解析 |
| Leda | 女声 | 柔和流畅，讲故事感 | 故事叙述、人文历史 |

### 解说风格提示词

**纪录片风格（documentary）：**
```
以纪录片解说的方式，语速适中、沉稳有力地朗读以下文本：
```

**科普教育风格（educational）：**
```
以科普教育的方式，生动有趣、娓娓道来地朗读以下文本：
```

**激情演讲风格（passionate）：**
```
以充满感染力的演讲方式，激情澎湃地朗读以下文本：
```

### 请求格式

```json
{
  "contents": [{"parts": [{"text": "{style_prompt}{text}"}]}],
  "generationConfig": {
    "responseModalities": ["AUDIO"],
    "speechConfig": {
      "voiceConfig": {
        "prebuiltVoiceConfig": {"voiceName": "{voice_id}"}
      }
    }
  }
}
```

### 响应处理

- 响应中 `candidates[0].content.parts[0].inlineData.data` 为 Base64 编码的 PCM 音频
- PCM 格式：16-bit mono，采样率 24000Hz
- 需要封装为 WAV 格式：1 channel, 2 bytes sample width, 24000 framerate

### 环境变量

```bash
export GEMINI_API_KEY="your-api-key-here"
```
