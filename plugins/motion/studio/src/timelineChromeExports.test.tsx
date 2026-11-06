// @vitest-environment happy-dom
// Mounts the timeline chrome by package name with no StudioShellProvider, as a host app does.
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AudioMeterStrip,
  dispatchLinkShortcut,
  TimelineHistoryButtons,
  TimelineToolbar,
  useAudioMetersVisible as exportedAudioMetersVisible,
  useClipboard,
  usePlayerStore,
  type UseClipboardOptions,
} from "@hyperframes/studio";
import { installReactActEnvironment, mountReactHarness } from "./hooks/domSelectionTestHarness";
import { useAudioMetersVisible } from "./utils/audioMeterVisibility";
import { dispatchLinkShortcut as localDispatchLinkShortcut } from "./hooks/linkShortcuts";

installReactActEnvironment();

afterEach(() => {
  document.body.innerHTML = "";
  usePlayerStore.setState({ elements: [], selectedElementId: null });
  useAudioMetersVisible.setState(useAudioMetersVisible.getInitialState());
});

describe("timeline chrome package exports, outside Studio's shell", () => {
  it("mounts the toolbar with the host's history and no Add beat", async () => {
    const onUndo = vi.fn();
    const root = mountReactHarness(
      <TimelineToolbar history={{ canUndo: true, onUndo }} showAddBeat={false} />,
    );
    const undo = document.querySelector<HTMLButtonElement>('button[aria-label="Undo"]');
    act(() => undo?.click());
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(document.querySelector('button[aria-label="Add beat at playhead"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it("mounts the history buttons disabled when given nothing", async () => {
    const root = mountReactHarness(<TimelineHistoryButtons />);
    const buttons = Array.from(document.querySelectorAll("button"));
    expect(buttons.map((b) => b.disabled)).toEqual([true, true]);
    await act(async () => root.unmount());
  });

  it("mounts the meter strip on the host's preview iframe", async () => {
    usePlayerStore.setState({
      elements: [{ id: "music", tag: "audio", start: 0, duration: 4, track: 0 }],
    });
    useAudioMetersVisible.setState({ visible: true });
    const root = mountReactHarness(<AudioMeterStrip previewIframeRef={{ current: null }} />);
    expect(document.querySelector('[data-testid="audio-meter-strip"]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it("exports the clip menu's link shortcuts for a host's own key handler", () => {
    expect(dispatchLinkShortcut).toBe(localDispatchLinkShortcut);
  });

  it("exports the meter visibility store a host toggles", () => {
    expect(exportedAudioMetersVisible).toBe(useAudioMetersVisible);
    exportedAudioMetersVisible.getState().setVisible(true);
    expect(useAudioMetersVisible.getState().visible).toBe(true);
  });

  it("runs the clipboard with no DOM edit session", async () => {
    const toasts: string[] = [];
    const options: UseClipboardOptions = {
      projectId: "p",
      activeCompPath: "index.html",
      domEditSelectionRef: { current: null },
      showToast: (message) => toasts.push(message),
      writeProjectFile: async () => {},
      recordEdit: async () => {},
      reloadPreview: () => {},
      handleTimelineElementsDelete: async () => {},
      handleDomEditElementDelete: async () => {},
      previewIframeRef: { current: null },
      waitForPendingDomEditSaves: async () => {},
    };
    const api: { current: ReturnType<typeof useClipboard> | null } = { current: null };
    function Harness() {
      api.current = useClipboard(options);
      return null;
    }
    const root = mountReactHarness(<Harness />);
    expect(api.current?.handleCopy()).toBe(false);
    expect(toasts).toEqual(["Nothing selected to copy."]);
    await act(async () => root.unmount());
  });
});
