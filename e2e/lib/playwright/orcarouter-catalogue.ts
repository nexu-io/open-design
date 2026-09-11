// OrcaRouter chat catalogue — a RECORDED snapshot of the live endpoint.
//
// Captured 2026-09-10 from GET https://api.orcarouter.ai/v1/models?capability=chat
// through the OrcaRouter provider code path (fetchOrcaRouterCatalog ->
// toOrcaRouterModelOptions), then projected onto the picker option shape.
//
// The e2e suite serves this recording instead of hitting the gateway, because
// the repository forbids e2e tests that depend on real provider accounts. The
// rows, their modality metadata, and the counts are the real catalogue's, so the
// option list a test asserts against is the one a user would see.
//
// Regenerate by re-running the capture through the same provider code path
// after a catalogue change; the counts below come from the same capture.

export const ORCAROUTER_CHAT_CATALOGUE = {
  capturedAt: "2026-09-10",
  source: "https://api.orcarouter.ai/v1/models?capability=chat",
  chatCount: 161,
  imageCount: 122,
  models: [
    {
      "id": "orcarouter/free",
      "label": "orcarouter/free"
    },
    {
      "id": "orcarouter/fusion",
      "label": "orcarouter/fusion",
      "metadata": {
        "contextWindowTokens": 1000000
      }
    },
    {
      "id": "orcarouter/fusion-flash",
      "label": "orcarouter/fusion-flash",
      "metadata": {
        "contextWindowTokens": 262144
      }
    },
    {
      "id": "orcarouter/fusion-mini",
      "label": "orcarouter/fusion-mini",
      "metadata": {
        "contextWindowTokens": 1000000
      }
    },
    {
      "id": "orcarouter/orcacode-review",
      "label": "orcarouter/orcacode-review"
    },
    {
      "id": "orcarouter/open-code",
      "label": "orcarouter/open-code"
    },
    {
      "id": "orcarouter/test-cache-glm52-opus",
      "label": "orcarouter/test-cache-glm52-opus"
    },
    {
      "id": "orcarouter/simple-test",
      "label": "orcarouter/simple-test"
    },
    {
      "id": "orcarouter/intco-qa",
      "label": "orcarouter/intco-qa"
    },
    {
      "id": "orcarouter/auto",
      "label": "orcarouter/auto"
    },
    {
      "id": "anthropic/claude-fable-5",
      "label": "Anthropic: Claude Fable 5",
      "metadata": {
        "contextWindowTokens": 1000000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "anthropic/claude-haiku-4.5",
      "label": "Anthropic: Claude Haiku 4.5",
      "metadata": {
        "contextWindowTokens": 200000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "anthropic/claude-opus-4.5",
      "label": "Anthropic: Claude Opus 4.5",
      "metadata": {
        "contextWindowTokens": 200000,
        "inputModalities": [
          "file",
          "image",
          "text"
        ]
      }
    },
    {
      "id": "anthropic/claude-opus-4.6",
      "label": "Anthropic: Claude Opus 4.6",
      "metadata": {
        "contextWindowTokens": 1000000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "anthropic/claude-opus-4.7",
      "label": "Anthropic: Claude Opus 4.7",
      "metadata": {
        "contextWindowTokens": 1000000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "anthropic/claude-opus-4.8",
      "label": "Anthropic: Claude Opus 4.8",
      "metadata": {
        "contextWindowTokens": 1000000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "anthropic/claude-opus-5",
      "label": "Anthropic: Claude Opus 5",
      "metadata": {
        "contextWindowTokens": 1000000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "anthropic/claude-sonnet-4.5",
      "label": "Anthropic: Claude Sonnet 4.5",
      "metadata": {
        "contextWindowTokens": 1000000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "anthropic/claude-sonnet-4.6",
      "label": "Anthropic: Claude Sonnet 4.6",
      "metadata": {
        "contextWindowTokens": 1000000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "anthropic/claude-sonnet-5",
      "label": "Anthropic: Claude Sonnet 5",
      "metadata": {
        "contextWindowTokens": 1000000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "deepseek/deepseek-chat",
      "label": "DeepSeek: DeepSeek V3",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "deepseek/deepseek-reasoner",
      "label": "deepseek/deepseek-reasoner",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "deepseek/deepseek-v4-flash",
      "label": "DeepSeek: DeepSeek V4 Flash",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "deepseek/deepseek-v4-flash-0731",
      "label": "DeepSeek: DeepSeek V4 Flash 0731",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "deepseek/deepseek-v4-flash-vision-exp",
      "label": "DeepSeek: DeepSeek V4 Flash Vision (Exp)",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text",
          "image"
        ]
      }
    },
    {
      "id": "deepseek/deepseek-v4-pro",
      "label": "DeepSeek: DeepSeek V4 Pro",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "deepseek/deepseek-v4-pro-0813",
      "label": "DeepSeek: DeepSeek V4 Pro 0813",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "deepseek/deepseek-v4.1-flash",
      "label": "DeepSeek: DeepSeek V4.1 Flash",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text",
          "image"
        ]
      }
    },
    {
      "id": "google/gemini-2.5-flash",
      "label": "Google: Gemini 2.5 Flash",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "file",
          "image",
          "text",
          "audio",
          "video"
        ]
      }
    },
    {
      "id": "google/gemini-2.5-flash-image",
      "label": "Google: Nano Banana (Gemini 2.5 Flash Image)",
      "metadata": {
        "contextWindowTokens": 32768,
        "inputModalities": [
          "image",
          "text"
        ]
      }
    },
    {
      "id": "google/gemini-2.5-flash-lite",
      "label": "Google: Gemini 2.5 Flash Lite",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text",
          "image",
          "file",
          "audio",
          "video"
        ]
      }
    },
    {
      "id": "google/gemini-2.5-pro",
      "label": "Google: Gemini 2.5 Pro",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text",
          "image",
          "file",
          "audio",
          "video"
        ]
      }
    },
    {
      "id": "google/gemini-3-flash-preview",
      "label": "Google: Gemini 3 Flash Preview",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text",
          "image",
          "file",
          "audio",
          "video"
        ]
      }
    },
    {
      "id": "google/gemini-3-pro-image-preview",
      "label": "Google: Nano Banana Pro (Gemini 3 Pro Image Preview)",
      "metadata": {
        "contextWindowTokens": 65536,
        "inputModalities": [
          "image",
          "text"
        ]
      }
    },
    {
      "id": "google/gemini-3.1-flash-image-preview",
      "label": "Google: Nano Banana 2 (Gemini 3.1 Flash Image Preview)",
      "metadata": {
        "contextWindowTokens": 65536,
        "inputModalities": [
          "image",
          "text"
        ]
      }
    },
    {
      "id": "google/gemini-3.1-flash-lite-preview",
      "label": "Google: Gemini 3.1 Flash Lite Preview",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text",
          "image",
          "video",
          "file",
          "audio"
        ]
      }
    },
    {
      "id": "google/gemini-3.1-pro-preview",
      "label": "Google: Gemini 3.1 Pro Preview",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "audio",
          "file",
          "image",
          "text",
          "video"
        ]
      }
    },
    {
      "id": "google/gemini-3.1-pro-preview-customtools",
      "label": "Google: Gemini 3.1 Pro Preview Custom Tools",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text",
          "audio",
          "image",
          "video",
          "file"
        ]
      }
    },
    {
      "id": "google/gemini-3.5-flash",
      "label": "Gemini 3.5 Flash",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text",
          "image",
          "video",
          "file",
          "audio"
        ]
      }
    },
    {
      "id": "google/gemini-3.5-flash-lite",
      "label": "Google: Gemini 3.5 Flash-Lite",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text",
          "image",
          "video",
          "file",
          "audio"
        ]
      }
    },
    {
      "id": "google/gemini-3.6-flash",
      "label": "Google: Gemini 3.6 Flash",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text",
          "image",
          "video",
          "file",
          "audio"
        ]
      }
    },
    {
      "id": "google/gemini-3.8-flash",
      "label": "Google: Gemini 3.8 Flash",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text",
          "image",
          "video",
          "file",
          "audio"
        ]
      }
    },
    {
      "id": "google/gemini-flash-latest",
      "label": "google/gemini-flash-latest",
      "metadata": {
        "inputModalities": [
          "text",
          "image",
          "audio",
          "video",
          "file"
        ]
      }
    },
    {
      "id": "google/gemini-flash-lite-latest",
      "label": "google/gemini-flash-lite-latest",
      "metadata": {
        "inputModalities": [
          "text",
          "image",
          "audio",
          "video",
          "file"
        ]
      }
    },
    {
      "id": "google/gemini-pro-latest",
      "label": "google/gemini-pro-latest",
      "metadata": {
        "inputModalities": [
          "text",
          "image",
          "audio",
          "video",
          "file"
        ]
      }
    },
    {
      "id": "google/gemini-robotics-er-1.6-preview",
      "label": "google/gemini-robotics-er-1.6-preview",
      "metadata": {
        "inputModalities": [
          "text",
          "image",
          "video",
          "audio"
        ]
      }
    },
    {
      "id": "google/gemma-4-26b-a4b-it",
      "label": "Google: Gemma 4 26B A4B",
      "metadata": {
        "contextWindowTokens": 262144,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "gpt-5.6-luna",
      "label": "gpt-5.6-luna",
      "metadata": {
        "contextWindowTokens": 1050000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "grok/grok-4.3",
      "label": "grok/grok-4.3",
      "metadata": {
        "contextWindowTokens": 1000000,
        "inputModalities": [
          "text",
          "image"
        ]
      }
    },
    {
      "id": "grok/grok-4.5",
      "label": "xAI: Grok 4.5",
      "metadata": {
        "contextWindowTokens": 500000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "grok/grok-4.6",
      "label": "SpaceXAI: Grok 4.6",
      "metadata": {
        "contextWindowTokens": 500000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "grok/grok-imagine-image",
      "label": "grok/grok-imagine-image",
      "metadata": {
        "inputModalities": [
          "text",
          "image"
        ]
      }
    },
    {
      "id": "kimi/kimi-k2.5",
      "label": "kimi/kimi-k2.5",
      "metadata": {
        "contextWindowTokens": 262144,
        "inputModalities": [
          "text",
          "image"
        ]
      }
    },
    {
      "id": "kimi/kimi-k2.6",
      "label": "kimi/kimi-k2.6",
      "metadata": {
        "contextWindowTokens": 262144,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "kimi/kimi-k2.7-code",
      "label": "MoonshotAI: Kimi K2.7 Code",
      "metadata": {
        "contextWindowTokens": 262144,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "kimi/kimi-k3",
      "label": "MoonshotAI: Kimi K3",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text",
          "image"
        ]
      }
    },
    {
      "id": "meta/muse-spark-1.1",
      "label": "Meta: Muse Spark 1.1",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text",
          "image",
          "video",
          "file",
          "audio"
        ]
      }
    },
    {
      "id": "meta/muse-spark-1.2",
      "label": "Meta: Muse Spark 1.2",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text",
          "image",
          "video",
          "file",
          "audio"
        ]
      }
    },
    {
      "id": "minimax/minimax-m2.5",
      "label": "MiniMax: MiniMax M2.5",
      "metadata": {
        "contextWindowTokens": 204800,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "minimax/minimax-m2.5-highspeed",
      "label": "MiniMax M2.5 highspeed",
      "metadata": {
        "contextWindowTokens": 204800,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "minimax/minimax-m2.7",
      "label": "MiniMax: MiniMax M2.7",
      "metadata": {
        "contextWindowTokens": 204800,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "minimax/minimax-m2.7-highspeed",
      "label": "MiniMax M2.7 highspeed",
      "metadata": {
        "contextWindowTokens": 204800,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "minimax/minimax-m3",
      "label": "MiniMax: MiniMax M3",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "obsidian/gemma-4-26B-A4B",
      "label": "Gemma 4 26B A4B",
      "metadata": {
        "contextWindowTokens": 262144,
        "inputModalities": [
          "text",
          "image"
        ]
      }
    },
    {
      "id": "obsidian/Qwen3.6-35B-A3B",
      "label": "Qwen3.6 35B A3B",
      "metadata": {
        "contextWindowTokens": 262144,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "obsidian/Qwen3.8-27B",
      "label": "Qwen3.8 27B",
      "metadata": {
        "contextWindowTokens": 262144,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "openai/gpt-3.5-turbo",
      "label": "OpenAI: GPT-3.5 Turbo",
      "metadata": {
        "contextWindowTokens": 16385,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "openai/gpt-3.5-turbo-0125",
      "label": "openai/gpt-3.5-turbo-0125",
      "metadata": {
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "openai/gpt-3.5-turbo-1106",
      "label": "openai/gpt-3.5-turbo-1106",
      "metadata": {
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "openai/gpt-3.5-turbo-16k",
      "label": "OpenAI: GPT-3.5 Turbo 16k",
      "metadata": {
        "contextWindowTokens": 16385,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "openai/gpt-4",
      "label": "OpenAI: GPT-4",
      "metadata": {
        "contextWindowTokens": 8191,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "openai/gpt-4-0613",
      "label": "openai/gpt-4-0613",
      "metadata": {
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "openai/gpt-4-turbo",
      "label": "OpenAI: GPT-4 Turbo",
      "metadata": {
        "contextWindowTokens": 128000,
        "inputModalities": [
          "text",
          "image"
        ]
      }
    },
    {
      "id": "openai/gpt-4-turbo-2024-04-09",
      "label": "openai/gpt-4-turbo-2024-04-09",
      "metadata": {
        "contextWindowTokens": 128000,
        "inputModalities": [
          "text",
          "image"
        ]
      }
    },
    {
      "id": "openai/gpt-4.1",
      "label": "OpenAI: GPT-4.1",
      "metadata": {
        "contextWindowTokens": 1047576,
        "inputModalities": [
          "image",
          "text",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-4.1-2025-04-14",
      "label": "openai/gpt-4.1-2025-04-14",
      "metadata": {
        "contextWindowTokens": 1047576,
        "inputModalities": [
          "image",
          "text",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-4.1-mini",
      "label": "OpenAI: GPT-4.1 Mini",
      "metadata": {
        "contextWindowTokens": 1047576,
        "inputModalities": [
          "image",
          "text",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-4.1-mini-2025-04-14",
      "label": "openai/gpt-4.1-mini-2025-04-14",
      "metadata": {
        "contextWindowTokens": 1047576,
        "inputModalities": [
          "image",
          "text",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-4.1-nano",
      "label": "OpenAI: GPT-4.1 Nano",
      "metadata": {
        "contextWindowTokens": 1047576,
        "inputModalities": [
          "image",
          "text",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-4.1-nano-2025-04-14",
      "label": "openai/gpt-4.1-nano-2025-04-14",
      "metadata": {
        "contextWindowTokens": 1047576,
        "inputModalities": [
          "image",
          "text",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-4o",
      "label": "OpenAI: GPT-4o",
      "metadata": {
        "contextWindowTokens": 128000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-4o-2024-05-13",
      "label": "OpenAI: GPT-4o (2024-05-13)",
      "metadata": {
        "contextWindowTokens": 128000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-4o-2024-08-06",
      "label": "OpenAI: GPT-4o (2024-08-06)",
      "metadata": {
        "contextWindowTokens": 128000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-4o-2024-11-20",
      "label": "OpenAI: GPT-4o (2024-11-20)",
      "metadata": {
        "contextWindowTokens": 128000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-4o-mini",
      "label": "OpenAI: GPT-4o-mini",
      "metadata": {
        "contextWindowTokens": 128000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-4o-mini-2024-07-18",
      "label": "OpenAI: GPT-4o-mini (2024-07-18)",
      "metadata": {
        "contextWindowTokens": 128000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-5",
      "label": "OpenAI: GPT-5",
      "metadata": {
        "contextWindowTokens": 400000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-5-2025-08-07",
      "label": "openai/gpt-5-2025-08-07",
      "metadata": {
        "contextWindowTokens": 400000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-5-chat-latest",
      "label": "openai/gpt-5-chat-latest",
      "metadata": {
        "inputModalities": [
          "text",
          "image"
        ]
      }
    },
    {
      "id": "openai/gpt-5-mini",
      "label": "OpenAI: GPT-5 Mini",
      "metadata": {
        "contextWindowTokens": 400000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-5-mini-2025-08-07",
      "label": "openai/gpt-5-mini-2025-08-07",
      "metadata": {
        "contextWindowTokens": 400000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-5-nano",
      "label": "OpenAI: GPT-5 Nano",
      "metadata": {
        "contextWindowTokens": 400000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-5-nano-2025-08-07",
      "label": "openai/gpt-5-nano-2025-08-07",
      "metadata": {
        "contextWindowTokens": 400000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-5-pro",
      "label": "OpenAI: GPT-5 Pro",
      "metadata": {
        "contextWindowTokens": 400000,
        "inputModalities": [
          "image",
          "text",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-5-pro-2025-10-06",
      "label": "openai/gpt-5-pro-2025-10-06",
      "metadata": {
        "contextWindowTokens": 400000,
        "inputModalities": [
          "image",
          "text",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-5-search-api",
      "label": "openai/gpt-5-search-api",
      "metadata": {
        "inputModalities": [
          "text",
          "image"
        ]
      }
    },
    {
      "id": "openai/gpt-5-search-api-2025-10-14",
      "label": "openai/gpt-5-search-api-2025-10-14",
      "metadata": {
        "inputModalities": [
          "text",
          "image"
        ]
      }
    },
    {
      "id": "openai/gpt-5.1",
      "label": "OpenAI: GPT-5.1",
      "metadata": {
        "contextWindowTokens": 400000,
        "inputModalities": [
          "image",
          "text",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-5.1-2025-11-13",
      "label": "openai/gpt-5.1-2025-11-13",
      "metadata": {
        "contextWindowTokens": 400000,
        "inputModalities": [
          "image",
          "text",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-5.1-chat-latest",
      "label": "openai/gpt-5.1-chat-latest",
      "metadata": {
        "inputModalities": [
          "text",
          "image"
        ]
      }
    },
    {
      "id": "openai/gpt-5.1-codex",
      "label": "OpenAI: GPT-5.1-Codex",
      "metadata": {
        "contextWindowTokens": 400000,
        "inputModalities": [
          "text",
          "image"
        ]
      }
    },
    {
      "id": "openai/gpt-5.1-codex-mini",
      "label": "OpenAI: GPT-5.1-Codex-Mini",
      "metadata": {
        "contextWindowTokens": 400000,
        "inputModalities": [
          "image",
          "text"
        ]
      }
    },
    {
      "id": "openai/gpt-5.2",
      "label": "OpenAI: GPT-5.2",
      "metadata": {
        "contextWindowTokens": 400000,
        "inputModalities": [
          "file",
          "image",
          "text"
        ]
      }
    },
    {
      "id": "openai/gpt-5.2-2025-12-11",
      "label": "openai/gpt-5.2-2025-12-11",
      "metadata": {
        "contextWindowTokens": 400000,
        "inputModalities": [
          "file",
          "image",
          "text"
        ]
      }
    },
    {
      "id": "openai/gpt-5.2-chat-latest",
      "label": "openai/gpt-5.2-chat-latest",
      "metadata": {
        "inputModalities": [
          "text",
          "image"
        ]
      }
    },
    {
      "id": "openai/gpt-5.2-codex",
      "label": "OpenAI: GPT-5.2-Codex",
      "metadata": {
        "contextWindowTokens": 400000,
        "inputModalities": [
          "text",
          "image"
        ]
      }
    },
    {
      "id": "openai/gpt-5.2-pro",
      "label": "OpenAI: GPT-5.2 Pro",
      "metadata": {
        "contextWindowTokens": 400000,
        "inputModalities": [
          "image",
          "text",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-5.2-pro-2025-12-11",
      "label": "openai/gpt-5.2-pro-2025-12-11",
      "metadata": {
        "contextWindowTokens": 400000,
        "inputModalities": [
          "image",
          "text",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-5.3-codex",
      "label": "OpenAI: GPT-5.3-Codex",
      "metadata": {
        "contextWindowTokens": 400000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-5.4",
      "label": "OpenAI: GPT-5.4",
      "metadata": {
        "contextWindowTokens": 1050000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-5.4-2026-03-05",
      "label": "openai/gpt-5.4-2026-03-05",
      "metadata": {
        "contextWindowTokens": 1050000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-5.4-mini",
      "label": "OpenAI: GPT-5.4 Mini",
      "metadata": {
        "contextWindowTokens": 400000,
        "inputModalities": [
          "file",
          "image",
          "text"
        ]
      }
    },
    {
      "id": "openai/gpt-5.4-mini-2026-03-17",
      "label": "openai/gpt-5.4-mini-2026-03-17",
      "metadata": {
        "inputModalities": [
          "file",
          "image",
          "text"
        ]
      }
    },
    {
      "id": "openai/gpt-5.4-nano",
      "label": "OpenAI: GPT-5.4 Nano",
      "metadata": {
        "contextWindowTokens": 400000,
        "inputModalities": [
          "file",
          "image",
          "text"
        ]
      }
    },
    {
      "id": "openai/gpt-5.4-nano-2026-03-17",
      "label": "openai/gpt-5.4-nano-2026-03-17",
      "metadata": {
        "inputModalities": [
          "file",
          "image",
          "text"
        ]
      }
    },
    {
      "id": "openai/gpt-5.4-pro",
      "label": "OpenAI: GPT-5.4 Pro",
      "metadata": {
        "contextWindowTokens": 1050000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-5.4-pro-2026-03-05",
      "label": "openai/gpt-5.4-pro-2026-03-05",
      "metadata": {
        "contextWindowTokens": 1050000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-5.5",
      "label": "OpenAI: GPT-5.5",
      "metadata": {
        "inputModalities": [
          "file",
          "image",
          "text"
        ]
      }
    },
    {
      "id": "openai/gpt-5.5-2026-04-23",
      "label": "openai/gpt-5.5-2026-04-23",
      "metadata": {
        "inputModalities": [
          "file",
          "image",
          "text"
        ]
      }
    },
    {
      "id": "openai/gpt-5.5-pro",
      "label": "OpenAI: GPT-5.5 Pro",
      "metadata": {
        "inputModalities": [
          "file",
          "image",
          "text"
        ]
      }
    },
    {
      "id": "openai/gpt-5.5-pro-2026-04-23",
      "label": "openai/gpt-5.5-pro-2026-04-23",
      "metadata": {
        "inputModalities": [
          "file",
          "image",
          "text"
        ]
      }
    },
    {
      "id": "openai/gpt-5.6-luna",
      "label": "OpenAI: GPT-5.6 Luna",
      "metadata": {
        "contextWindowTokens": 1050000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-5.6-sol",
      "label": "OpenAI: GPT-5.6 Sol",
      "metadata": {
        "contextWindowTokens": 1050000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-5.6-terra",
      "label": "OpenAI: GPT-5.6 Terra",
      "metadata": {
        "contextWindowTokens": 1050000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "openai/gpt-6-astra",
      "label": "OpenAI: GPT-6 Astra",
      "metadata": {
        "contextWindowTokens": 1050000,
        "inputModalities": [
          "text",
          "image",
          "file"
        ]
      }
    },
    {
      "id": "qwen/qwen3-max",
      "label": "Qwen: Qwen3 Max",
      "metadata": {
        "contextWindowTokens": 262144,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "qwen/qwen3-max-preview",
      "label": "qwen/qwen3-max-preview",
      "metadata": {
        "contextWindowTokens": 262144,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "qwen/qwen3-vl-235b-a22b-thinking",
      "label": "Qwen: Qwen3 VL 235B A22B Thinking",
      "metadata": {
        "contextWindowTokens": 131072,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "qwen/qwen3-vl-8b-instruct",
      "label": "Qwen: Qwen3 VL 8B Instruct",
      "metadata": {
        "contextWindowTokens": 131072,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "qwen/qwen3-vl-8b-thinking",
      "label": "Qwen: Qwen3 VL 8B Thinking",
      "metadata": {
        "contextWindowTokens": 131072,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "qwen/qwen3.5-122b-a10b",
      "label": "Qwen: Qwen3.5-122B-A10B",
      "metadata": {
        "contextWindowTokens": 32768,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "qwen/qwen3.5-27b",
      "label": "Qwen: Qwen3.5-27B",
      "metadata": {
        "contextWindowTokens": 32768,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "qwen/qwen3.5-35b-a3b",
      "label": "Qwen: Qwen3.5-35B-A3B",
      "metadata": {
        "contextWindowTokens": 32768,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "qwen/qwen3.5-397b-a17b",
      "label": "Qwen: Qwen3.5 397B A17B",
      "metadata": {
        "contextWindowTokens": 32768,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "qwen/qwen3.5-flash",
      "label": "qwen/qwen3.5-flash",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "qwen/qwen3.5-flash-2026-02-23",
      "label": "qwen/qwen3.5-flash-2026-02-23",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "qwen/qwen3.5-plus",
      "label": "qwen/qwen3.5-plus",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "qwen/qwen3.5-plus-2026-02-15",
      "label": "qwen/qwen3.5-plus-2026-02-15",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "qwen/qwen3.6-35b-a3b",
      "label": "Qwen: Qwen3.6 35B A3B",
      "metadata": {
        "contextWindowTokens": 262144,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "qwen/qwen3.6-flash",
      "label": "Qwen: Qwen3.6 Flash",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "qwen/qwen3.6-flash-2026-04-16",
      "label": "qwen/qwen3.6-flash-2026-04-16",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "qwen/qwen3.6-plus",
      "label": "Qwen: Qwen3.6 Plus",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "qwen/qwen3.6-plus-2026-04-02",
      "label": "qwen/qwen3.6-plus-2026-04-02",
      "metadata": {
        "contextWindowTokens": 1048576,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "qwen/qwen3.7-flash",
      "label": "Qwen: Qwen3.7 Flash",
      "metadata": {
        "contextWindowTokens": 1000000,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "qwen/qwen3.7-max",
      "label": "Qwen3.7 Max",
      "metadata": {
        "contextWindowTokens": 1000000,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "qwen/qwen3.7-max-2026-05-20",
      "label": "Qwen3.7 Max (2026-05-20)",
      "metadata": {
        "contextWindowTokens": 1000000,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "qwen/qwen3.7-plus",
      "label": "Qwen: Qwen3.7 Plus",
      "metadata": {
        "contextWindowTokens": 1000000,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "qwen/qwen3.8-27b",
      "label": "Qwen: Qwen3.8 27B",
      "metadata": {
        "contextWindowTokens": 262144,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "qwen/qwen3.8-flash",
      "label": "Qwen: Qwen3.8 Flash",
      "metadata": {
        "contextWindowTokens": 1000000,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "qwen/qwen3.8-max",
      "label": "Qwen: Qwen3.8 Max",
      "metadata": {
        "contextWindowTokens": 1000000,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "qwen/qwen3.8-max-0902",
      "label": "Qwen: Qwen3.8 Max (0902)",
      "metadata": {
        "contextWindowTokens": 1000000,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    },
    {
      "id": "tencent/hy3",
      "label": "Tencent: Hy3",
      "metadata": {
        "contextWindowTokens": 262144,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "z-ai/glm-4.5",
      "label": "Z.ai: GLM 4.5",
      "metadata": {
        "contextWindowTokens": 128000,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "z-ai/glm-4.5-air",
      "label": "Z.ai: GLM 4.5 Air",
      "metadata": {
        "contextWindowTokens": 128000,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "z-ai/glm-4.6",
      "label": "Z.ai: GLM 4.6",
      "metadata": {
        "contextWindowTokens": 200000,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "z-ai/glm-4.7",
      "label": "Z.ai: GLM 4.7",
      "metadata": {
        "contextWindowTokens": 200000,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "z-ai/glm-5",
      "label": "Z.ai: GLM 5",
      "metadata": {
        "contextWindowTokens": 200000,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "z-ai/glm-5.1",
      "label": "Z.ai: GLM 5.1",
      "metadata": {
        "contextWindowTokens": 200000,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "z-ai/glm-5.2",
      "label": "Z.ai: GLM 5.2",
      "metadata": {
        "contextWindowTokens": 1000000,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "z-ai/glm-5.3",
      "label": "Z.ai: GLM 5.3",
      "metadata": {
        "contextWindowTokens": 1000000,
        "inputModalities": [
          "text"
        ]
      }
    },
    {
      "id": "z-ai/glm-5.3-flash",
      "label": "Z.ai: GLM 5.3 Flash",
      "metadata": {
        "contextWindowTokens": 1000000,
        "inputModalities": [
          "text",
          "image",
          "video"
        ]
      }
    }
  ],
} as const;
