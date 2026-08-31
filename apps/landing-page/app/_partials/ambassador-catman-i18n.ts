import en from './ambassador-catman-main.html?raw';
import zh from './ambassador-catman-main.zh.html?raw';

export const STORY_BODY: Record<string, string> = { en, zh };
export interface StoryMeta { title: string; description: string }
export const STORY_META: Record<string, StoryMeta> = {
  en: { title: 'CATMAN brought a Japanese real-estate workflow into OpenDesign', description: 'How OpenDesign’s Japan ambassador turned the everyday friction of real-estate brochures and local sales materials into product feedback and a community demo.' },
  zh: { title: 'CATMAN 把一套日本房地产工作流带进了 OpenDesign', description: 'OpenDesign 日本大使如何把房地产楼书与本地销售物料中的日常摩擦，转化成产品反馈和社区现场分享。' },
};
export interface StoryCard { title: string; blurb: string }
export const STORY_CARD: Record<string, StoryCard> = {
  en: { title: 'A real-estate workflow from Japan', blurb: 'CATMAN turned the everyday friction of Japanese real-estate brochures into product feedback, an editable use case, and a community demo in Osaka.' },
  zh: { title: '来自日本房地产现场的工作流', blurb: 'CATMAN 把日本房地产楼书中的日常摩擦，转化成产品反馈、可编辑案例，以及大阪社区现场分享。' },
};
