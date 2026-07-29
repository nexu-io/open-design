import {
  StorePlatformSchema,
  StoreScreenshotAssetSchema,
  StoreScreenshotChangeSetSchema,
  StoreScreenshotDocumentSchema,
  StoreScreenshotProductSchema,
  StoreScreenshotTemplateIdSchema,
} from '@launch-studio/store-screenshot';
import { z } from 'zod';

export { StoreScreenshotTemplateIdSchema } from '@launch-studio/store-screenshot';

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

export const UploadStoreScreenshotAssetRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  byteLength: z.number().int().positive().max(20 * 1024 * 1024),
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
  pageCount: z.number().int().min(1).max(10).optional(),
  byokProvider: z.object({
    protocol: z.enum([
      'anthropic',
      'openai',
      'azure',
      'google',
      'ollama',
      'senseaudio',
      'aihubmix',
    ]),
    apiKey: z.string(),
    baseUrl: z.string().optional(),
    apiVersion: z.string().optional(),
    requiresApiKey: z.boolean().optional(),
    model: z.string().optional(),
  }).strict().optional(),
}).strict();

export const PreviewStoreScreenshotChangeSetRequestSchema = StoreScreenshotChangeSetSchema;
export const StoreScreenshotChangeSetPreviewRequestSchema = PreviewStoreScreenshotChangeSetRequestSchema;

export const StoreScreenshotChangeSetPreviewResponseSchema = z.object({
  changeSet: StoreScreenshotChangeSetSchema,
  affectedPageIds: z.array(z.string().min(1)),
}).strict();

export const ApplyStoreScreenshotChangeSetRequestSchema = StoreScreenshotChangeSetSchema;

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

export const StoreScreenshotGenerateJobResultSchema = z.object({
  plan: ScreenshotPlanSchema,
  preview: StoreScreenshotChangeSetPreviewResponseSchema,
}).strict();

const StoreScreenshotExportIssueSchema = z.object({
  severity: z.enum(['error', 'warning']),
  code: z.string().min(1),
  message: z.string().min(1),
  platform: StorePlatformSchema.optional(),
  pageId: z.string().min(1).optional(),
}).strict();

const StoreScreenshotExportManifestFileSchema = z.object({
  order: z.number().int().positive(),
  fileName: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourcePageId: z.string().min(1),
  templateId: StoreScreenshotTemplateIdSchema,
}).strict();

const StoreScreenshotExportPlatformManifestSchema = z.object({
  ruleVersion: z.literal(1),
  targetSize: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }).strict(),
  pageCount: z.number().int().nonnegative(),
}).strict();

export const StoreScreenshotExportManifestSchema = z.object({
  schemaVersion: z.literal(1),
  documentId: z.string().min(1),
  documentVersion: z.number().int().positive(),
  exportedAt: z.string().datetime(),
  platforms: z.object({
    appStore: StoreScreenshotExportPlatformManifestSchema.optional(),
    googlePlay: StoreScreenshotExportPlatformManifestSchema.optional(),
  }).strict(),
  files: z.array(StoreScreenshotExportManifestFileSchema),
  errors: z.array(StoreScreenshotExportIssueSchema),
  warnings: z.array(StoreScreenshotExportIssueSchema),
}).strict();

export const StoreScreenshotExportJobResultSchema = z.object({
  downloadPath: z.string().min(1),
  files: z.array(z.string().min(1)),
  manifest: StoreScreenshotExportManifestSchema,
}).strict();

const StoreScreenshotJobErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
}).strict();

export const StoreScreenshotJobSchema = z.object({
  id: z.string().min(1),
  type: StoreScreenshotJobTypeSchema,
  status: StoreScreenshotJobStatusSchema,
  progress: StoreScreenshotJobProgressSchema,
  result: z.union([
    StoreScreenshotGenerateJobResultSchema,
    StoreScreenshotExportJobResultSchema,
  ]).optional(),
  error: StoreScreenshotJobErrorSchema.optional(),
}).strict().superRefine((job, context) => {
  const terminalFailure = job.status === 'failed' || job.status === 'interrupted';
  if (job.status === 'done') {
    const resultSchema = job.type === 'generate'
      ? StoreScreenshotGenerateJobResultSchema
      : job.type === 'export'
        ? StoreScreenshotExportJobResultSchema
        : null;
    if (!resultSchema || !resultSchema.safeParse(job.result).success) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['result'],
        message: `A done ${job.type} job requires its strict result schema`,
      });
    }
  } else if (job.result !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['result'],
      message: 'Only done jobs may carry a result',
    });
  }
  if (terminalFailure && job.error === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['error'],
      message: 'Failed and interrupted jobs require an error',
    });
  }
  if (!terminalFailure && job.error !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['error'],
      message: 'Only failed and interrupted jobs may carry an error',
    });
  }
});

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
export type UploadStoreScreenshotAssetRequest = z.infer<typeof UploadStoreScreenshotAssetRequestSchema>;
export type UploadStoreScreenshotAssetResponse = z.infer<typeof UploadStoreScreenshotAssetResponseSchema>;
export type ScreenshotPlan = z.infer<typeof ScreenshotPlanSchema>;
export type GenerateStoreScreenshotPlanRequest = z.infer<typeof GenerateStoreScreenshotPlanRequestSchema>;
export type StoreScreenshotChangeSetPreviewRequest = z.infer<typeof StoreScreenshotChangeSetPreviewRequestSchema>;
export type StoreScreenshotChangeSetPreviewResponse = z.infer<typeof StoreScreenshotChangeSetPreviewResponseSchema>;
export type ApplyStoreScreenshotChangeSetRequest = z.infer<typeof ApplyStoreScreenshotChangeSetRequestSchema>;
export type StoreScreenshotValidationResult = z.infer<typeof StoreScreenshotValidationResultSchema>;
export type StoreScreenshotJob = z.infer<typeof StoreScreenshotJobSchema>;
export type StoreScreenshotGenerateJobResult = z.infer<typeof StoreScreenshotGenerateJobResultSchema>;
export type StoreScreenshotExportJobResult = z.infer<typeof StoreScreenshotExportJobResultSchema>;
export type StoreScreenshotJobResponse = z.infer<typeof StoreScreenshotJobResponseSchema>;
export type RenderStoreScreenshotRequest = z.infer<typeof RenderStoreScreenshotRequestSchema>;
export type ExportStoreScreenshotRequest = z.infer<typeof ExportStoreScreenshotRequestSchema>;
