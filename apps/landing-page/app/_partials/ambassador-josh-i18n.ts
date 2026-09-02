import en from './ambassador-josh-main.html?raw';
import zh from './ambassador-josh-main.zh.html?raw';

export const STORY_BODY: Record<string, string> = { en, zh };
export interface StoryMeta { title: string; description: string }
export const STORY_META: Record<string, StoryMeta> = {
  en: { title: 'Josh helps first-time users through the technical blockers', description: 'How OpenDesign’s Australia ambassador makes agent-native design more approachable through practical community support and local-agent testing.' },
  zh: { title: 'Josh 帮助新用户解决具体的技术卡点', description: 'OpenDesign 澳大利亚大使如何通过实用的社区支持和本地 Agent 测试，让 Agent 原生设计更容易上手。' },
};
export interface StoryCard { title: string; blurb: string }
export const STORY_CARD: Record<string, StoryCard> = {
  en: { title: 'Practical help for first-time users', blurb: 'Josh makes agent-native design easier to approach by helping newcomers through specific technical blockers.' },
  zh: { title: '让第一次使用更顺畅', blurb: 'Josh 帮助新用户解决具体的技术卡点，让 Agent 原生设计更容易上手。' },
};
