import en from './ambassador-heatherm-main.html?raw';
import zh from './ambassador-heatherm-main.zh.html?raw';

export const STORY_BODY: Record<string, string> = { en, zh };
export interface StoryMeta { title: string; description: string }
export const STORY_META: Record<string, StoryMeta> = {
  en: { title: 'Heatherm’s first contribution to OpenDesign was a room', description: 'How OpenDesign’s Hong Kong ambassador helped turn a local workshop into a live product lab and a bridge into the city’s builder community.' },
  zh: { title: 'Heatherm 为 OpenDesign 做的第一件事，是提供了一个房间', description: 'OpenDesign 香港大使如何帮助本地工作坊变成实时产品实验室，并成为项目与香港 Builder 社区之间的桥梁。' },
};
export interface StoryCard { title: string; blurb: string }
export const STORY_CARD: Record<string, StoryCard> = {
  en: { title: 'His first contribution was a room', blurb: 'Heatherm Huang gave Hong Kong builders a place to meet OpenDesign through real work and helped turn the workshop into a live product lab.' },
  zh: { title: '他的第一项贡献，是一个房间', blurb: 'Heatherm Huang 让香港 Builder 能够通过真实工作与 OpenDesign 相遇，并把工作坊变成实时产品实验室。' },
};
