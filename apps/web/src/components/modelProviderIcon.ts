import { publicPath } from '@/runtime/web-path';
// Brand mark for a model id. Accepts both BYOK-style `provider/model` ids
// (e.g. `anthropic/claude-sonnet-4-5`) and bare catalog ids (e.g.
// `claude-fable-5`, `deepseek-v4-flash`): the vendor token is the slash
// prefix when present, otherwise the id's leading `-` token — the same
// derivation the two-level picker's company grouping uses. Unknown vendors
// return null and callers fall back to a neutral/agent mark instead of
// inventing artwork.
export function modelProviderIconSrc(
  modelId: string | null | undefined,
): string | null {
  if (!modelId) return null;
  const slash = modelId.indexOf('/');
  const vendor = (
    slash > 0 ? modelId.slice(0, slash) : modelId.split('-')[0] ?? modelId
  ).toLowerCase();
  if (!vendor) return null;
  if (vendor.includes('anthropic') || vendor.includes('claude'))
    return publicPath('/agent-icons/claude.svg');
  if (
    vendor.includes('openai') ||
    vendor.includes('gpt') ||
    vendor === 'o1' ||
    vendor === 'o3' ||
    vendor === 'o4'
  )
    return publicPath('/model-icons/openai.svg');
  if (vendor.includes('google') || vendor.includes('gemini'))
    return publicPath('/model-icons/google-gemini.svg');
  if (vendor.includes('xai') || vendor.includes('grok'))
    return publicPath('/model-icons/x.svg');
  if (vendor.includes('deepseek')) return publicPath('/agent-icons/deepseek.svg');
  if (vendor.includes('glm') || vendor.includes('zhipu'))
    return publicPath('/agent-icons/glm.svg');
  if (vendor.includes('qwen')) return publicPath('/agent-icons/qwen.svg');
  if (vendor.includes('kimi') || vendor.includes('moonshot'))
    return publicPath('/agent-icons/kimi.svg');
  if (vendor.includes('mimo')) return publicPath('/agent-icons/mimo.svg');
  if (vendor.includes('minimax')) return publicPath('/model-icons/minimax.svg');
  if (vendor.includes('muse') || vendor.includes('meta') || vendor.includes('llama'))
    return publicPath('/model-icons/meta.png');
  if (vendor.includes('doubao') || vendor.includes('bytedance'))
    return publicPath('/model-icons/bytedance.svg');
  if (vendor.includes('openrouter')) return publicPath('/model-icons/openrouter.svg');
  return null;
}
