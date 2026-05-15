import type { TerminalLaunchResult } from '../hooks/useTerminalLaunch';

export interface ContinueInCliToast {
  message: string;
  details: null;
}

const CLIPBOARD_PREFIX = 'Copied to clipboard. ';

export function buildContinueInCliToast(
  projectDir: string,
  launched: TerminalLaunchResult,
): ContinueInCliToast {
  if (launched.kind === 'electron' && launched.ok) {
    return {
      message: `${CLIPBOARD_PREFIX}Folder opened. Run \`claude\` in your terminal here and paste the prompt.`,
      details: null,
    };
  }

  if (launched.kind === 'electron' && !launched.ok) {
    return {
      message: `${CLIPBOARD_PREFIX}Couldn't open the folder. Open your terminal at ${projectDir}, run \`claude\`, and paste the prompt.`,
      details: null,
    };
  }

  return {
    message: `${CLIPBOARD_PREFIX}Open your terminal at ${projectDir}, run \`claude\`, and paste the prompt.`,
    details: null,
  };
}
