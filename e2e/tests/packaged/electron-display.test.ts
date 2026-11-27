import { describe, expect, it } from 'vitest';
import { electronDisplayCommand } from '@/vitest/electron-display';

describe('Electron display ownership', () => {
  it('runs Linux Electron inside an automatically allocated virtual display', () => {
    expect(electronDisplayCommand('/opt/Electron App/electron', ['fixture.cjs', 'http://127.0.0.1:1234'], 'linux')).toEqual({
      command: 'xvfb-run',
      args: ['--auto-servernum', '--server-args=-screen 0 1280x720x24', '/opt/Electron App/electron', 'fixture.cjs', 'http://127.0.0.1:1234'],
    });
  });

  it.each(['darwin', 'win32'] as const)('preserves native display startup on %s', platform => {
    expect(electronDisplayCommand('/Electron App/electron', ['fixture.cjs'], platform)).toEqual({
      command: '/Electron App/electron', args: ['fixture.cjs'],
    });
  });

  it('preserves literal arguments without a shell or disabling the sandbox', () => {
    const args = ['fixture with spaces.cjs', '$(touch unexpected)', 'a;b'];
    const result = electronDisplayCommand('/Electron App/electron', args, 'linux');
    expect(result.args.slice(-args.length)).toEqual(args);
    expect(result.args).not.toContain('--no-sandbox');
    expect(args).toEqual(['fixture with spaces.cjs', '$(touch unexpected)', 'a;b']);
  });
});
