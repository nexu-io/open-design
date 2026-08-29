import { describe, expect, it } from 'vitest';
import {
  createProactiveContentPull,
  isFreshProactivePullAuthorizationWitness,
  type ProactiveContentPullTarget,
  type ProactivePullAuthorizationScope,
  type ProactivePullAuthorizationWitness,
} from '../../src/collab/proactive-content-pull.js';

const scope: ProactivePullAuthorizationScope = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  resourceTeamId: 'team-1',
  viewerMemberId: 'viewer-1',
  ownerMemberId: 'owner-1',
};

async function mintWitness(
  version = 7,
): Promise<ProactivePullAuthorizationWitness> {
  const targets: ProactiveContentPullTarget[] = [];
  const pull = createProactiveContentPull({
    getLocalBinding: () => ({
      workspaceId: scope.workspaceId,
      visibility: 'team',
    }),
    getWorkspaceIdentity: async () => ({
      workspaceId: scope.workspaceId,
      resourceTeamId: scope.resourceTeamId,
      workspaceMemberId: scope.viewerMemberId,
    }),
    resolveSharedProjectOwner: async () => scope.ownerMemberId,
    pullSharedProject: async (input) => {
      targets.push(input);
      return { status: 'pulled', version };
    },
  });
  await pull.handleContentChanged({
    projectId: scope.projectId,
    workspaceId: scope.workspaceId,
    version,
  });
  const target = targets[0];
  if (!target?.authorizationWitness) {
    throw new Error('expected proactive guard to issue a witness');
  }
  return target.authorizationWitness;
}

describe('proactive pull authorization witness', () => {
  it('accepts only a fresh witness bound to the exact scope and version', async () => {
    const witness = await mintWitness();

    expect(
      isFreshProactivePullAuthorizationWitness(
        witness,
        scope,
        7,
        witness.verifiedAtMs + 4_999,
      ),
    ).toBe(true);
    expect(
      isFreshProactivePullAuthorizationWitness(
        witness,
        scope,
        7,
        witness.verifiedAtMs + 5_001,
      ),
    ).toBe(false);
    expect(
      isFreshProactivePullAuthorizationWitness(
        witness,
        { ...scope, ownerMemberId: 'other-owner' },
        7,
        witness.verifiedAtMs + 1,
      ),
    ).toBe(false);
    expect(
      isFreshProactivePullAuthorizationWitness(
        witness,
        scope,
        8,
        witness.verifiedAtMs + 1,
      ),
    ).toBe(false);
  });

  it('rejects copied or hand-built objects that did not come from the issuer', async () => {
    const witness = await mintWitness();
    const serializedCopy = JSON.parse(
      JSON.stringify(witness),
    ) as ProactivePullAuthorizationWitness;
    const spreadCopy = { ...witness };
    const reflectedCopy = Object.fromEntries(
      Reflect.ownKeys(witness).map((key) => [key, Reflect.get(witness, key)]),
    ) as unknown as ProactivePullAuthorizationWitness;

    for (const copy of [serializedCopy, spreadCopy, reflectedCopy]) {
      expect(
        isFreshProactivePullAuthorizationWitness(
          copy,
          scope,
          7,
          witness.verifiedAtMs + 1,
        ),
      ).toBe(false);
    }
  });
});
