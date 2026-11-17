import type { Express } from "express";
import { parseReferralSummary } from "@open-design/contracts";

export function registerVelaReferralRoutes(
  app: Express,
  readContext: () => Promise<{ apiUrl: string; controlKey?: string } | null>,
) {
  // Both reads use the daemon's current control session. The account ID is a
  // comparison hint for the browser; it is never a credential or authority.
  const registerRead = (
    path: string,
    upstreamPath: string,
    parse: (value: unknown) => object | null,
  ) => {
    app.get(path, async (_req, res) => {
      res.setHeader("Cache-Control", "no-store");
      try {
        const context = await readContext();
        if (!context?.controlKey) {
          res.status(401).json({ error: "vela_control_key_required" });
          return;
        }
        const response = await fetch(new URL(upstreamPath, context.apiUrl), {
          headers: {
            authorization: `Bearer ${context.controlKey}`,
            accept: "application/json",
          },
          signal: AbortSignal.timeout(10_000),
          redirect: "error",
        });
        if (!response.ok) {
          res.status(response.status).json({ error: "referral_summary_unavailable" });
          return;
        }
        const result = parse(await response.json());
        const current = await readContext();
        if (current?.apiUrl !== context.apiUrl || current?.controlKey !== context.controlKey) {
          res.status(409).json({ error: "referral_identity_changed" });
          return;
        }
        if (!result) {
          res.status(502).json({ error: "referral_summary_unavailable" });
          return;
        }
        res.json(result);
      } catch {
        res.status(502).json({ error: "referral_summary_unavailable" });
      }
    });
  };
  registerRead("/api/integrations/vela/referral-summary", "/api/v1/referrals/me", parseReferralSummary);
  registerRead("/api/integrations/vela/referral-account", "/api/v1/me", (value) => {
    if (!value || typeof value !== "object" || !("id" in value)) return null;
    const id = value.id;
    return typeof id === "string" && id.length > 0 && id.length <= 128
      ? { appUserId: id }
      : null;
  });
}
