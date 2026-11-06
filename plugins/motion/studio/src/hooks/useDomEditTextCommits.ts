import { trackPreviewFeatureUsed } from "../utils/previewFeatureUsage";
import { useCallback, useRef } from "react";
import { refreshTimelineRowText } from "./refreshTimelineRowText";
import { normalizeDomEditStyleValue } from "../utils/studioHelpers";
import { injectPreviewGoogleFont, injectPreviewImportedFont } from "../utils/studioFontHelpers";
import {
  buildDomEditRichTextPatchOperation,
  findElementForSelection,
  getDomEditTargetKey,
  isTextEditableSelection,
  buildDefaultDomEditTextField,
  type DomEditTextField,
  type DomEditSelection,
} from "../components/editor/domEditing";
import type { ImportedFontAsset } from "../components/editor/fontAssets";
import type { PersistDomEditOperations } from "./domEditCommitTypes";
import { canEditElementTextInline } from "../components/editor/domEditInlineText";
import { buildNextDomTextFields, planDomTextCommit } from "./domEditTextCommitPlan";
import { reportDomEditPersistFailure } from "./domEditPersistFailure";
import {
  bumpDomEditCommitMapVersion,
  domEditCommitDeclined,
  runDomEditCommit,
  runReportedDomEditCommit,
  type DomEditCommitOutcome,
} from "./domEditCommitRunner";
import { commitDomStyles } from "./domStyleCommit";
import { useDomEditAttributeCommits } from "./useDomEditAttributeCommits";
import type { InlineTextEditCommit } from "./useInlineTextEdit";
import type { ResolveDomSelectionOptions } from "./useDomSelectionTypes";

// ── Types ──

export interface UseDomEditTextCommitsParams {
  activeCompPath: string | null;
  previewIframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  showToast: (message: string, tone?: "error" | "info") => void;
  domEditSelection: DomEditSelection | null;
  applyDomSelection: (
    selection: DomEditSelection | null,
    options?: { revealPanel?: boolean; additive?: boolean; preserveGroup?: boolean },
  ) => void;
  refreshDomEditSelectionFromPreview: (selection: DomEditSelection) => void;
  buildDomSelectionFromTarget: (
    target: HTMLElement,
    options?: ResolveDomSelectionOptions,
  ) => Promise<DomEditSelection | null>;
  persistDomEditOperations: PersistDomEditOperations;
  resolveImportedFontAsset: (fontFamilyValue: string) => ImportedFontAsset | null;
  readOnlyPreview: boolean;
}

function canCommitInlineTextSelection(selection: DomEditSelection, element: HTMLElement): boolean {
  if (selection.isCompositionHost || selection.isInsideLockedComposition) return false;
  return canEditElementTextInline(element);
}

async function resyncDomTextSelectionFromPreview(
  doc: Document | null | undefined,
  selection: DomEditSelection,
  activeCompPath: string | null,
  buildDomSelectionFromTarget: UseDomEditTextCommitsParams["buildDomSelectionFromTarget"],
  applyDomSelection: UseDomEditTextCommitsParams["applyDomSelection"],
): Promise<void> {
  if (!doc) return;
  const refreshed = findElementForSelection(doc, selection, activeCompPath);
  if (!refreshed) return;
  refreshTimelineRowText(refreshed);
  const nextSelection = await buildDomSelectionFromTarget(refreshed);
  if (!nextSelection) return;
  applyDomSelection(nextSelection, { revealPanel: false, preserveGroup: true });
}

// ── Hook ──

