import type { ServerContext } from './server-context.js';
import type { RegisterActiveContextRoutesDeps } from './routes/active-context.js';
import type { RegisterAutomationRoutesDeps } from './routes/automation.js';
import type { RegisterChatRoutesDeps } from './routes/chat.js';
import type { RegisterDeployRoutesDeps, RegisterDeploymentCheckRoutesDeps } from './routes/deploy.js';
import type { RegisterFinalizeRoutesDeps, RegisterImportRoutesDeps, RegisterProjectExportRoutesDeps } from './import-export-routes.js';
import type { RegisterGenuiRoutesDeps } from './routes/genui.js';
import type { RegisterHandoffRoutesDeps } from './routes/handoff.js';
import type { RegisterHostToolsRoutesDeps } from './routes/host-tools.js';
import type { RegisterLiveArtifactRoutesDeps } from './routes/live-artifact.js';
import type { RegisterMcpRoutesDeps } from './mcp-routes.js';
import type { RegisterMediaRoutesDeps } from './routes/media.js';
import type { RegisterMemoryRoutesDeps } from './routes/memory.js';
import type { RegisterOpenDesignPublicMetadataRoutesDeps } from './routes/open-design-public-metadata.js';
import type { RegisterProjectArtifactRoutesDeps, RegisterProjectFileRoutesDeps, RegisterProjectRoutesDeps, RegisterProjectUploadRoutesDeps } from './routes/project/index.js';
import type { RegisterRoutineRoutesDeps } from './routes/routine.js';
import type { RegisterRunRoutesDeps } from './routes/runs.js';
import type { RegisterSocialShareRoutesDeps } from './routes/social-share.js';
import type { RegisterStaticResourceRoutesDeps } from './routes/static-resource.js';
import type { RegisterVelaRoutesDeps } from './routes/vela.js';
import type { RegisterXaiRoutesDeps } from './routes/xai.js';

type AllRegisteredRouteDeps =
  & RegisterActiveContextRoutesDeps
  & RegisterAutomationRoutesDeps
  & RegisterChatRoutesDeps
  & RegisterDeployRoutesDeps
  & RegisterDeploymentCheckRoutesDeps
  & RegisterFinalizeRoutesDeps
  & RegisterGenuiRoutesDeps
  & RegisterHandoffRoutesDeps
  & RegisterHostToolsRoutesDeps
  & RegisterImportRoutesDeps
  & RegisterLiveArtifactRoutesDeps
  & RegisterMcpRoutesDeps
  & RegisterMediaRoutesDeps
  & RegisterMemoryRoutesDeps
  & RegisterOpenDesignPublicMetadataRoutesDeps
  & RegisterProjectArtifactRoutesDeps
  & RegisterProjectExportRoutesDeps
  & RegisterProjectFileRoutesDeps
  & RegisterProjectRoutesDeps
  & RegisterProjectUploadRoutesDeps
  & RegisterRoutineRoutesDeps
  & RegisterRunRoutesDeps
  & RegisterSocialShareRoutesDeps
  & RegisterStaticResourceRoutesDeps
  & RegisterVelaRoutesDeps
  & RegisterXaiRoutesDeps;

type Assert<T extends true> = T;
type ServerContextCoversRouteDeps = Assert<ServerContext extends AllRegisteredRouteDeps ? true : false>;

export function assertServerContextSatisfiesRoutes(ctx: ServerContextCoversRouteDeps extends true ? ServerContext : never): void {
  void ctx;
}
