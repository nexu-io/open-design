export type CreatorContentStatus = 'idea' | 'drafting' | 'production' | 'published' | 'archived';

export interface CreatorContentBrief {
  topic?: string;
  audience?: string;
  coreMessage?: string;
  targetPlatform?: string;
}

export interface CreatorContentOutline {
  opening?: string;
  sections?: string;
  ending?: string;
  editingIntent?: string;
}

export interface CreatorStoryboardItem {
  id: string;
  position: number;
  purpose: string;
  visualDescription?: string;
  audioNotes?: string;
  mediaAssetIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatorStoryboardItemInput {
  position: number;
  purpose: string;
  visualDescription?: string;
  audioNotes?: string;
  mediaAssetIds?: string[];
}

export interface CreatorRetrospective {
  publishedAt?: string;
  performanceSummary?: string;
  learnings?: string;
  nextAction?: string;
}

export interface CreatorContentProject {
  id: string;
  projectId: string;
  title: string;
  status: CreatorContentStatus;
  brief: CreatorContentBrief;
  outline: CreatorContentOutline;
  storyboardItems: CreatorStoryboardItem[];
  retrospective: CreatorRetrospective;
  taskIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatorContentProjectData {
  contentProjects: CreatorContentProject[];
}

export interface CreateCreatorContentRequest {
  title: string;
  status?: CreatorContentStatus;
}

export interface UpdateCreatorContentRequest {
  title?: string;
  status?: CreatorContentStatus;
  brief?: CreatorContentBrief;
  outline?: CreatorContentOutline;
  storyboardItems?: CreatorStoryboardItemInput[];
  retrospective?: CreatorRetrospective;
}
