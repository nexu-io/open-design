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
    return '/agent-icons/claude.svg';
  if (
    vendor.includes('openai') ||
    vendor.includes('gpt') ||
    vendor === 'o1' ||
    vendor === 'o3' ||
    vendor === 'o4'
  )
    return '/model-icons/openai.svg';
  if (vendor.includes('google') || vendor.includes('gemini'))
    return '/model-icons/google-gemini.svg';
  if (vendor.includes('xai') || vendor.includes('grok'))
    return '/model-icons/x.svg';
  if (vendor.includes('deepseek')) return '/agent-icons/deepseek.svg';
  if (vendor.includes('glm') || vendor.includes('zhipu'))
    return '/agent-icons/glm.svg';
  if (vendor.includes('qwen')) return '/agent-icons/qwen.svg';
  if (vendor.includes('kimi') || vendor.includes('moonshot'))
    return '/agent-icons/kimi.svg';
  if (vendor.includes('mimo')) return '/agent-icons/mimo.svg';
  if (vendor.includes('minimax')) return '/model-icons/minimax.svg';
  if (vendor.includes('muse') || vendor.includes('meta') || vendor.includes('llama'))
    return '/model-icons/meta.png';
  if (vendor.includes('doubao') || vendor.includes('bytedance'))
    return '/model-icons/bytedance.svg';
  if (vendor.includes('openrouter')) return '/model-icons/openrouter.svg';
  return null;
}
