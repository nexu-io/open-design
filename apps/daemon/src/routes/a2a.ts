import type { AgentCard } from '@a2a-js/sdk';
import { DefaultRequestHandler, InMemoryTaskStore } from '@a2a-js/sdk/server';
import {
  UserBuilder,
  agentCardHandler,
  jsonRpcHandler,
} from '@a2a-js/sdk/server/express';
import type { Express, Request } from 'express';

import { HttpOpenDesignA2ADaemonClient } from '../a2a/daemon-client.js';
import { OpenDesignA2AExecutor } from '../a2a/executor.js';

export interface RegisterA2ARoutesOptions {
  daemonUrlRef: { readonly current: string | null };
  appVersion: string;
  pollIntervalMs?: number;
  requiresBearerAuth?: boolean;
  publicBaseUrl?: (req: Request) => string;
}

export function registerA2ARoutes(
  app: Express,
  options: RegisterA2ARoutesOptions,
): void {
  const executor = new OpenDesignA2AExecutor({
    daemon: new HttpOpenDesignA2ADaemonClient({
      baseUrl: () => options.daemonUrlRef.current,
    }),
    ...(options.pollIntervalMs !== undefined ? { pollIntervalMs: options.pollIntervalMs } : {}),
  });
  const requestHandler = new DefaultRequestHandler(
    buildOpenDesignAgentCard(
      'http://127.0.0.1',
      options.appVersion,
      options.requiresBearerAuth,
    ),
    new InMemoryTaskStore(),
    executor,
  );

  app.use('/.well-known/agent-card.json', (req, res, next) => {
    const publicBaseUrl = options.publicBaseUrl?.(req)
      ?? options.daemonUrlRef.current
      ?? 'http://127.0.0.1';
    return agentCardHandler({
      agentCardProvider: async () => buildOpenDesignAgentCard(
        publicBaseUrl,
        options.appVersion,
        options.requiresBearerAuth,
      ),
      cache: { maxAge: 0 },
    })(req, res, next);
  });
  app.use('/api/a2a', jsonRpcHandler({
    requestHandler,
    userBuilder: UserBuilder.noAuthentication,
  }));
}

export function buildOpenDesignAgentCard(
  baseUrl: string,
  appVersion: string,
  requiresBearerAuth = false,
): AgentCard {
  const normalizedBase = baseUrl.replace(/\/$/, '');
  const inputModes = [
    'text/plain',
    'application/vnd.open-design.question-form-answer+json',
  ];
  const outputModes = [
    'text/plain',
    'application/vnd.open-design.question-form+json',
    'application/vnd.open-design.artifact+json',
    'text/html',
  ];
  return {
    name: 'Open Design',
    description:
      'Creates and refines design artifacts through Open Design agents, skills, and workflows.',
    supportedInterfaces: [{
      url: `${normalizedBase}/api/a2a`,
      protocolBinding: 'JSONRPC',
      tenant: '',
      protocolVersion: '1.0',
    }],
    provider: {
      organization: 'Open Design',
      url: 'https://github.com/nexu-io/open-design',
    },
    version: appVersion,
    documentationUrl: 'https://github.com/nexu-io/open-design',
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false,
      extensions: [],
    },
    securitySchemes: requiresBearerAuth ? {
      bearer: {
        scheme: {
          $case: 'httpAuthSecurityScheme',
          value: {
            description: 'Open Design daemon API bearer token.',
            scheme: 'Bearer',
            bearerFormat: 'opaque',
          },
        },
      },
    } : {},
    securityRequirements: requiresBearerAuth
      ? [{ schemes: { bearer: { list: [] } } }]
      : [],
    defaultInputModes: inputModes,
    defaultOutputModes: outputModes,
    skills: [{
      id: 'design-artifact',
      name: 'Create or refine a design artifact',
      description:
        'Runs an Open Design agent, skill, or workflow and asks structured clarification questions when needed.',
      tags: ['design', 'ui', 'artifact', 'workflow'],
      examples: [
        'Create a responsive product landing page for a developer tool.',
        'Refine this dashboard with a clearer information hierarchy.',
      ],
      inputModes,
      outputModes,
      securityRequirements: requiresBearerAuth
        ? [{ schemes: { bearer: { list: [] } } }]
        : [],
    }],
    signatures: [],
  };
}
