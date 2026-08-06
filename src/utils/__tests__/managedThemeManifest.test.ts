import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME_SETTINGS } from "@/utils/themeSettings";
import { DEFAULT_DARK_DEPTH, METRIC_COLOR_META } from "@/hooks/useMetricColors";
import { DEFAULT_ATTENTION_THRESHOLDS } from "@/utils/nodeAttention";

type ManagedField = {
  type: string;
  key?: string;
  name?: string | Record<string, string>;
  default?: unknown;
  options?: string;
  help?: string | Record<string, string>;
};

type ThemeManifest = {
  configuration?: {
    type?: string;
    data?: ManagedField[];
  };
};

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), "komari-theme.json"), "utf8"),
) as ThemeManifest;

const REQUIRED_COMPLEX_KEYS = [
  "homeGroupOrder",
  "hiddenNodes",
  "attentionCpuPct",
  "attentionMemoryPct",
  "attentionDiskPct",
  "attentionLossPct",
  "attentionTrafficRemainPct",
  "attentionExpireDays",
  "darkDepth",
  ...METRIC_COLOR_META.map((entry) => entry.flatKey),
] as const;

describe("komari-theme.json managed configuration", () => {
  it("declares managed configuration with multiple title tabs", () => {
    expect(manifest.configuration?.type).toBe("managed");
    const data = manifest.configuration?.data ?? [];
    expect(data.length).toBeGreaterThan(0);

    const titles = data.filter((item) => item.type === "title");
    expect(titles.length).toBeGreaterThanOrEqual(5);
    // title 行不应带 key，避免污染 theme_settings。
    for (const title of titles) {
      expect(title.key).toBeUndefined();
    }
  });

  it("keeps non-title keys unique and covers complex migration fields", () => {
    const data = manifest.configuration?.data ?? [];
    const keys = data
      .filter((item) => item.type !== "title")
      .map((item) => item.key)
      .filter((key): key is string => typeof key === "string" && key.length > 0);

    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);

    for (const key of REQUIRED_COMPLEX_KEYS) {
      expect(keys).toContain(key);
    }
  });

  it("aligns scalar defaults with source DEFAULT_THEME_SETTINGS / metric defaults", () => {
    const data = manifest.configuration?.data ?? [];
    const byKey = new Map(
      data
        .filter((item) => item.type !== "title" && typeof item.key === "string")
        .map((item) => [item.key as string, item]),
    );

    const expectDefault = (key: string, value: unknown) => {
      expect(byKey.get(key)?.default, key).toEqual(value);
    };

    expectDefault("defaultAppearance", DEFAULT_THEME_SETTINGS.defaultAppearance);
    expectDefault("desktopNodeViewMode", DEFAULT_THEME_SETTINGS.desktopNodeViewMode);
    expectDefault("mobileNodeViewMode", DEFAULT_THEME_SETTINGS.mobileNodeViewMode);
    expectDefault("enableAdminButton", DEFAULT_THEME_SETTINGS.enableAdminButton);
    expectDefault("enableIconAnimations", DEFAULT_THEME_SETTINGS.enableIconAnimations);
    expectDefault("enableDataAnimations", DEFAULT_THEME_SETTINGS.enableDataAnimations);
    expectDefault("showPingChart", DEFAULT_THEME_SETTINGS.showPingChart);
    expectDefault("showHomeOverview", DEFAULT_THEME_SETTINGS.showHomeOverview);
    expectDefault("showGroupTabs", DEFAULT_THEME_SETTINGS.showGroupTabs);
    expectDefault("showRegionBar", DEFAULT_THEME_SETTINGS.showRegionBar);
    expectDefault("showCardGroup", DEFAULT_THEME_SETTINGS.showCardGroup);
    expectDefault("enableHomeSort", DEFAULT_THEME_SETTINGS.enableHomeSort);
    expectDefault("homeSortField", DEFAULT_THEME_SETTINGS.homeSortField);
    expectDefault("homeSortDirection", DEFAULT_THEME_SETTINGS.homeSortDirection);
    expectDefault("enableAttentionSort", DEFAULT_THEME_SETTINGS.enableAttentionSort);
    expectDefault("showNodeHistory", DEFAULT_THEME_SETTINGS.showNodeHistory);
    expectDefault("showVisitorInfo", DEFAULT_THEME_SETTINGS.showVisitorInfo);
    expectDefault("compactShowTrafficTotal", DEFAULT_THEME_SETTINGS.compactShowTrafficTotal);
    expectDefault("compactShowBilling", DEFAULT_THEME_SETTINGS.compactShowBilling);
    expectDefault("compactShowUptime", DEFAULT_THEME_SETTINGS.compactShowUptime);
    expectDefault("showConnections", DEFAULT_THEME_SETTINGS.showConnections);
    expectDefault("detailChartUnit", DEFAULT_THEME_SETTINGS.detailChartUnit);
    expectDefault("detailNetworkUnit", DEFAULT_THEME_SETTINGS.detailNetworkUnit);
    expectDefault("detailSplitLayout", DEFAULT_THEME_SETTINGS.detailSplitLayout);
    expectDefault("enableBackgroundImage", DEFAULT_THEME_SETTINGS.enableBackgroundImage);
    expectDefault("backgroundImage", DEFAULT_THEME_SETTINGS.backgroundImage);
    expectDefault("backgroundImageMobile", DEFAULT_THEME_SETTINGS.backgroundImageMobile);
    expectDefault("backgroundAlignment", DEFAULT_THEME_SETTINGS.backgroundAlignment);
    expectDefault("surfaceOpacity", DEFAULT_THEME_SETTINGS.surfaceOpacity);
    expectDefault("homeGroupOrder", "");
    expectDefault("hiddenNodes", "");
    expectDefault("attentionCpuPct", DEFAULT_ATTENTION_THRESHOLDS.cpuPct);
    expectDefault("attentionMemoryPct", DEFAULT_ATTENTION_THRESHOLDS.memoryPct);
    expectDefault("attentionDiskPct", DEFAULT_ATTENTION_THRESHOLDS.diskPct);
    expectDefault("attentionLossPct", DEFAULT_ATTENTION_THRESHOLDS.lossPct);
    expectDefault("attentionTrafficRemainPct", DEFAULT_ATTENTION_THRESHOLDS.trafficRemainPct);
    expectDefault("attentionExpireDays", DEFAULT_ATTENTION_THRESHOLDS.expireDays);
    expectDefault("darkDepth", DEFAULT_DARK_DEPTH);

    for (const { flatKey } of METRIC_COLOR_META) {
      expectDefault(flatKey, "");
    }
  });
});
