/** Analytics observers cannot throw into their caller's business action. Payload construction belongs inside this boundary. */
export function observeAnalytics(emit: () => void): void {
  try {
    emit();
  } catch {
    // Measurement is optional. Do not log its potentially sensitive payload.
  }
}
