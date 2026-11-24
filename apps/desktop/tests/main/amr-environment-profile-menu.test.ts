import { describe, expect, it, vi } from "vitest";

import {
  createAmrEnvironmentProfileMenuItems,
  mergeAmrEnvironmentProfileConfig,
  normalizeAmrEnvironmentProfile,
  resolveAboutPanelVersion,
  resolveFirstAvailableBaseUrl,
  writeAmrEnvironmentProfile,
} from "../../src/main/index.js";

describe("AMR Environment Profile desktop menu helpers", () => {
  it("falls through a busy discovery source to the direct daemon URL", async () => {
    await expect(resolveFirstAvailableBaseUrl([
      async () => null,
      async () => "http://127.0.0.1:17456",
      async () => "http://127.0.0.1:17573",
    ])).resolves.toBe("http://127.0.0.1:17456");
  });

  it("continues after a discovery source throws", async () => {
    await expect(resolveFirstAvailableBaseUrl([
      async () => { throw new Error("sidecar busy"); },
      async () => "http://127.0.0.1:17456",
    ])).resolves.toBe("http://127.0.0.1:17456");
  });

  it("normalizes missing or invalid profile values to prod", () => {
    expect(normalizeAmrEnvironmentProfile(undefined)).toBe("prod");
    expect(normalizeAmrEnvironmentProfile("")).toBe("prod");
    expect(normalizeAmrEnvironmentProfile("staging")).toBe("prod");
    expect(normalizeAmrEnvironmentProfile("local")).toBe("local");
    expect(normalizeAmrEnvironmentProfile("feature-test")).toBe("feature-test");
    expect(normalizeAmrEnvironmentProfile("test")).toBe("test");
    expect(normalizeAmrEnvironmentProfile("prod")).toBe("prod");
  });

  it("merges the selected profile without deleting other app config env", () => {
    const result = mergeAmrEnvironmentProfileConfig(
      {
        agentId: "claude",
        agentModels: {
          amr: {
            model: "deepseek-v4-flash",
            reasoning: "default",
          },
          claude: {
            model: "sonnet",
          },
        },
        agentCliEnv: {
          amr: {
            VELA_BIN: "/opt/open-design/vela",
            VELA_LINK_URL: "https://amr.example.test/link",
            OPEN_DESIGN_AMR_PROFILE: "prod",
          },
          claude: {
            ANTHROPIC_BASE_URL: "https://claude.example.test",
          },
        },
        customInstructions: "Keep failures visible.",
      },
      "local",
    );

    expect(result).toEqual({
      agentId: "claude",
      agentModels: {
        claude: {
          model: "sonnet",
        },
      },
      agentCliEnv: {
        amr: {
          VELA_BIN: "/opt/open-design/vela",
          VELA_LINK_URL: "https://amr.example.test/link",
          OPEN_DESIGN_AMR_PROFILE: "local",
        },
        claude: {
          ANTHROPIC_BASE_URL: "https://claude.example.test",
        },
      },
      customInstructions: "Keep failures visible.",
    });
  });

  it("creates the AMR env section when the existing config has no agentCliEnv", () => {
    expect(mergeAmrEnvironmentProfileConfig({}, "feature-test")).toEqual({
      agentCliEnv: {
        amr: {
          OPEN_DESIGN_AMR_PROFILE: "feature-test",
        },
      },
    });
  });

  it("serializes an explicit empty agentModels map when AMR was the only persisted model choice", () => {
    const result = mergeAmrEnvironmentProfileConfig(
      {
        agentModels: {
          amr: {
            model: "deepseek-v4-flash",
          },
        },
      },
      "test",
    );

    expect(result).toEqual({
      agentCliEnv: {
        amr: {
          OPEN_DESIGN_AMR_PROFILE: "test",
        },
      },
      agentModels: {},
    });

    expect(JSON.parse(JSON.stringify(result))).toEqual({
      agentCliEnv: {
        amr: {
          OPEN_DESIGN_AMR_PROFILE: "test",
        },
      },
      agentModels: {},
    });
  });

  it("preserves the saved AMR model when re-selecting the normalized current profile", () => {
    const result = mergeAmrEnvironmentProfileConfig(
      {
        agentModels: {
          amr: {
            model: "deepseek-v4-flash",
          },
          claude: {
            model: "sonnet",
          },
        },
        agentCliEnv: {
          amr: {
            OPEN_DESIGN_AMR_PROFILE: " prod ",
          },
        },
      },
      "prod",
    );

    expect(result).toEqual({
      agentModels: {
        amr: {
          model: "deepseek-v4-flash",
        },
        claude: {
          model: "sonnet",
        },
      },
      agentCliEnv: {
        amr: {
          OPEN_DESIGN_AMR_PROFILE: "prod",
        },
      },
    });
  });

  it("builds radio menu items for prod, test, feature-test, and local", () => {
    const selected: string[] = [];
    const [profileMenu] = createAmrEnvironmentProfileMenuItems("test", (profile) => {
      selected.push(profile);
    });

    expect(profileMenu.label).toBe("AMR Profile");
    expect(profileMenu.submenu).toEqual([
      expect.objectContaining({ label: "prod", type: "radio", checked: false }),
      expect.objectContaining({ label: "test", type: "radio", checked: true }),
      expect.objectContaining({ label: "feature-test", type: "radio", checked: false }),
      expect.objectContaining({ label: "local", type: "radio", checked: false }),
    ]);

    const localItem = Array.isArray(profileMenu.submenu)
      ? profileMenu.submenu.find((item) => item.label === "local")
      : null;
    localItem?.click?.(undefined as never, undefined as never, undefined as never);
    expect(selected).toEqual(["local"]);
  });

  it("shows the fixed endpoint without offering misleading profile switches", () => {
    const onSelect = vi.fn();
    const binding = {
      profile: "test" as const,
      apiUrl: "https://amr-feature-api.powerformer.net",
      linkUrl: "https://amr-feature-link.powerformer.net",
      webUrl: "https://amr-feature.powerformer.net",
      credentialScope: "referral-feature-test",
    };
    const [menu] = createAmrEnvironmentProfileMenuItems("test", onSelect, binding);
    expect(menu.submenu).toEqual([{ label: binding.webUrl, enabled: false }]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("blocks fixed-binding switches before discovery or any app-config request", async () => {
    const discoverDaemonUrl = vi.fn();
    const discoverWebUrl = vi.fn();
    const amrEndpointBinding = {
      profile: "test" as const,
      apiUrl: "https://amr-feature-api.powerformer.net",
      linkUrl: "https://amr-feature-link.powerformer.net",
      webUrl: "https://amr-feature.powerformer.net",
      credentialScope: "referral-feature-test",
    };
    for (const profile of ["prod", "test", "feature-test", "local"] as const) {
      await expect(writeAmrEnvironmentProfile({ discoverDaemonUrl, discoverWebUrl, amrEndpointBinding }, profile)).resolves.toBe("test");
    }
    expect(discoverDaemonUrl).not.toHaveBeenCalled();
    expect(discoverWebUrl).not.toHaveBeenCalled();
  });

  it("does not write the new environment when the renderer cannot leave the project", async () => {
    const current = { agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: "prod" } } };
    const updated = { agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: "test" } } };
    const fetchConfig = vi.fn<typeof fetch>()
      .mockImplementation(async (_url, init) => Response.json({
        config: init?.method === "PUT" ? updated : current,
      }));
    vi.stubGlobal("fetch", fetchConfig);
    try {
      const options = { discoverDaemonUrl: async () => "http://127.0.0.1:17456", discoverWebUrl: async () => null };
      const prepareSwitch = vi.fn<() => Promise<boolean>>()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      await expect(writeAmrEnvironmentProfile(options, "test", prepareSwitch)).resolves.toBe("prod");
      expect(fetchConfig).toHaveBeenCalledTimes(1);

      await expect(writeAmrEnvironmentProfile(options, "test", prepareSwitch)).resolves.toBe("test");
      expect(fetchConfig).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ method: "PUT" }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses the active packaged runtime version for the native About panel", () => {
    expect(resolveAboutPanelVersion({ update: { currentVersion: "0.10.0-beta.24" } })).toBe("0.10.0-beta.24");
    expect(resolveAboutPanelVersion({ update: { currentVersion: " 0.10.0-beta.24 " } })).toBe("0.10.0-beta.24");
    expect(resolveAboutPanelVersion({ update: { currentVersion: "" } })).toBeNull();
    expect(resolveAboutPanelVersion({})).toBeNull();
  });
});
