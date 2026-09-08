import { describe, expect, it } from "vitest";

import {
  cardLaneSilence,
  renderFallbackNotice,
  resolvePackagePublication,
  versionMetadataUrl,
} from "../src/notifications/prerelease-fallback.ts";
import type { FallbackNoticeInput } from "../src/notifications/prerelease-fallback.ts";

const ORIGIN_RUN = "https://github.com/nexu-io/open-design/actions/runs/111";
const CARD_RUN = "https://github.com/nexu-io/open-design/actions/runs/222";
const METADATA = "https://releases.example/prerelease/versions/0.21.1-prerelease.3/metadata.json";

function notice(overrides: Partial<FallbackNoticeInput> = {}): FallbackNoticeInput {
  return {
    silence: "card-not-delivered",
    channelLabel: "Prerelease",
    version: "0.21.1-prerelease.3",
    branch: "release/v0.21.1",
    commit: "0123456789abcdef0123456789abcdef01234567",
    publication: "published",
    metadataUrl: METADATA,
    pipeline: "finished",
    originRunUrl: ORIGIN_RUN,
    cardRunUrl: CARD_RUN,
    laneSummary: "card job=success · delivered=false",
    ...overrides,
  };
}

describe("cardLaneSilence", () => {
  it("stays quiet when the watcher finished and the card reached the chat", () => {
    // The whole point of the fallback: on a healthy prerelease it must post
    // nothing, or the channel gets two messages per release and the alert
    // stops meaning anything.
    expect(cardLaneSilence({ stage: "watch", jobResult: "success", deliveredFinalCard: true })).toBeNull();
  });

  it("stays quiet when the card workflow was dispatched", () => {
    expect(cardLaneSilence({ stage: "dispatch", dispatched: true })).toBeNull();
  });

  it("alerts when the watcher job finished but no card was ever delivered", () => {
    // The headline silent path: the application bot's credentials expire or it
    // is removed from the chat, every send/patch throws, the watcher swallows
    // the delivery failure by design, and the job still exits 0. A fallback
    // keyed only on the job result would see green here.
    expect(cardLaneSilence({ stage: "watch", jobResult: "success", deliveredFinalCard: false })).toBe(
      "card-not-delivered",
    );
  });

  it("alerts when the watcher job did not complete successfully", () => {
    for (const jobResult of ["failure", "cancelled", "skipped", ""]) {
      expect(cardLaneSilence({ stage: "watch", jobResult, deliveredFinalCard: false })).toBe(
        "watcher-not-completed",
      );
      // A job that died carries no trustworthy delivery claim either way: the
      // card is at best frozen mid-release, so it is still an alert.
      expect(cardLaneSilence({ stage: "watch", jobResult, deliveredFinalCard: true })).toBe(
        "watcher-not-completed",
      );
    }
  });

  it("alerts when the card workflow was never dispatched", () => {
    expect(cardLaneSilence({ stage: "dispatch", dispatched: false })).toBe("never-dispatched");
  });
});

describe("versionMetadataUrl", () => {
  it("reproduces the key publish-metadata writes the version metadata to", () => {
    expect(versionMetadataUrl("https://releases.example", "prerelease", "0.21.1-prerelease.3")).toBe(METADATA);
  });

  it("tolerates a trailing slash on the public origin", () => {
    expect(versionMetadataUrl("https://releases.example/", "prerelease", "0.21.1-prerelease.3")).toBe(METADATA);
  });

  it("returns nothing when the origin or the version is unknown", () => {
    expect(versionMetadataUrl("", "prerelease", "0.21.1-prerelease.3")).toBe("");
    expect(versionMetadataUrl("https://releases.example", "prerelease", "")).toBe("");
  });
});

describe("resolvePackagePublication", () => {
  it("trusts a metadata URL the caller already holds", () => {
    // release-prerelease.yml's publish job hands over the real output; there is
    // nothing more authoritative to probe for.
    expect(resolvePackagePublication({ declaredMetadataUrl: METADATA, probe: "skipped" })).toBe("published");
  });

  it("reads the probe when the caller holds no URL", () => {
    expect(resolvePackagePublication({ declaredMetadataUrl: "", probe: "found" })).toBe("published");
    expect(resolvePackagePublication({ declaredMetadataUrl: "", probe: "missing" })).toBe("absent");
  });

  it("never claims a verdict it could not check", () => {
    expect(resolvePackagePublication({ declaredMetadataUrl: "", probe: "error" })).toBe("unknown");
    expect(resolvePackagePublication({ declaredMetadataUrl: "", probe: "skipped" })).toBe("unknown");
  });
});

