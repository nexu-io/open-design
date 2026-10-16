/** Controlled pure TS mirror of packages/shared/src/material-action-roles.ts
 * and the approved nonempty roleBindings v1 contract; no sibling runtime import. */
import { z } from "zod";
import { placementKeySchema } from "./touchpoint-component-v2.js";

/** Registered template metadata, never authored button data or inferred styling. */
export const materialActionRoleBindingSchema = z
  .object({
    placementKey: z.lazy(() => placementKeySchema),
    fieldKey: z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/),
    buttonId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/),
    role: z.enum(["primary", "secondary"]),
  })
  .strict();
export const materialActionRolesSchema = z
  .object({
    version: z.literal(1),
    bindings: z.array(materialActionRoleBindingSchema).min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    for (const [index, binding] of value.bindings.entries()) {
      const key = `${binding.placementKey}/${binding.buttonId}`;
      if (ids.has(key))
        ctx.addIssue({
          code: "custom",
          path: ["bindings", index],
          message: "duplicate_or_ambiguous_role_binding",
        });
      ids.add(key);
    }
  });
export type MaterialActionRoles = z.infer<typeof materialActionRolesSchema>;
/** ASCII tuple comparison, independent of runtime locale and input order. */
export function canonicalMaterialActionRoles(
  value: MaterialActionRoles,
): MaterialActionRoles {
  const parsed = materialActionRolesSchema.parse(value);
  parsed.bindings.sort((a, b) => {
    for (const key of [
      "placementKey",
      "fieldKey",
      "buttonId",
      "role",
    ] as const) {
      if (a[key] < b[key]) return -1;
      if (a[key] > b[key]) return 1;
    }
    return 0;
  });
  return parsed;
}
/** An unselected or unregistered placement gets no metadata property. */
export function selectMaterialActionRoles(
  value: MaterialActionRoles | undefined,
  placements: readonly string[],
): MaterialActionRoles | undefined {
  if (value === undefined) return undefined;
  const canonical = canonicalMaterialActionRoles(value);
  const bindings = canonical.bindings.filter((binding) =>
    placements.includes(binding.placementKey),
  );
  return bindings.length ? { version: 1, bindings } : undefined;
}
