// @vitest-environment happy-dom

import React, { act, isValidElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { CompositionThumbnail, VideoThumbnail } from "../player";
import { AudioWaveform } from "../player/components/AudioWaveform";
import { AudibleVideoClipContent } from "../player/components/AudibleVideoClipContent";
import { TextClipContent } from "../player/components/TextClipContent";
import { ClipPeakMarks } from "../player/components/ClipPeakMarks";

function unwrapPeakMarks(node: ReactNode): ReactNode {
  return isValidElement<{ children?: ReactNode }>(node) && node.type === ClipPeakMarks
    ? node.props.children
    : node;
}
import type { TimelineClipRenderContext } from "../player/components/TimelineTypes";
import { usePlayerStore, type TimelineElement } from "../player/store/playerStore";
import { buildCompositionThumbnailUrl } from "../player/components/CompositionThumbnail";
import { compositionCardThumbnailUrl } from "../components/sidebar/CompositionsTab";
import { normalizeCompositionSrc } from "./useRenderClipContent";
import { useRenderClipContent } from "./useRenderClipContent";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  usePlayerStore.setState({ thumbnailMode: "hidden", elements: [] });
  document.body.innerHTML = "";
});

describe("normalizeCompositionSrc", () => {
  const origin = "http://localhost:5190";
  const pid = "my-project";

  it("strips absolute preview URL to relative path", () => {
    const result = normalizeCompositionSrc(
      "http://localhost:5190/api/projects/my-project/preview/compositions/intro.html",
      pid,
      origin,
    );
    expect(result).toBe("compositions/intro.html");
  });

  it("preserves already-relative paths", () => {
    const result = normalizeCompositionSrc("compositions/intro.html", pid, origin);
    expect(result).toBe("compositions/intro.html");
  });

  it("preserves absolute URLs from different origins", () => {
    const result = normalizeCompositionSrc(
      "https://cdn.example.com/compositions/intro.html",
      pid,
      origin,
    );
    expect(result).toBe("https://cdn.example.com/compositions/intro.html");
  });

  it("preserves absolute URLs for different projects", () => {
    const result = normalizeCompositionSrc(
      "http://localhost:5190/api/projects/other-project/preview/compositions/intro.html",
      pid,
      origin,
    );
    expect(result).toBe(
      "http://localhost:5190/api/projects/other-project/preview/compositions/intro.html",
    );
  });

  it("handles nested composition paths", () => {
    const result = normalizeCompositionSrc(
      "http://localhost:5190/api/projects/my-project/preview/compositions/scenes/hero.html",
      pid,
      origin,
    );
    expect(result).toBe("compositions/scenes/hero.html");
  });
});

