import { useI18n } from "../../i18n/I18n";
import { useEffect, useMemo, useState } from "react";
import { studioApiFetch } from "../../utils/studioApiFetch";

// Cross-project asset view — the global media-use cache (~/.media), fetched from
// /api/assets/global. Self-contained (owns its fetch + state) so AssetsTab stays
// focused on the local view.

export interface GlobalAssetRecord {
  id?: string;
  type?: string;
  description?: string;
  entity?: string;
  sha?: string;
}

export interface GlobalAssetRow {
  id: string;
  type: string;
  label: string;
}

/**
 * Normalize global records into display rows, filtered by an optional query
 * (id / type / description / entity). Pure — unit-tested.
 */
export function globalAssetRows(records: GlobalAssetRecord[], query = ""): GlobalAssetRow[] {
  const q = query.trim().toLowerCase();
  return records
    .filter((r) =>
      !q
        ? true
        : [r.id, r.type, r.description, r.entity].some(
            (f) => f && String(f).toLowerCase().includes(q),
          ),
    )
    .map((r) => ({
      id: r.id ?? r.sha ?? "asset",
      type: r.type ?? "asset",
      label: r.description || r.entity || r.id || r.sha || "asset",
    }));
}

export function GlobalAssetsView({ searchQuery }: { searchQuery: string }) {
  const { t } = useI18n();
  const [records, setRecords] = useState<GlobalAssetRecord[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    studioApiFetch("/api/assets/global")
      .then((r) => (r.ok ? r.json() : { assets: [] }))
      .then((d) => {
        if (!cancelled) setRecords(Array.isArray(d.assets) ? d.assets : []);
      })
      .catch(() => {
        if (!cancelled) setRecords([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => globalAssetRows(records ?? [], searchQuery), [records, searchQuery]);

  if (records === null) {
    return <p className="px-4 py-3 text-[11px] text-panel-text-5">{t("Loading global assets…")}</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="px-4 py-3 text-[11px] text-panel-text-5">
        {t("No assets in the global cache yet. Resolved media is promoted to")}{" "}<code>~/.media</code> {t("and becomes reusable across projects.")}</p>
    );
  }
  return (
    <div>
      <div className="px-4 py-2 border-t border-panel-border text-[11px] text-panel-text-5">
        {rows.length} {t("reusable across all projects")}</div>
      {rows.map((row) => (
        <div
          key={row.id}
          className="px-4 py-1.5 flex items-center gap-2.5 border-l-2 border-transparent hover:bg-neutral-800/50"
          title={`${row.id} · ${row.type}`}
        >
          <span className="text-[9px] font-medium text-neutral-600 uppercase w-10 shrink-0">
            {row.type}
          </span>
          <span className="text-xs text-panel-text-1 truncate">{row.label}</span>
        </div>
      ))}
    </div>
  );
}
