import { z } from 'zod';

const projectPath = z.string().min(1).refine((value) =>
  !/^[a-z]+:|^[\\/]|[?#\\]/i.test(value)
  && value.split('/').every((part) => part !== '..' && part !== '.' && part !== ''),
'Use a project-relative file path without traversal, URL or query parameters.');

export const MotionDeliveryContractSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('interactive'), sourcePath: projectPath.refine((v) => /\.html?$/i.test(v)) }).strict(),
  z.object({ mode: z.literal('video'), sourcePath: projectPath.refine((v) => /\.html?$/i.test(v)), videoPath: projectPath.refine((v) => /\.mp4$/i.test(v)) }).strict(),
]);
export type MotionDeliveryContract = z.infer<typeof MotionDeliveryContractSchema>;

export function readMotionDeliveryContract(plan: { taskProfile: { taskSpecific: Record<string, unknown> } } | null | undefined): MotionDeliveryContract | undefined {
  const parsed = MotionDeliveryContractSchema.safeParse(plan?.taskProfile?.taskSpecific?.motionDelivery);
  return parsed.success ? parsed.data : undefined;
}
