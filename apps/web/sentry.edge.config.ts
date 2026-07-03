import * as Sentry from '@sentry/nextjs';

import { buildServerSentryOptions } from './src/sentry';

Sentry.init(buildServerSentryOptions());
