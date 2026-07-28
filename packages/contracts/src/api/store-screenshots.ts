import {
  StorePlatformSchema,
  StoreScreenshotAssetSchema,
  StoreScreenshotChangeSetSchema,
  StoreScreenshotDocumentSchema,
  StoreScreenshotProductSchema,
} from '@launch-studio/store-screenshot';
import { z } from 'zod';

export const StoreScreenshotTemplateIdSchema = z.enum([
  'minimal-center',
  'gradient-device',
  'editorial-split',
]);

export const CreateStoreScreenshotDocumentRequestSchema = z.object({
  product: StoreScreenshotProductSchema,
  designSystemId: z.string().min(1),
  templateId: StoreScreenshotTemplateIdSchema,
  pageCount: z.number().int().min(1).max(10),
  platforms: z.array(StorePlatformSchema).min(1).optional(),
}).strict();

export const StoreScreenshotDocumentResponseSchema = z.object({
  document: StoreScreenshotDocumentSchema,
}).strict();

export const StoreScreenshotDocumentListResponseSchema = z.object({
  documents: z.array(StoreScreenshotDocumentSchema),
}).strict();

export const UpdateStoreScreenshotDocumentRequestSchema = z.object({
  baseVersion: z.number().int().positive(),
  document: StoreScreenshotDocumentSchema,
}).strict();

export const RestoreStoreScreenshotDocumentRequestSchema = z.object({
  version: z.number().int().positive(),
}).strict();

export const StoreScreenshotVersionSchema = z.object({
  version: z.number().int().positive(),
  source: z.enum(['manual', 'ai-change-set', 'template', 'asset-replacement', 'page-reorder', 'restore']),
  createdAt: z.number().int().nonnegative(),
}).strict();

export const StoreScreenshotVersionsResponseSchema = z.object({
  versions: z.array(StoreScreenshotVersionSchema),
}).strict();

export const StoreScreenshotUploadedAssetSchema = StoreScreenshotAssetSchema.extend({
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  relativePath: z.string().min(1),
}).strict();

export const UploadStoreScreenshotAssetResponseSchema = z.object({
  asset: StoreScreenshotUploadedAssetSchema,
}).strict();

export const ScreenshotPlanPageSchema = z.object({
  headline: z.string().min(1),
  body: z.string().min(1).optional(),
  feature: z.string().min(1),
  templateId: StoreScreenshotTemplateIdSchema,
  screenshotAssetId: z.string().min(1).optional(),
  platformOverrides: z.record(StorePlatformSchema, z.object({
    headline: z.string().min(1).optional(),
    body: z.string().min(1).optional(),
    hidden: z.boolean().optional(),
  }).strict()).optional(),
}).strict();

export const ScreenshotPlanSchema = z.object({
  strategy: z.string().min(1),
  pages: z.array(ScreenshotPlanPageSchema).min(1).max(10),
}).strict();

export const GenerateStoreScreenshotPlanRequestSchema = z.object({
  prompt: z.string().min(1).optional(),
}).strict();

export const StoreScreenshotChangeSetPreviewRequestSchema = z.object({
  changeSet: StoreScreenshotChangeSetSchema,
}).strict();

export const StoreScreenshotChangeSetPreviewResponseSchema = z.object({
  changeSet: StoreScreenshotChangeSetSchema,
  affectedPageIds: z.array(z.string().min(1)),
}).strict();

export const ApplyStoreScreenshotChangeSetRequestSchema = z.object({
  changeSet: StoreScreenshotChangeSetSchema,
}).strict();

export const StoreScreenshotValidationRequestSchema = z.object({
  platforms: z.array(StorePlatformSchema).min(1).optional(),
}).strict();

export const StoreScreenshotValidationIssueSchema = z.object({
  severity: z.enum(['error', 'warning']),
  code: z.string().min(1),
  message: z.string().min(1),
  platform: StorePlatformSchema.optional(),
  pageId: z.string().min(1).optional(),
}).strict();

export const StoreScreenshotValidationResultSchema = z.object({
  valid: z.boolean(),
  issues: z.array(StoreScreenshotValidationIssueSchema),
}).strict();

export const StoreScreenshotJobTypeSchema = z.enum(['generate', 'render', 'export']);
export const StoreScreenshotJobStatusSchema = z.enum(['queued', 'running', 'done', 'failed', 'interrupted']);

export const StoreScreenshotJobProgressSchema = z.object({
  completed: z.number().int().nonnegative(),
  total: z.number().int().positive(),
}).strict().superRefine(({ completed, total }, context) => {
  if (completed > total) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'completed cannot exceed total',
      path: ['completed'],
    });
  }
});

export const StoreScreenshotJobSchema = z.object({
  id: z.string().min(1),
  type: StoreScreenshotJobTypeSchema,
  status: StoreScreenshotJobStatusSchema,
  progress: StoreScreenshotJobProgressSchema,
  result: z.unknown().optional(),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }).strict().optional(),
}).strict();

export const StoreScreenshotJobResponseSchema = z.object({
  job: StoreScreenshotJobSchema,
}).strict();

export const RenderStoreScreenshotRequestSchema = z.object({
  platforms: z.array(StorePlatformSchema).min(1),
}).strict();

export const ExportStoreScreenshotRequestSchema = RenderStoreScreenshotRequestSchema;

export type CreateStoreScreenshotDocumentRequest = z.infer<typeof CreateStoreScreenshotDocumentRequestSchema>;
export type StoreScreenshotDocumentResponse = z.infer<typeof StoreScreenshotDocumentResponseSchema>;
export type StoreScreenshotDocumentListResponse = z.infer<typeof StoreScreenshotDocumentListResponseSchema>;
export type UpdateStoreScreenshotDocumentRequest = z.infer<typeof UpdateStoreScreenshotDocumentRequestSchema>;
export type RestoreStoreScreenshotDocumentRequest = z.infer<typeof RestoreStoreScreenshotDocumentRequestSchema>;
export type StoreScreenshotVersion = z.infer<typeof StoreScreenshotVersionSchema>;
export type StoreScreenshotUploadedAsset = z.infer<typeof StoreScreenshotUploadedAssetSchema>;
export type UploadStoreScreenshotAssetResponse = z.infer<typeof UploadStoreScreenshotAssetResponseSchema>;
export type ScreenshotPlan = z.infer<typeof ScreenshotPlanSchema>;
export type GenerateStoreScreenshotPlanRequest = z.infer<typeof GenerateStoreScreenshotPlanRequestSchema>;
export type StoreScreenshotChangeSetPreviewRequest = z.infer<typeof StoreScreenshotChangeSetPreviewRequestSchema>;
export type StoreScreenshotChangeSetPreviewResponse = z.infer<typeof StoreScreenshotChangeSetPreviewResponseSchema>;
export type ApplyStoreScreenshotChangeSetRequest = z.infer<typeof ApplyStoreScreenshotChangeSetRequestSchema>;
export type StoreScreenshotValidationResult = z.infer<typeof StoreScreenshotValidationResultSchema>;
export type StoreScreenshotJob = z.infer<typeof StoreScreenshotJobSchema>;
export type StoreScreenshotJobResponse = z.infer<typeof StoreScreenshotJobResponseSchema>;
export type RenderStoreScreenshotRequest = z.infer<typeof RenderStoreScreenshotRequestSchema>;
export type ExportStoreScreenshotRequest = z.infer<typeof ExportStoreScreenshotRequestSchema>;
