/**
 * Row virtualization is the product default. Setting the environment flag to
 * "0" keeps one explicit rollback path for comparisons and emergencies.
 *
 * It lives in its own module so the scroll-viewport hook can read it without
 * importing the virtualization hook that already imports the viewport snapshot
 * type back, which would close an import cycle.
 */
export const STUDIO_TIMELINE_ROW_VIRTUALIZATION_ENABLED =
  import.meta.env?.VITE_STUDIO_TIMELINE_ROW_VIRTUALIZATION_ENABLED !== "0";
