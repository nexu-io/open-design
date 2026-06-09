import type { Request } from 'express';
import type { AuthenticatedRequest, DaemonUser } from './auth-context.js';
import type { ProjectOwnerScope, RoutineOwnerScope } from './db.js';

export function ownerScopeForUser(
  user: DaemonUser | null | undefined,
): ProjectOwnerScope & RoutineOwnerScope {
  return {
    ownerEmail: user?.email ?? null,
    includeOwnerless: !user || user.source === 'dev-fallback',
  };
}

export function ownerScopeForRequest(
  req: Request,
): ProjectOwnerScope & RoutineOwnerScope {
  return ownerScopeForUser((req as AuthenticatedRequest).user);
}

export function ownerFieldsForUser(user: DaemonUser | null | undefined) {
  return {
    ownerEmail: user?.email ?? null,
    ownerDirHash: user?.dirHash ?? null,
    projectIdOwnerKey: user?.source === 'trusted-header' ? user.dirHash : null,
  };
}

export function ownerFieldsForRequest(req: Request) {
  return ownerFieldsForUser((req as AuthenticatedRequest).user);
}
