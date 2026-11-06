import { DEFAULT_MODEL_OPTION } from './shared.js';
import type { RuntimeAgentDef } from '../types.js';

export const aiderAgentDef = {
    id: 'aider',
    name: 'Aider',
    bin: 'aider',
    versionArgs: ['--version'],
    // Aider proxies to whatever LLM the user configures via `--model` and
    // routes through LiteLLM, so any concrete fallback list is necessarily
    // partial. These are the commonly recommended starting points from
    // aider.chat/docs; users can paste anything else through the custom-
    // model input. The id strings follow LiteLLM provider/model spelling
    // so Aider parses them without an extra `--provider` flag.
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'sonnet', label: 'sonnet' },
      { id: 'gpt-4o', label: 'gpt-4o' },
      { id: 'deepseek/deepseek-chat', label: 'deepseek/deepseek-chat' },
      { id: 'gemini/gemini-2.0-flash', label: 'gemini/gemini-2.0-flash' },
    ],
    // Aider's one-shot mode requires the prompt as `--message <text>` on
    // argv; neither `--message` nor `--message-file` accept `-` as a stdin
    // sentinel (it is treated as a literal filename), so we cannot pipe
    // the prompt in the way qwen/gemini do. Mirror the DeepSeek TUI
    // pattern: ship the prompt as argv with a conservative byte budget so
    // the /api/chat spawn path emits an actionable error before hitting
    // Windows' ~32 KB CreateProcess limit or Linux MAX_ARG_STRLEN.
    //
    // The suppression flags are all there to keep aider runnable without
    // a TTY:
    //   --yes-always                       — skip per-action confirmation
    //   --no-pretty                        — strip ANSI so stdout parses as plain text
    //   --no-stream                        — left as default (streaming on)
    //   --no-git / --no-auto-commits       — the daemon spawns aider inside
    //                                        an OD project workspace that is
    //                                        not the user's git repo, so the
    //                                        commit machinery has nothing
    //                                        useful to do here
    //   --no-suggest-shell-commands        — avoids a follow-up interactive prompt
    //   --no-show-model-warnings           — suppresses model-compat banners
    //                                        that would otherwise prefix every
    //                                        run with noise
    buildArgs: (prompt, _imagePaths, _extra, options = {}) => {
      const args = [
        '--yes-always',
        '--no-pretty',
        '--no-git',
        '--no-auto-commits',
        '--no-suggest-shell-commands',
        '--no-show-model-warnings',
      ];
      if (options.model && options.model !== 'default') {
        args.push('--model', options.model);
      }
      args.push('--message', prompt);
      return args;
    },
    maxPromptArgBytes: 30_000,
    streamFormat: 'plain',
    installUrl: 'https://aider.chat/docs/install.html',
    docsUrl: 'https://aider.chat',
} satisfies RuntimeAgentDef;
