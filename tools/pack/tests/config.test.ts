import { afterEach, describe, expect, it } from "vitest";

import { resolveToolPackConfig } from "../src/config.js";

const savedTelemetryRelayUrl = process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
const savedDaemonSentryDsn = process.env.OPEN_DESIGN_DAEMON_SENTRY_DSN;
const savedDaemonSentryEnvironment = process.env.OPEN_DESIGN_DAEMON_SENTRY_ENVIRONMENT;
const savedDaemonSentryTracesSampleRate = process.env.OPEN_DESIGN_DAEMON_SENTRY_TRACES_SAMPLE_RATE;
const savedNextPublicSentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const savedSentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const savedSentryDsn = process.env.SENTRY_DSN;
const savedSentryEnvironment = process.env.SENTRY_ENVIRONMENT;
const savedSentryOrg = process.env.SENTRY_ORG;
const savedSentryProject = process.env.SENTRY_PROJECT;

afterEach(() => {
  if (savedTelemetryRelayUrl == null) {
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
  } else {
    process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL = savedTelemetryRelayUrl;
  }
  if (savedDaemonSentryDsn == null) {
    delete process.env.OPEN_DESIGN_DAEMON_SENTRY_DSN;
  } else {
    process.env.OPEN_DESIGN_DAEMON_SENTRY_DSN = savedDaemonSentryDsn;
  }
  if (savedDaemonSentryEnvironment == null) {
    delete process.env.OPEN_DESIGN_DAEMON_SENTRY_ENVIRONMENT;
  } else {
    process.env.OPEN_DESIGN_DAEMON_SENTRY_ENVIRONMENT = savedDaemonSentryEnvironment;
  }
  if (savedDaemonSentryTracesSampleRate == null) {
    delete process.env.OPEN_DESIGN_DAEMON_SENTRY_TRACES_SAMPLE_RATE;
  } else {
    process.env.OPEN_DESIGN_DAEMON_SENTRY_TRACES_SAMPLE_RATE = savedDaemonSentryTracesSampleRate;
  }
  if (savedNextPublicSentryDsn == null) {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  } else {
    process.env.NEXT_PUBLIC_SENTRY_DSN = savedNextPublicSentryDsn;
  }
  if (savedSentryAuthToken == null) {
    delete process.env.SENTRY_AUTH_TOKEN;
  } else {
    process.env.SENTRY_AUTH_TOKEN = savedSentryAuthToken;
  }
  if (savedSentryDsn == null) {
    delete process.env.SENTRY_DSN;
  } else {
    process.env.SENTRY_DSN = savedSentryDsn;
  }
  if (savedSentryEnvironment == null) {
    delete process.env.SENTRY_ENVIRONMENT;
  } else {
    process.env.SENTRY_ENVIRONMENT = savedSentryEnvironment;
  }
  if (savedSentryOrg == null) {
    delete process.env.SENTRY_ORG;
  } else {
    process.env.SENTRY_ORG = savedSentryOrg;
  }
  if (savedSentryProject == null) {
    delete process.env.SENTRY_PROJECT;
  } else {
    process.env.SENTRY_PROJECT = savedSentryProject;
  }
});

describe("resolveToolPackConfig web Sentry", () => {
  it("reads web Sentry build env separately from daemon Sentry env", () => {
    process.env.OPEN_DESIGN_DAEMON_SENTRY_DSN = "https://public@example.ingest.sentry.io/daemon";
    process.env.NEXT_PUBLIC_SENTRY_DSN = " https://public@example.ingest.sentry.io/web-public ";
    process.env.SENTRY_AUTH_TOKEN = " upload-token ";
    process.env.SENTRY_DSN = " https://public@example.ingest.sentry.io/web ";
    process.env.SENTRY_ENVIRONMENT = " production ";
    process.env.SENTRY_ORG = " zhenheai ";
    process.env.SENTRY_PROJECT = " open-design-web ";

    const config = resolveToolPackConfig("mac", { namespace: "web-sentry-test" });

    expect(config.sentryDsn).toBe("https://public@example.ingest.sentry.io/daemon");
    expect(config.webSentryDsn).toBe("https://public@example.ingest.sentry.io/web");
    expect(config.webSentryPublicDsn).toBe("https://public@example.ingest.sentry.io/web-public");
    expect(config.sentryAuthToken).toBe("upload-token");
    expect(config.sentryEnvironment).toBe("production");
    expect(config.sentryOrg).toBe("zhenheai");
    expect(config.sentryProject).toBe("open-design-web");
  });
});

describe("resolveToolPackConfig telemetry relay", () => {
  it("reads and normalizes OPEN_DESIGN_TELEMETRY_RELAY_URL for packaged config", () => {
    process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL = "https://telemetry.open-design.ai/api/langfuse//";
    const config = resolveToolPackConfig("mac", { namespace: "telemetry-test" });
    expect(config.telemetryRelayUrl).toBe("https://telemetry.open-design.ai/api/langfuse");
  });

  it("rejects invalid telemetry relay URLs", () => {
    process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL = "not-a-url";
    expect(() => resolveToolPackConfig("mac")).toThrow(
      /OPEN_DESIGN_TELEMETRY_RELAY_URL must be an absolute https URL/,
    );
  });

  it("rejects plaintext telemetry relay URLs for packaged config", () => {
    process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL = "http://telemetry.open-design.ai/api/langfuse";
    expect(() => resolveToolPackConfig("mac")).toThrow(
      /OPEN_DESIGN_TELEMETRY_RELAY_URL must use https/,
    );
  });
});

describe("resolveToolPackConfig daemon Sentry", () => {
  it("reads and normalizes daemon Sentry env for packaged config", () => {
    process.env.OPEN_DESIGN_DAEMON_SENTRY_DSN = " https://public@example.ingest.sentry.io/1 ";
    process.env.OPEN_DESIGN_DAEMON_SENTRY_ENVIRONMENT = " production ";
    process.env.OPEN_DESIGN_DAEMON_SENTRY_TRACES_SAMPLE_RATE = "0.25";

    const config = resolveToolPackConfig("mac", { namespace: "sentry-test" });

    expect(config.sentryDsn).toBe("https://public@example.ingest.sentry.io/1");
    expect(config.sentryEnvironment).toBe("production");
    expect(config.sentryTracesSampleRate).toBe("0.25");
  });

  it("rejects invalid daemon Sentry DSNs", () => {
    process.env.OPEN_DESIGN_DAEMON_SENTRY_DSN = "not-a-url";
    expect(() => resolveToolPackConfig("mac")).toThrow(
      /OPEN_DESIGN_DAEMON_SENTRY_DSN must be an absolute https URL/,
    );
  });

  it("rejects plaintext daemon Sentry DSNs", () => {
    process.env.OPEN_DESIGN_DAEMON_SENTRY_DSN = "http://example.ingest.sentry.io/1";
    expect(() => resolveToolPackConfig("mac")).toThrow(
      /OPEN_DESIGN_DAEMON_SENTRY_DSN must use https/,
    );
  });

  it("rejects invalid daemon Sentry sample rates", () => {
    process.env.OPEN_DESIGN_DAEMON_SENTRY_DSN = "https://public@example.ingest.sentry.io/1";
    process.env.OPEN_DESIGN_DAEMON_SENTRY_TRACES_SAMPLE_RATE = "1.5";

    expect(() => resolveToolPackConfig("mac")).toThrow(
      /OPEN_DESIGN_DAEMON_SENTRY_TRACES_SAMPLE_RATE must be between 0 and 1/,
    );
  });
});
