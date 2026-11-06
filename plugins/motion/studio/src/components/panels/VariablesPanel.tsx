import { useI18n } from "../../i18n/I18n";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type {
  Composition,
  CompositionVariable,
  VariableUsageReport,
  VariableValidationIssue,
} from "@hyperframes/sdk";
import type { PublishSdkSession } from "../../utils/sdkCutover";
import { useStudioPlaybackContext, useStudioShellContext } from "../../contexts/StudioContext";
import { useDomEditContext } from "../../contexts/DomEditContext";
import { useFileManagerContext } from "../../contexts/FileManagerContext";
import { VariablesBindElement, type BindAction, applyBind } from "./VariablesBindElement";
import { useVariablesPersist } from "../../hooks/useVariablesPersist";
import { VariablesOtherCompositions } from "./VariablesOtherCompositions";
import { RowAction } from "./VariablesRowAction";
import { usePreviewVariablesStore } from "../../hooks/previewVariablesStore";
import {
  DeclarationForm,
  draftFromDeclaration,
  mergeDeclarationEdit,
  EMPTY_DRAFT,
} from "./VariablesDeclarationForm";
import { PreviewValueControl } from "./VariablesValueControls";
import { copyTextToClipboard } from "../../utils/clipboard";
import { resolveMasterCompositionPath } from "../../utils/studioUrlState";
import { isScalarVariableValue as isScalar } from "@hyperframes/core/variables";

/** POSIX single-quote escaping so the copied command survives quotes in values. */
function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export interface StudioEditPersistenceProps {
  sdkSession: Composition | null;
  publishSdkSession: PublishSdkSession;
  reloadPreview: () => void;
  recordEdit: (entry: {
    label: string;
    files: Record<string, { before: string; after: string }>;
  }) => Promise<void>;
}

type VariablesPanelProps = StudioEditPersistenceProps;

function formatIssue(issue: VariableValidationIssue): string {
  switch (issue.kind) {
    case "undeclared":
      return `"${issue.variableId}" is not declared.`;
    case "type-mismatch":
      return `"${issue.variableId}" expects ${issue.expected}, got ${issue.actual}.`;
    case "enum-out-of-range":
      return `"${issue.variableId}" must be one of: ${issue.allowed.join(", ")}.`;
  }
}

function ValidationStrip({ issues }: { issues: VariableValidationIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="space-y-1 rounded-lg border border-danger/40 bg-danger/15 p-2">
      {issues.map((issue) => (
        <p key={`${issue.kind}:${issue.variableId}`} className="text-[10px] text-danger-ink">
          {formatIssue(issue)}
        </p>
      ))}
    </div>
  );
}

// fallow-ignore-next-line complexity
function VariableRow({
  decl,
  value,
  overridden,
  unused,
  editing,
  onCommitPreview,
  onSetDefault,
  onToggleEdit,
  onSaveEdit,
  onRemove,
}: {
  decl: CompositionVariable;
  value: unknown;
  overridden: boolean;
  unused: boolean;
  editing: boolean;
  onCommitPreview: (value: unknown) => void;
  onSetDefault: (value: string | number | boolean) => void;
  onToggleEdit: () => void;
  onSaveEdit: (decl: CompositionVariable) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-1.5 rounded-lg border border-neutral-800/70 p-2">
      <div className="flex items-center gap-1.5">
        <span className="truncate text-[10px] font-medium text-neutral-300">{decl.label}</span>
        <span className="rounded-sm bg-neutral-800 px-1 py-px font-mono text-[8px] text-neutral-500">
          {decl.type}
        </span>
        {unused && (
          <span
            className="rounded-sm bg-amber-500/15 px-1 py-px text-[8px] text-warning-ink"
            title={t("No script reads this variable")}
          >
            {t("unused")}</span>
        )}
        {overridden && <span className="h-1.5 w-1.5 rounded-full bg-studio-accent" />}
        <span className="ml-auto flex items-center gap-1">
          {overridden && isScalar(value) && (
            <RowAction
              label={t("Set default")}
              title={t("Persist this value as the declared default")}
              onClick={() => onSetDefault(value)}
            />
          )}
          <RowAction label={t("Edit")} title={t("Edit declaration")} onClick={onToggleEdit} />
          <RowAction label="✕" title={t("Remove declaration")} danger onClick={onRemove} />
        </span>
      </div>
      {decl.description && <p className="text-[9px] text-neutral-500">{decl.description}</p>}
      {editing ? (
        <DeclarationForm
          initial={draftFromDeclaration(decl)}
          submitLabel="Save"
          onSubmit={(edited) => onSaveEdit(mergeDeclarationEdit(decl, edited))}
          onCancel={onToggleEdit}
        />
      ) : (
        <PreviewValueControl decl={decl} value={value} onCommit={onCommitPreview} />
      )}
    </div>
  );
}

