/** Finite Closure runtime command used to arm Electron-only folder access. */
export const OPEN_DESIGN_ELECTRON_AUTH_REGISTER_COMMAND = "open-design.electron-auth.register.v1" as const;

export type OpenDesignElectronAuthRegisterRequest = Readonly<{
  schemaVersion: 1;
  operation: "register";
  secret: string;
}>;

export type OpenDesignElectronAuthRegisterResult = Readonly<{
  schemaVersion: 1;
  accepted: true;
}>;

export function validateOpenDesignElectronAuthRegisterRequest(
  input: unknown,
): OpenDesignElectronAuthRegisterRequest {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Electron auth registration request must be an object");
  }
  const value = input as Record<string, unknown>;
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(["operation", "schemaVersion", "secret"])) {
    throw new Error("Electron auth registration request fields are invalid");
  }
  if (value.schemaVersion !== 1 || value.operation !== "register" || typeof value.secret !== "string") {
    throw new Error("Electron auth registration request is unsupported");
  }
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(value.secret), (character) => character.charCodeAt(0));
  } catch {
    throw new Error("Electron auth registration secret must be base64");
  }
  if (bytes.byteLength !== 32) throw new Error("Electron auth registration secret must contain 32 bytes");
  return Object.freeze({ schemaVersion: 1, operation: "register", secret: value.secret });
}