describe("renderFallbackNotice", () => {
  it("names the version and both runs so the reader needs nothing else", () => {
    const rendered = renderFallbackNotice(notice());
    expect(rendered.title).toContain("0.21.1-prerelease.3");
    expect(rendered.body).toContain("0.21.1-prerelease.3");
    expect(rendered.body).toContain("release/v0.21.1");
    expect(rendered.body).toContain(ORIGIN_RUN);
    expect(rendered.body).toContain(CARD_RUN);
    expect(rendered.runUrl).toBe(ORIGIN_RUN);
  });

  it("reports a published package with its version metadata URL", () => {
    const rendered = renderFallbackNotice(notice({ publication: "published" }));
    expect(rendered.body).toContain("已发布");
    expect(rendered.body).toContain(METADATA);
    // The packages shipped; only the notification broke. That is not the same
    // incident as "nothing was released", and the colour has to say so.
    expect(rendered.template).toBe("orange");
  });

  it("separates a package that never shipped from one that has not shipped yet", () => {
    const finished = renderFallbackNotice(notice({ publication: "absent", pipeline: "finished", metadataUrl: "" }));
    expect(finished.body).toContain("未发布");
    expect(finished.body).toContain("已结束");
    expect(finished.template).toBe("red");

    const running = renderFallbackNotice(notice({ publication: "absent", pipeline: "running", metadataUrl: "" }));
    expect(running.body).toContain("尚未发布");
    expect(running.body).toContain("仍在进行");
  });

  it("does not claim the pipeline finished when it could not find out", () => {
    // Absent metadata plus an unknown pipeline state: the object is not there,
    // but nothing licenses "已结束" or "仍在进行".
    const rendered = renderFallbackNotice(notice({ publication: "absent", pipeline: "unknown" }));
    expect(rendered.body).toContain("未发布");
    expect(rendered.body).not.toContain("已结束");
    expect(rendered.body).not.toContain("仍在进行");
  });

  it("names where the version metadata will appear when nothing has shipped yet", () => {
    // The dispatch-side alert fires beside the build, so "not published" is the
    // expected reading. Handing over the object that would prove publication
    // turns "go look" into one clickable check.
    const rendered = renderFallbackNotice(notice({ publication: "absent", pipeline: "running" }));
    expect(rendered.body).toContain(METADATA);
    expect(rendered.body).not.toContain("已发布");
  });

  it("says so plainly when it could not establish whether a package shipped", () => {
    const rendered = renderFallbackNotice(notice({ publication: "unknown", metadataUrl: "" }));
    expect(rendered.body).toContain("未知");
    expect(rendered.template).toBe("red");
  });

  it("explains which way the card lane went silent", () => {
    expect(renderFallbackNotice(notice({ silence: "never-dispatched" })).body).toContain("从未");
    expect(renderFallbackNotice(notice({ silence: "watcher-not-completed" })).body).toContain("未正常结束");
    expect(renderFallbackNotice(notice({ silence: "card-not-delivered" })).body).toContain("凭证");
    // The raw per-job results travel with the notice, so the reader can tell a
    // dispatch that never fired from a watcher that died.
    expect(renderFallbackNotice(notice()).body).toContain("card job=success · delivered=false");
  });

  it("stays readable when the pipeline died before a version existed", () => {
    const rendered = renderFallbackNotice(
      notice({ version: "", branch: "", commit: "", metadataUrl: "", publication: "absent", pipeline: "finished" }),
    );
    expect(rendered.title).not.toContain("undefined");
    expect(rendered.body).not.toContain("undefined");
    expect(rendered.body).toContain("未确定");
    expect(rendered.runUrl).toBe(ORIGIN_RUN);
  });

  it("falls back to the card run link when the origin run is unknown", () => {
    expect(renderFallbackNotice(notice({ originRunUrl: "" })).runUrl).toBe(CARD_RUN);
  });
});
