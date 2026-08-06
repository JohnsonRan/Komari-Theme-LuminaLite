import { describe, expect, it } from "vitest";
import { normalizeThemeSettings } from "@/utils/themeSettings";

describe("normalizeThemeSettings", () => {
  it("keeps mini and falls unknown saved view modes back to compact", () => {
    const settings = normalizeThemeSettings({
      desktopNodeViewMode: "retired-view",
      mobileNodeViewMode: "retired-view",
    } as never);

    expect(settings.desktopNodeViewMode).toBe("compact");
    expect(settings.mobileNodeViewMode).toBe("compact");
    expect(normalizeThemeSettings({ desktopNodeViewMode: "mini" }).desktopNodeViewMode).toBe(
      "mini",
    );
    expect(normalizeThemeSettings({ mobileNodeViewMode: "mini" }).mobileNodeViewMode).toBe("mini");
    expect(normalizeThemeSettings({ mobileNodeViewMode: "list" }).mobileNodeViewMode).toBe(
      "compact",
    );
  });

  it("defaults detail chart/network units and falls back on unknown values", () => {
    const base = normalizeThemeSettings({});
    expect(base.detailChartUnit).toBe("bytes");
    expect(base.detailNetworkUnit).toBe("mbs");

    expect(normalizeThemeSettings({ detailChartUnit: "percent" }).detailChartUnit).toBe("percent");
    expect(normalizeThemeSettings({ detailChartUnit: "nope" } as never).detailChartUnit).toBe(
      "bytes",
    );
    expect(normalizeThemeSettings({ detailNetworkUnit: "mbps" }).detailNetworkUnit).toBe("mbps");
    // 旧版 "auto" 与未知值归一化到 MB/s（字节族自适应）。
    expect(normalizeThemeSettings({ detailNetworkUnit: "auto" } as never).detailNetworkUnit).toBe(
      "mbs",
    );
    expect(normalizeThemeSettings({ detailNetworkUnit: "nope" } as never).detailNetworkUnit).toBe(
      "mbs",
    );
  });

  it("defaults home sort to disabled with weight ascending and falls back to a field's natural direction", () => {
    const base = normalizeThemeSettings({});
    // 默认关闭(与参考站点一致),需站长显式开启。
    expect(base.enableHomeSort).toBe(false);
    expect(normalizeThemeSettings({ enableHomeSort: true }).enableHomeSort).toBe(true);
    expect(base.homeSortField).toBe("default");
    expect(base.homeSortDirection).toBe("asc");

    // 指定字段但缺省方向 → 回落该字段自然方向(网速为降序)。
    expect(normalizeThemeSettings({ homeSortField: "speed" } as never).homeSortDirection).toBe("desc");
    // 非法字段回落 default。
    expect(normalizeThemeSettings({ homeSortField: "nope" } as never).homeSortField).toBe("default");
  });

  it("defaults connections display to on unless explicitly disabled", () => {
    // 默认开启(与参考站点一致);仅显式 false 才关闭。
    expect(normalizeThemeSettings({}).showConnections).toBe(true);
    expect(normalizeThemeSettings({ showConnections: false }).showConnections).toBe(false);
    expect(normalizeThemeSettings({ showConnections: true }).showConnections).toBe(true);
  });

  it("defaults both animation systems to on and keeps legacy/mixed values orthogonal", () => {
    const defaults = normalizeThemeSettings({});
    expect(defaults.enableIconAnimations).toBe(true);
    expect(defaults.enableDataAnimations).toBe(true);

    const interfaceOff = normalizeThemeSettings({ enableIconAnimations: false });
    expect(interfaceOff.enableIconAnimations).toBe(false);
    expect(interfaceOff.enableDataAnimations).toBe(true);

    const dataOff = normalizeThemeSettings({ enableDataAnimations: false });
    expect(dataOff.enableIconAnimations).toBe(true);
    expect(dataOff.enableDataAnimations).toBe(false);

    const bothOff = normalizeThemeSettings({
      enableIconAnimations: false,
      enableDataAnimations: false,
    });
    expect(bothOff.enableIconAnimations).toBe(false);
    expect(bothOff.enableDataAnimations).toBe(false);

    // 兼容旧存储：只有显式 boolean false 才关闭，缺失或旧字符串不会误伤另一开关。
    const legacy = normalizeThemeSettings({
      enableIconAnimations: "false",
      enableDataAnimations: 0,
    } as never);
    expect(legacy.enableIconAnimations).toBe(true);
    expect(legacy.enableDataAnimations).toBe(true);
  });

  it("parses hiddenNodes from a delimited string and dedupes", () => {
    expect(normalizeThemeSettings({}).hiddenNodes).toEqual([]);
    expect(
      normalizeThemeSettings({ hiddenNodes: "节点A, 节点A\nuuid-1；节点B" } as never).hiddenNodes,
    ).toEqual(["节点A", "uuid-1", "节点B"]);
  });

  it("keeps legacy attention thresholds until the official full save removes the old key", () => {
    const mergedBeforeSave = normalizeThemeSettings({
      attentionCpuPct: 90,
      attentionMemoryPct: 90,
      attentionDiskPct: 90,
      attentionLossPct: 5,
      attentionTrafficRemainPct: 10,
      attentionExpireDays: 7,
      attentionThresholds: {
        cpuPct: 75,
        memoryPct: 76,
        diskPct: 77,
        lossPct: 4,
        trafficRemainPct: 12,
        expireDays: 9,
      },
    });
    expect(mergedBeforeSave.attentionThresholds).toEqual({
      cpuPct: 75,
      memoryPct: 76,
      diskPct: 77,
      lossPct: 4,
      trafficRemainPct: 12,
      expireDays: 9,
    });

    const afterSave = normalizeThemeSettings({
      attentionCpuPct: 80,
      attentionMemoryPct: 70,
      attentionDiskPct: 60,
      attentionLossPct: 3,
      attentionTrafficRemainPct: 15,
      attentionExpireDays: 5,
    });
    expect(afterSave.attentionThresholds).toEqual({
      cpuPct: 80,
      memoryPct: 70,
      diskPct: 60,
      lossPct: 3,
      trafficRemainPct: 15,
      expireDays: 5,
    });
  });

  it("parses homeGroupOrder from richtext and keeps array compatibility", () => {
    expect(normalizeThemeSettings({ homeGroupOrder: "B, A\nB" } as never).homeGroupOrder).toEqual([
      "B",
      "A",
    ]);
    expect(normalizeThemeSettings({ homeGroupOrder: ["Z", "Y"] }).homeGroupOrder).toEqual([
      "Z",
      "Y",
    ]);
  });
});