describe("useRenderClipContent", () => {
  function renderClipContent(
    el: TimelineElement,
    activePreviewUrl: string | null = "/api/projects/my-project/preview",
    context?: TimelineClipRenderContext,
  ): ReactNode {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    let content: ReactNode = null;

    function Harness() {
      const render = useRenderClipContent({
        projectIdRef: { current: "my-project" },
        compIdToSrc: new Map(),
        activePreviewUrl,
        effectiveTimelineDuration: 12,
      });
      content = render(el, { clip: "#222", label: "#fff" }, context);
      return null;
    }

    act(() => {
      root.render(React.createElement(Harness));
    });
    act(() => root.unmount());
    return unwrapPeakMarks(content);
  }

  it("keeps one renderer while the timeline's elements change, so no clip redraws for it", () => {
    const projectIdRef = { current: "my-project" };
    const compIdToSrc = new Map<string, string>();
    const renderers: unknown[] = [];
    function Harness() {
      renderers.push(
        useRenderClipContent({
          projectIdRef,
          compIdToSrc,
          activePreviewUrl: null,
          effectiveTimelineDuration: 12,
        }),
      );
      return null;
    }
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(React.createElement(Harness)));
    act(() =>
      usePlayerStore.setState({
        elements: [{ id: "a", tag: "audio", start: 0, duration: 1, track: 1 }],
      }),
    );
    act(() => root.unmount());

    expect(new Set(renderers).size).toBe(1);
  });

  function renderRaw(el: TimelineElement): ReactNode {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    let content: ReactNode = null;
    function Harness() {
      const render = useRenderClipContent({
        projectIdRef: { current: "my-project" },
        compIdToSrc: new Map(),
        activePreviewUrl: null,
        effectiveTimelineDuration: 12,
      });
      content = render(el, { clip: "#222", label: "#fff" });
      return null;
    }
    act(() => root.render(React.createElement(Harness)));
    act(() => root.unmount());
    return content;
  }

  it("wraps a clip's waveform in peak marks at its own gain over its played source window", () => {
    const content = renderRaw({
      id: "voiceover",
      tag: "audio",
      start: 1,
      duration: 4,
      track: 1,
      src: "assets/voiceover.mp3",
      playbackStart: 2,
      playbackRate: 1.5,
      volume: 2,
    });
    expect(isValidElement(content) && content.type).toBe(ClipPeakMarks);
    if (isValidElement<Record<string, unknown>>(content)) {
      expect(content.props).toMatchObject({
        peaksUrl: "/api/projects/my-project/peaks/assets/voiceover.mp3",
        sourceWindow: { mediaStart: 2, sourceSpan: 6 },
        gain: 2,
      });
    }
  });

  it("renders audio clips as waveforms even when a composition preview URL is active", () => {
    const content = renderClipContent({
      id: "voiceover",
      tag: "audio",
      start: 1,
      duration: 4,
      track: 1,
      src: "assets/voiceover.mp3",
    });

    expect(isValidElement(content)).toBe(true);
    if (isValidElement(content)) expect(content.type).toBe(AudioWaveform);
  });

  it("routes root-relative iframe media back through the active project", () => {
    usePlayerStore.setState({ thumbnailMode: "adaptive" });
    const resolvedRootMedia = `${window.location.origin}/assets/clip.mp4`;
    const video = renderClipContent(
      {
        id: "video",
        tag: "video",
        start: 0,
        duration: 4,
        track: 0,
        src: resolvedRootMedia,
      },
      null,
    );
    const audio = renderClipContent({
      id: "audio",
      tag: "audio",
      start: 0,
      duration: 4,
      track: 1,
      src: resolvedRootMedia,
    });

    expect(isValidElement<{ videoSrc: string }>(video)).toBe(true);
    expect(isValidElement<{ audioUrl: string; waveformUrl: string }>(audio)).toBe(true);
    if (isValidElement<{ videoSrc: string }>(video)) {
      expect(video.props.videoSrc).toBe("/api/projects/my-project/preview/assets/clip.mp4");
    }
    if (isValidElement<{ audioUrl: string; waveformUrl: string }>(audio)) {
      expect(audio.props).toMatchObject({
        audioUrl: "/api/projects/my-project/preview/assets/clip.mp4",
        waveformUrl: "/api/projects/my-project/waveform/assets/clip.mp4",
      });
    }
  });

  it("marks hidden audio muted and leaves the link to the chain badge", () => {
    usePlayerStore.setState({
      thumbnailMode: "hidden",
      elements: [
        {
          id: "picture",
          tag: "video",
          start: 0,
          duration: 4,
          track: 0,
          src: "assets/clip.mp4",
        },
      ],
    });
    const linked = renderClipContent({
      id: "bed",
      tag: "audio",
      start: 0,
      duration: 4,
      track: 1,
      src: "assets/clip.mp4",
      link: "lk-1",
      hidden: true,
    });
    expect(isValidElement<{ linked?: boolean; muted: boolean }>(linked)).toBe(true);
    if (isValidElement<{ linked?: boolean; muted: boolean }>(linked)) {
      expect(linked.props.linked).toBeUndefined();
      expect(linked.props.muted).toBe(true);
    }
  });

  it("draws a waveform strip under the thumbnails of a video with sound", () => {
    usePlayerStore.setState({ thumbnailMode: "adaptive" });
    const content = renderClipContent(
      {
        id: "talk",
        tag: "video",
        start: 0,
        duration: 4,
        track: 0,
        src: "talk.mp4",
        hasAudio: true,
      },
      null,
    );
    expect(isValidElement<{ thumbnail: ReactNode; waveform: ReactNode }>(content)).toBe(true);
    if (!isValidElement<{ thumbnail: ReactNode; waveform: ReactNode }>(content)) return;
    expect(content.type).toBe(AudibleVideoClipContent);
    const { thumbnail } = content.props;
    const waveform = unwrapPeakMarks(content.props.waveform);
    expect(isValidElement(thumbnail) && thumbnail.type).toBe(VideoThumbnail);
    expect(isValidElement<{ waveformUrl: string }>(waveform) && waveform.props.waveformUrl).toBe(
      "/api/projects/my-project/waveform/talk.mp4",
    );
    expect(isValidElement<{ labelInset?: number }>(waveform) && waveform.props.labelInset).toBe(0);
  });

  it("keeps a muted or silent video to thumbnails only", () => {
    usePlayerStore.setState({ thumbnailMode: "adaptive" });
    for (const extra of [{ hasAudio: true, muted: true }, { hasAudio: false }]) {
      const content = renderClipContent(
        { id: "b", tag: "video", start: 0, duration: 4, track: 0, src: "b.mp4", ...extra },
        null,
      );
      expect(isValidElement(content) && content.type).toBe(VideoThumbnail);
    }
  });

  it("still shows the sound strip when thumbnails are off", () => {
    const content = renderClipContent(
      {
        id: "talk",
        tag: "video",
        start: 0,
        duration: 4,
        track: 0,
        src: "talk.mp4",
        hasAudio: true,
      },
      null,
    );
    expect(isValidElement(content) && content.type).toBe(AudibleVideoClipContent);
  });

  it("gives a layer spanning the whole film its own frame, whatever its id", () => {
    usePlayerStore.setState({ thumbnailMode: "adaptive" });
    for (const id of ["waves", "background-glyphs"]) {
      const content = renderClipContent({ id, tag: "div", start: 0, duration: 12, track: 0 }, null);
      expect(isValidElement(content) && content.type).toBe(CompositionThumbnail);
    }
  });

  it("draws a text layer's own words instead of capturing them", () => {
    usePlayerStore.setState({ thumbnailMode: "adaptive" });
    const content = renderClipContent(
      { id: "title", tag: "h1", start: 0, duration: 12, track: 0, text: { value: "Ship it" } },
      null,
    );
    expect(isValidElement(content) && content.type).toBe(TextClipContent);
  });

  it("passes empty labels to thumbnail content so TimelineClip owns clip names", () => {
    usePlayerStore.setState({ thumbnailMode: "adaptive" });

    const cases: Array<{ content: ReactNode; type: unknown }> = [
      {
        content: renderClipContent({
          id: "voiceover",
          tag: "audio",
          start: 1,
          duration: 4,
          track: 1,
          src: "assets/voiceover.mp3",
        }),
        type: AudioWaveform,
      },
      {
        content: renderClipContent({
          id: "nested",
          tag: "div",
          start: 0,
          duration: 4,
          track: 0,
          compositionSrc: "compositions/nested.html",
        }),
        type: CompositionThumbnail,
      },
      {
        content: renderClipContent(
          {
            id: "clip-video",
            tag: "video",
            start: 0,
            duration: 4,
            track: 0,
            src: "assets/clip.mp4",
          },
          null,
        ),
        type: VideoThumbnail,
      },
      {
        content: renderClipContent(
          {
            id: "headline",
            tag: "div",
            start: 1,
            duration: 4,
            track: 0,
          },
          null,
        ),
        type: CompositionThumbnail,
      },
    ];

    for (const item of cases) {
      expect(isValidElement<{ label: string }>(item.content)).toBe(true);
      if (isValidElement<{ label: string }>(item.content)) {
        expect(item.content.type).toBe(item.type);
        expect(item.content.props.label).toBe("");
      }
    }
  });

  it("forwards the viewport priority to video media work", () => {
    usePlayerStore.setState({ thumbnailMode: "adaptive", timelineSessionEpoch: 7 });

    const content = renderClipContent(
      {
        id: "clip-video",
        tag: "video",
        start: 0,
        duration: 4,
        track: 0,
        src: "assets/clip.mp4",
      },
      null,
      { priority: "interaction", rich: true },
    );

    expect(
      isValidElement<{
        projectId: string;
        sessionEpoch: number;
        priority: string;
      }>(content),
    ).toBe(true);
    if (isValidElement(content)) {
      expect(content.props).toMatchObject({
        projectId: "my-project",
        sessionEpoch: 7,
        priority: "interaction",
      });
      expect(content.props).not.toHaveProperty("rich");
    }
  });

  it("finds the revision of a composition mounted with a ./ path", () => {
    usePlayerStore.setState({
      thumbnailMode: "adaptive",
      thumbnailRevisions: { "compositions/nested.html": 2 },
    });

    const content = renderClipContent({
      id: "nested",
      tag: "div",
      start: 0,
      duration: 4,
      track: 0,
      compositionSrc: "./compositions/nested.html",
    });

    expect(isValidElement(content) && content.props).toMatchObject({ contentRevision: 2 });
  });

  it("forwards persisted content revision to mounted composition thumbnails", () => {
    usePlayerStore.setState({
      thumbnailMode: "adaptive",
      timelineSessionEpoch: 7,
      thumbnailRevisions: { "*": 11, "compositions/nested.html": 2, "compositions/other.html": 5 },
    });

    const content = renderClipContent({
      id: "nested",
      tag: "div",
      start: 0,
      duration: 4,
      track: 0,
      compositionSrc: "compositions/nested.html",
    });

    expect(isValidElement(content)).toBe(true);
    if (isValidElement(content)) {
      expect(content.type).toBe(CompositionThumbnail);
      expect(content.props).toMatchObject({
        projectId: "my-project",
        sessionEpoch: 7,
        // its own composition's revision plus the all-compositions one, not a sibling's
        contentRevision: 13,
      });
    }
  });

  it.each(["compositions/scene-0.html", "compositions/scene [v2].html", "compositions/100%.html"])(
    "asks for the same thumbnail as the card of %s, so one render serves both",
    (compositionSrc) => {
      usePlayerStore.setState({
        thumbnailMode: "adaptive",
        thumbnailRevisions: { [compositionSrc]: 3 },
      });

      const content = renderClipContent({
        id: "scene-0",
        tag: "div",
        start: 10,
        duration: 5,
        track: 0,
        compositionSrc,
      });

      expect(isValidElement(content)).toBe(true);
      if (!isValidElement(content)) return;
      const clipUrl = buildCompositionThumbnailUrl({
        ...(content.props as Parameters<typeof buildCompositionThumbnailUrl>[0]),
        origin: window.location.origin,
      });
      expect(clipUrl).toBe(compositionCardThumbnailUrl("my-project", compositionSrc, 3));
    },
  );
});