function UndeclaredReads({
  usage,
  onDeclare,
}: {
  usage: VariableUsageReport | null;
  onDeclare: (id: string) => void;
}) {
  const { t } = useI18n();
  if (!usage || usage.undeclaredReads.length === 0) return null;
  return (
    <div className="space-y-1 rounded-lg border border-neutral-800/70 bg-neutral-900/40 p-2">
      <p className="text-[9px] font-medium uppercase tracking-wider text-neutral-500">
        {t("Read by scripts, not declared")}</p>
      {usage.undeclaredReads.map((id) => (
        <div key={id} className="flex items-center gap-2">
          <code className="font-mono text-[10px] text-neutral-400">{id}</code>
          <RowAction
            label={t("Declare")}
            title={t("Declare as a string variable")}
            onClick={() => onDeclare(id)}
          />
        </div>
      ))}
    </div>
  );
}

/** Preview-state pill + reset, shown in the panel header. */
function PreviewModeHeader({
  overrideCount,
  onReset,
}: {
  overrideCount: number;
  onReset: () => void;
}) {
  const { t } = useI18n();
  const hasOverrides = overrideCount > 0;
  return (
    <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-neutral-200">{t("Variables")}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${
            hasOverrides ? "bg-studio-accent/20 text-accent-ink" : "bg-neutral-800 text-neutral-500"
          }`}
        >
          {hasOverrides ? t("Previewing {overrideCount} custom", { overrideCount: overrideCount }) : t("Previewing defaults")}
        </span>
      </div>
      {hasOverrides && (
        <button
          type="button"
          onClick={onReset}
          className="h-6 rounded-sm px-2 text-[10px] text-neutral-400 hover:text-neutral-200"
        >
          {t("Reset")}</button>
      )}
    </div>
  );
}

/**
 * Developer/agent handoff: copy the effective values as JSON or as a
 * ready-to-run render command mirroring exactly what the preview shows.
 */
function HandoffFooter({
  effectiveValues,
  compPath,
  onCopy,
}: {
  effectiveValues: Record<string, unknown>;
  compPath: string;
  onCopy: (text: string, what: string) => void;
}) {
  const { t } = useI18n();
  const json = JSON.stringify(effectiveValues);
  const command = `npx hyperframes render ${shellSingleQuote(compPath)} --variables ${shellSingleQuote(json)}`;
  return (
    <div className="space-y-1.5 rounded-lg border border-neutral-800/70 bg-neutral-900/40 p-2">
      <p className="text-[9px] font-medium uppercase tracking-wider text-neutral-500">
        {t("Use this template")}</p>
      <code className="block truncate font-mono text-[9px] text-neutral-500" title={command}>
        {command}
      </code>
      <div className="flex items-center gap-2">
        <RowAction
          label={t("Copy render command")}
          title={t("CLI command rendering exactly what the preview shows")}
          onClick={() => onCopy(command, "Render command")}
        />
        <RowAction
          label={t("Copy values JSON")}
          title={t("Effective values (defaults merged with preview overrides)")}
          onClick={() => onCopy(json, "Values JSON")}
        />
      </div>
    </div>
  );
}

const EMPTY_STATE = (
  <p className="text-[10px] leading-relaxed text-neutral-500">
    No variables declared. Variables make parts of this composition dynamic. Declare them here (or
    in <code className="font-mono">data-composition-variables</code>), read them with{" "}
    <code className="font-mono">getVariables()</code>, and pass values at render time with{" "}
    <code className="font-mono">--variables</code>.
  </p>
);

// Panel orchestrator — JSX conditionals per section, same shape as StudioRightPanels.
// fallow-ignore-next-line complexity
export const VariablesPanel = memo(function VariablesPanel({
  sdkSession,
  publishSdkSession,
  reloadPreview,
  recordEdit,
}: VariablesPanelProps) {
  const { t } = useI18n();
  const { activeCompPath, showToast } = useStudioShellContext();
  const { refreshKey } = useStudioPlaybackContext();
  const { readProjectFile, writeProjectFile, compositions } = useFileManagerContext();
  const { domEditSelection } = useDomEditContext();
  // Master view (no activeCompPath) targets the real main composition, not a
  // hardcoded index.html — used for both the persist write target and the
  // handoff render command. Null only when the project has no composition.
  const effectiveCompPath = activeCompPath ?? resolveMasterCompositionPath(compositions);
  const previewValues = usePreviewVariablesStore((s) => s.values);
  const setPreviewValues = usePreviewVariablesStore((s) => s.setValues);

  // Bumped after each persisted schema edit so declarations re-derive without
  // waiting for the session reload round-trip.
  const [revision, setRevision] = useState(0);
  // Also bump on any session mutation (undo/redo, edits dispatched by other
  // panels or agents) — the memos below must never trust refreshKey alone.
  useEffect(() => {
    if (!sdkSession) return;
    return sdkSession.on("change", () => setRevision((r) => r + 1));
  }, [sdkSession]);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const persistVariables = useVariablesPersist({
    sdkSession,
    activeCompPath: effectiveCompPath,
    readProjectFile,
    writeProjectFile,
    recordEdit,
    reloadPreview,
    publishSdkSession,
  });

  const declarations = useMemo(
    () => sdkSession?.getVariableDeclarations() ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sdkSession, refreshKey, revision],
  );
  const usage = useMemo(
    () => sdkSession?.getVariableUsage() ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sdkSession, refreshKey, revision],
  );
  const issues = useMemo(
    () => (previewValues && sdkSession ? sdkSession.validateVariableValues(previewValues) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sdkSession, previewValues, refreshKey, revision],
  );
  const effectiveValues = useMemo(
    () => sdkSession?.getVariableValues(previewValues ?? undefined) ?? {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sdkSession, previewValues, refreshKey, revision],
  );

  const copyToClipboard = useCallback(
    (text: string, what: string) => {
      // Shared helper carries the execCommand fallback Safari needs.
      void copyTextToClipboard(text).then((ok) =>
        showToast(
          ok ? `${what} copied` : `Couldn't copy ${what.toLowerCase()}`,
          ok ? "info" : "error",
        ),
      );
    },
    [showToast],
  );

  const dropPreviewOverride = useCallback(
    (id: string) => {
      if (previewValues && id in previewValues) {
        const next = { ...previewValues };
        delete next[id];
        setPreviewValues(next);
      }
    },
    [previewValues, setPreviewValues],
  );

  const commitPreviewValue = useCallback(
    (id: string, value: unknown, declDefault: unknown) => {
      const next = { ...(previewValues ?? {}) };
      if (JSON.stringify(value) === JSON.stringify(declDefault)) {
        delete next[id];
      } else {
        next[id] = value;
      }
      setPreviewValues(next);
      reloadPreview();
    },
    [previewValues, setPreviewValues, reloadPreview],
  );

  const runSchemaEdit = useCallback(
    async (label: string, mutate: (session: Composition) => void): Promise<boolean> => {
      try {
        const changed = await persistVariables(label, mutate);
        if (changed) setRevision((r) => r + 1);
        else showToast(`${label}: no change applied`, "info");
        return changed;
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err), "error");
        return false;
      }
    },
    [persistVariables, showToast],
  );

  const handleAdd = useCallback(
    (decl: CompositionVariable) => {
      if (!sdkSession) return;
      const check = sdkSession.can({ type: "declareVariable", declaration: decl });
      if (!check.ok) {
        showToast(check.message, "error");
        return;
      }
      setAddOpen(false);
      void runSchemaEdit(`Declare variable "${decl.id}"`, (s) => s.declareVariable(decl));
    },
    [sdkSession, runSchemaEdit, showToast],
  );

  const handleUpdate = useCallback(
    (decl: CompositionVariable) => {
      if (!sdkSession) return;
      const check = sdkSession.can({
        type: "updateVariableDeclaration",
        id: decl.id,
        declaration: decl,
      });
      if (!check.ok) {
        showToast(check.message, "error");
        return;
      }
      setEditingId(null);
      void runSchemaEdit(`Edit variable "${decl.id}"`, (s) =>
        s.updateVariableDeclaration(decl.id, decl),
      );
    },
    [sdkSession, runSchemaEdit, showToast],
  );

  const handleRemove = useCallback(
    (id: string) => {
      if (!sdkSession) return;
      const check = sdkSession.can({ type: "removeVariableDeclaration", id });
      if (!check.ok) {
        showToast(check.message, "error");
        return;
      }
      // Drop the preview override only if the declaration was actually removed —
      // otherwise a rejected/failed edit would leave the row on disk but silently
      // wipe the user's custom preview value.
      void runSchemaEdit(`Remove variable "${id}"`, (s) => s.removeVariableDeclaration(id)).then(
        (changed) => {
          if (changed) dropPreviewOverride(id);
        },
      );
    },
    [sdkSession, runSchemaEdit, dropPreviewOverride, showToast],
  );

  const handleSetDefault = useCallback(
    (id: string, value: string | number | boolean) => {
      void runSchemaEdit(`Set default for "${id}"`, (s) => s.setVariableValue(id, value));
      // The override now equals the persisted default — drop it from preview state.
      dropPreviewOverride(id);
    },
    [runSchemaEdit, dropPreviewOverride],
  );

  const resetPreview = useCallback(() => {
    setPreviewValues(null);
    reloadPreview();
  }, [setPreviewValues, reloadPreview]);

  const handleBind = useCallback(
    // Guard chain (session, selection, type-compat) — one branch per guard.
    // fallow-ignore-next-line complexity
    (action: BindAction, id: string) => {
      if (!sdkSession || !domEditSelection?.hfId) return;
      // Binding to an existing variable is allowed, but only when the types
      // agree — wiring a color style to a string variable silently breaks
      // the element's styling.
      const existing = sdkSession.getVariableDeclarations().find((d) => d.id === id);
      const wanted = action.declaration(id).type;
      if (existing && existing.type !== wanted) {
        showToast(
          `"${id}" is already a ${existing.type} variable. Pick another id for this ${wanted} binding`,
          "error",
        );
        return;
      }
      const hfId = domEditSelection.hfId;
      void runSchemaEdit(`Bind ${action.label.toLowerCase()} to "${id}"`, (s) =>
        applyBind(s, hfId, action, id),
      );
    },
    [sdkSession, domEditSelection, runSchemaEdit, showToast],
  );

  // The bind gesture targets the composition the session models — a selection
  // from another source file must not write bindings into this one.
  const bindableSelection =
    domEditSelection?.hfId && domEditSelection.sourceFile === (activeCompPath ?? "index.html")
      ? domEditSelection
      : null;

  if (!sdkSession) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="text-xs text-neutral-500">{t("Open a composition to manage its variables.")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PreviewModeHeader
        overrideCount={previewValues ? Object.keys(previewValues).length : 0}
        onReset={resetPreview}
      />
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {bindableSelection && (
          <VariablesBindElement
            key={bindableSelection.hfId}
            selection={bindableSelection}
            sdkSession={sdkSession}
            onBind={handleBind}
          />
        )}
        <ValidationStrip issues={issues} />
        {declarations.length === 0 && !addOpen && EMPTY_STATE}
        {/* fallow-ignore-next-line complexity */}
        {declarations.map((decl) => (
          <VariableRow
            key={decl.id}
            decl={decl}
            value={
              previewValues && decl.id in previewValues ? previewValues[decl.id] : decl.default
            }
            overridden={previewValues !== null && decl.id in previewValues}
            unused={
              usage !== null && !usage.scanIncomplete && usage.unusedDeclarations.includes(decl.id)
            }
            editing={editingId === decl.id}
            onCommitPreview={(v) => commitPreviewValue(decl.id, v, decl.default)}
            onSetDefault={(v) => handleSetDefault(decl.id, v)}
            onToggleEdit={() => setEditingId(editingId === decl.id ? null : decl.id)}
            onSaveEdit={handleUpdate}
            onRemove={() => handleRemove(decl.id)}
          />
        ))}
        <UndeclaredReads
          usage={usage}
          onDeclare={(id) => handleAdd({ id, type: "string", label: id, default: "" })}
        />
        {usage?.scanIncomplete && (
          <p className="text-[9px] text-neutral-600">
            {t("Scripts access variables dynamically, so usage info may be incomplete.")}</p>
        )}
        {declarations.length > 0 && (
          <HandoffFooter
            effectiveValues={effectiveValues}
            compPath={effectiveCompPath ?? "index.html"}
            onCopy={copyToClipboard}
          />
        )}
        {addOpen ? (
          <DeclarationForm
            initial={EMPTY_DRAFT}
            submitLabel="Add variable"
            onSubmit={handleAdd}
            onCancel={() => setAddOpen(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="h-7 w-full rounded-lg border border-dashed border-neutral-800 text-[10px] font-medium text-neutral-500 transition-colors hover:border-neutral-700 hover:text-neutral-300"
          >
            {t("+ Add variable")}</button>
        )}
        <VariablesOtherCompositions
          compositionPaths={compositions}
          excludePath={effectiveCompPath}
          refreshKey={`${refreshKey}:${revision}`}
          readProjectFile={readProjectFile}
          writeProjectFile={writeProjectFile}
          recordEdit={recordEdit}
          reloadPreview={reloadPreview}
        />
      </div>
    </div>
  );
});
