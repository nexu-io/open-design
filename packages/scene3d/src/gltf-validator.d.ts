// The Khronos glTF reference validator ships no type declarations. We only
// touch `validateBytes`, whose report shape we narrow at the call site.
declare module "gltf-validator" {
  export function validateBytes(bytes: Uint8Array): Promise<{
    issues: { messages: Array<{ code: string; message: string; severity: number; pointer?: string }> };
  }>;
}
