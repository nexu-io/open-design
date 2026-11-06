import type { Context } from '@deepseek-ai/cordis';
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants';

const PACKAGE_NAME = '@open-design/dsh-runtime';
export const name = 'open-design-runtime-invariant';
export const inject = ['invariants'];
const install: InvariantInstaller = () => {};

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
