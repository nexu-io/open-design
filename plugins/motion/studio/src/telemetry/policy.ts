// Disable upstream measurement and automatic experiment enrolment in every build.
export function browserTelemetryAllowed(): boolean { return false; }

declare global {
  interface Window {
    __HF_CLI_TELEMETRY_DISABLED?: boolean;
  }
}