export function useDomEditTextCommits({
  activeCompPath,
  previewIframeRef,
  showToast,
  domEditSelection,
  applyDomSelection,
  refreshDomEditSelectionFromPreview,
  buildDomSelectionFromTarget,
  persistDomEditOperations,
  resolveImportedFontAsset,
  readOnlyPreview,
}: UseDomEditTextCommitsParams) {
  const latestReadOnlyPreviewRef = useRef(readOnlyPreview);
  latestReadOnlyPreviewRef.current = readOnlyPreview;
  const latestSelectionRef = useRef(domEditSelection);
  latestSelectionRef.current = domEditSelection;
  const domTextCommitVersionRef = useRef(new Map<string, symbol>());
  const domStyleCommitVersionRef = useRef(new Map<string, symbol>());

  const {
    handleDomAttributeCommit,
    handleDomAttributeLiveCommit,
    handleDomAttributeQuietCommit,
    handleDomHtmlAttributeCommit,
    handleDomAttributesCommit,
    handleDomAttributeBatchCommit,
  } = useDomEditAttributeCommits({
    activeCompPath,
    previewIframeRef,
    showToast,
    domEditSelection,
    refreshDomEditSelectionFromPreview,
    persistDomEditOperations,
  });

  const handleDomStyleCommitForSelection = useCallback(
    (
      selection: DomEditSelection,
      propertyOrStylesAsOnePatch: string | Record<string, string>,
      value = "",
    ): Promise<DomEditCommitOutcome> =>
      commitDomStyles(
        {
          activeCompPath,
          previewIframeRef,
          persistDomEditOperations,
          showToast,
          versions: domStyleCommitVersionRef.current,
          resolveImportedFontAsset,
          resync: refreshDomEditSelectionFromPreview,
        },
        selection,
        typeof propertyOrStylesAsOnePatch === "string"
          ? { [propertyOrStylesAsOnePatch]: value }
          : propertyOrStylesAsOnePatch,
      ),
    [
      activeCompPath,
      persistDomEditOperations,
      refreshDomEditSelectionFromPreview,
      resolveImportedFontAsset,
      showToast,
      previewIframeRef,
    ],
  );

  const handleDomStyleCommit = useCallback(
    (property: string, value: string): Promise<DomEditCommitOutcome> =>
      domEditSelection
        ? handleDomStyleCommitForSelection(domEditSelection, property, value)
        : Promise.resolve(domEditCommitDeclined("no-selection")),
    [domEditSelection, handleDomStyleCommitForSelection],
  );

  const handleDomTextCommitForSelection = useCallback(
    async (
      selection: DomEditSelection,
      value: string,
      fieldKey?: string,
    ): Promise<DomEditCommitOutcome> => {
      if (!isTextEditableSelection(selection)) {
        return domEditCommitDeclined("not-text-editable");
      }
      const isLatestTextCommit = bumpDomEditCommitMapVersion(
        domTextCommitVersionRef.current,
        getDomEditTargetKey(selection),
      );
      const nextTextFields = buildNextDomTextFields(selection.textFields, value, fieldKey);
      const textCommit = planDomTextCommit(selection.textFields, nextTextFields, value);
      const iframe = previewIframeRef.current;
      const doc = iframe?.contentDocument;
      let editedElement: HTMLElement | null = null;
      let previousInnerHtml: string | null = null;

      return runReportedDomEditCommit({
        capture: () => {
          if (!doc) return;
          const el = findElementForSelection(doc, selection, activeCompPath);
          if (!el) return;
          editedElement = el;
          previousInnerHtml = el.innerHTML;
        },
        apply: () => {
          if (!editedElement) return;
          if (textCommit.usesSerializedTextFields) {
            editedElement.innerHTML = textCommit.nextContent;
          } else {
            editedElement.textContent = value;
          }
        },
        persist: () =>
          persistDomEditOperations(selection, textCommit.operations, {
            label: "Edit text",
            skipRefresh: true,
            shouldSave: isLatestTextCommit,
          }),
        shouldRevert: () => isLatestTextCommit(),
        revert: () => {
          if (!editedElement || previousInnerHtml === null) return;
          editedElement.innerHTML = previousInnerHtml;
        },
        onError: (error) =>
          reportDomEditPersistFailure(selection, textCommit.operations, error, showToast),
        shouldResync: isLatestTextCommit,
        resync: () =>
          resyncDomTextSelectionFromPreview(
            doc,
            selection,
            activeCompPath,
            buildDomSelectionFromTarget,
            applyDomSelection,
          ),
        onFinally: isLatestTextCommit.release,
      });
    },
    [
      activeCompPath,
      applyDomSelection,
      buildDomSelectionFromTarget,
      persistDomEditOperations,
      previewIframeRef,
      showToast,
    ],
  );

  const handleDomTextCommit = useCallback(
    (value: string, fieldKey?: string): Promise<DomEditCommitOutcome> =>
      domEditSelection
        ? handleDomTextCommitForSelection(domEditSelection, value, fieldKey)
        : Promise.resolve(domEditCommitDeclined("no-selection")),
    [domEditSelection, handleDomTextCommitForSelection],
  );

  /**
   * Persist an element's own markup, for a text edit that styled part of it.
   *
   * Its own commit rather than a mode of the one above: that one plans a change
   * to the text-field model, which escapes markup on the way out and refuses a
   * change in child structure, and both of those are correct for the design
   * panel. Styling a run of characters is neither of those things. The element
   * already holds what the user typed, so there is nothing to apply, only
   * something to save and something to put back if saving fails.
   */
  const handleDomRichTextCommit = useCallback(
    async ({ element, html, previousHtml }: InlineTextEditCommit) => {
      const putBack = () => {
        if (element.isConnected && element.innerHTML === html) element.innerHTML = previousHtml;
      };
      if (latestReadOnlyPreviewRef.current) return putBack();
      const refuse = (reason: string) => {
        console.error("[Studio] text edit not saved:", reason, element);
        showToast(`Couldn't save the text edit: ${reason}`, "error");
        putBack();
      };
      // The edited node, not the current selection: a press can open an edit on a child of what
      // is selected, and a host can clear the selection before the edit closes.
      const doc = previewIframeRef.current?.contentDocument;
      if (!doc || !element.isConnected || element.ownerDocument !== doc) {
        return refuse("the text's element is gone from the preview");
      }
      const selection = await buildDomSelectionFromTarget(element, {
        exactTarget: true,
        skipSourceProbe: true,
      });
      if (selection?.element !== element) {
        return refuse("this text was not found in the composition's source");
      }
      // The same gate that let the edit open, not the design panel's field rule: an element
      // whose text holds a line break has no fields, and editing in place rewrites its markup.
      if (!canCommitInlineTextSelection(selection, element)) {
        return refuse("this text can't be edited in place");
      }
      const isLatestTextCommit = bumpDomEditCommitMapVersion(
        domTextCommitVersionRef.current,
        getDomEditTargetKey(selection),
      );
      const operations = [buildDomEditRichTextPatchOperation(html)];
      let appliedHtml = "";

      await runDomEditCommit({
        capture: () => {},
        apply: () => {
          // Idempotent: the caret put this there. Assigned anyway so a commit
          // raised from anywhere but the element itself still lands.
          element.innerHTML = html;
          appliedHtml = element.innerHTML;
        },
        persist: async () => {
          const result = await persistDomEditOperations(selection, operations, {
            label: "Edit text",
            skipRefresh: true,
            shouldSave: isLatestTextCommit,
          });
          if (result?.changed) trackPreviewFeatureUsed("text_edit", "field");
        },
        shouldRevert: () => isLatestTextCommit(),
        revert: () => {
          // An external actor that changed the live node while the request was
          // in flight owns its new value; only roll back the value we submitted.
          if (element.isConnected && element.innerHTML === appliedHtml) {
            element.innerHTML = previousHtml;
          }
        },
        onError: (error) => reportDomEditPersistFailure(selection, operations, error, showToast),
        // Re-select only what is still selected: the selection may have moved on, or a host cleared it.
        shouldResync: () => isLatestTextCommit() && latestSelectionRef.current?.element === element,
        resync: () =>
          resyncDomTextSelectionFromPreview(
            doc,
            selection,
            activeCompPath,
            buildDomSelectionFromTarget,
            applyDomSelection,
          ),
        onFinally: isLatestTextCommit.release,
      });
    },
    [
      activeCompPath,
      applyDomSelection,
      buildDomSelectionFromTarget,
      persistDomEditOperations,
      previewIframeRef,
      showToast,
    ],
  );

  const commitDomTextFields = useCallback(
    async (
      selection: DomEditSelection,
      nextTextFields: DomEditTextField[],
      options?: { importedFont?: ImportedFontAsset | null },
    ) => {
      const isLatestTextCommit = bumpDomEditCommitMapVersion(
        domTextCommitVersionRef.current,
        getDomEditTargetKey(selection),
      );
      const textCommit = planDomTextCommit(
        selection.textFields,
        nextTextFields,
        nextTextFields[0]?.value ?? "",
      );
      const iframe = previewIframeRef.current;
      const doc = iframe?.contentDocument;
      let editedElement: HTMLElement | null = null;
      let previousInnerHtml: string | null = null;
      const importedFont = options?.importedFont ?? null;

      await runDomEditCommit({
        capture: () => {
          if (!doc) return;
          const el = findElementForSelection(doc, selection, activeCompPath);
          if (!el) return;
          editedElement = el;
          previousInnerHtml = el.innerHTML;
        },
        apply: () => {
          if (!editedElement) return;
          if (textCommit.usesSerializedTextFields) {
            editedElement.innerHTML = textCommit.nextContent;
          } else {
            editedElement.textContent = textCommit.nextContent;
          }
        },
        persist: async () => {
          await persistDomEditOperations(selection, textCommit.operations, {
            label: "Edit text",
            skipRefresh: true,
            importedFont: importedFont ?? undefined,
          });
        },
        shouldRevert: () => isLatestTextCommit(),
        revert: () => {
          if (!editedElement || previousInnerHtml === null) return;
          editedElement.innerHTML = previousInnerHtml;
        },
        onError: (error) =>
          reportDomEditPersistFailure(selection, textCommit.operations, error, showToast),
        shouldResync: isLatestTextCommit,
        resync: () =>
          resyncDomTextSelectionFromPreview(
            doc,
            selection,
            activeCompPath,
            buildDomSelectionFromTarget,
            applyDomSelection,
          ),
        onFinally: isLatestTextCommit.release,
      });
    },
    [
      activeCompPath,
      applyDomSelection,
      buildDomSelectionFromTarget,
      persistDomEditOperations,
      previewIframeRef,
      showToast,
    ],
  );

  const handleDomTextFieldStyleCommit = useCallback(
    async (fieldKey: string, property: string, value: string) => {
      if (!domEditSelection) return;
      const field = domEditSelection.textFields.find((entry) => entry.key === fieldKey);
      if (!field) return;

      if (field.source === "self") {
        await handleDomStyleCommit(property, value);
        return;
      }

      const normalizedValue = normalizeDomEditStyleValue(property, value);
      const importedFont = property === "font-family" ? resolveImportedFontAsset(value) : null;
      if (property === "font-family") {
        const doc = previewIframeRef.current?.contentDocument;
        if (doc) {
          injectPreviewGoogleFont(doc, normalizedValue);
          if (importedFont) injectPreviewImportedFont(doc, importedFont);
        }
      }
      const nextTextFields = domEditSelection.textFields.map((entry) =>
        entry.key === fieldKey
          ? {
              ...entry,
              inlineStyles: {
                ...entry.inlineStyles,
                [property]: normalizedValue,
              },
              computedStyles: {
                ...entry.computedStyles,
                [property]: normalizedValue,
              },
            }
          : entry,
      );

      await commitDomTextFields(domEditSelection, nextTextFields, { importedFont });
    },
    [
      commitDomTextFields,
      domEditSelection,
      handleDomStyleCommit,
      resolveImportedFontAsset,
      previewIframeRef,
    ],
  );

  const handleDomAddTextField = useCallback(
    async (afterFieldKey?: string) => {
      if (!domEditSelection) return null;
      if (!domEditSelection.textFields.some((field) => field.source === "child")) return null;

      const insertionIndex = domEditSelection.textFields.findIndex(
        (field) => field.key === afterFieldKey,
      );
      const baseField =
        domEditSelection.textFields[insertionIndex >= 0 ? insertionIndex : 0] ??
        domEditSelection.textFields[0];
      const nextField = buildDefaultDomEditTextField(baseField);
      const nextTextFields = [...domEditSelection.textFields];
      nextTextFields.splice(
        insertionIndex >= 0 ? insertionIndex + 1 : nextTextFields.length,
        0,
        nextField,
      );

      await commitDomTextFields(domEditSelection, nextTextFields);
      return nextField.key;
    },
    [commitDomTextFields, domEditSelection],
  );

  const handleDomRemoveTextField = useCallback(
    async (fieldKey: string) => {
      if (!domEditSelection) return;
      const field = domEditSelection.textFields.find((entry) => entry.key === fieldKey);
      if (!field) return;

      if (field.source === "self") {
        await handleDomTextCommit("", fieldKey);
        return;
      }

      const nextTextFields = domEditSelection.textFields.filter((entry) => entry.key !== fieldKey);
      await commitDomTextFields(domEditSelection, nextTextFields);
    },
    [commitDomTextFields, domEditSelection, handleDomTextCommit],
  );

  return {
    handleDomStyleCommit,
    handleDomStyleCommitForSelection,
    handleDomAttributeCommit,
    handleDomAttributeLiveCommit,
    handleDomAttributeQuietCommit,
    handleDomHtmlAttributeCommit,
    handleDomAttributesCommit,
    handleDomAttributeBatchCommit,
    handleDomTextCommit,
    handleDomTextCommitForSelection,
    handleDomRichTextCommit,
    commitDomTextFields,
    handleDomTextFieldStyleCommit,
    handleDomAddTextField,
    handleDomRemoveTextField,
  };
}
