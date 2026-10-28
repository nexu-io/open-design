import { z } from "zod";

/** Mirror of Vela's frozen-source identity. A ZIP declaration alone is not trust. */
export const materialProvenanceSchema = z.object({
	version: z.literal(1),
	materialVersionId: z.string().uuid(),
	sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
	templateId: z.string().min(1).max(128),
	templateVersion: z.number().int().positive(),
	rendererDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	compilerIdentity: z.string().min(1).max(4096),
	sourceDslVersion: z.union([z.literal(2), z.literal(3)]),
}).strict();
export type MaterialProvenance = z.infer<typeof materialProvenanceSchema>;
