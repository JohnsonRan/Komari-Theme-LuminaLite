import { describe, expect, it } from "vitest";
import type { NodeInfo, NodeMetrics } from "@/types/komari";
import type { HomeNodeSummary } from "@/services/wsStore";
import {
  ALL_NODE_FIELD_IDS,
  DEFAULT_LIST_COLUMNS,
  extractNodeFieldFilterValue,
  extractNodeFieldSortValue,
  LIST_COLUMN_PRESETS,
  NODE_FIELD_DEFINITIONS,
  normalizeListColumns,
} from "@/utils/nodeFields";
import {
  collectFieldEnumOptions,
  evaluateFilterRule,
  filterHomeNodes,
  formatFilterRuleLabel,
  type NodeFilterState,
} from "@/utils/nodeFilter";
import { sortHomeNodes, type HomeSortContext } from "@/utils/homeSort";

function makeSummary(partial: Partial<HomeNodeSummary> & Pick<HomeNodeSummary, "uuid">): HomeNodeSummary {
  return {
    group: "亚太主力",
    hidden: false,
    region: "HK",
    online: true,
    trafficDown: 2 * 1024 ** 3,
    trafficUp: 1 * 1024 ** 3,
    netDown: 1024 * 1024,
    netUp: 512 * 1024,
    connectionsTcp: 120,
    connectionsUdp: 30,
    cpuCores: 4,
    cpuPct: 35,
    ramUsed: 4 * 1024 ** 3,
    ramTotal: 8 * 1024 ** 3,
    ramPct: 50,
    diskUsed: 20 * 1024 ** 3,
    diskTotal: 80 * 1024 ** 3,
    diskPct: 25,
    load1: 0.85,
    pingLoss: 1.5,
    weight: 10,
    ...partial,
  };
}

function makeMeta(partial: Partial<NodeInfo> & Pick<NodeInfo, "uuid">): NodeInfo {
  return {
    name: "HK-BGP-01",
    cpu_name: "AMD EPYC 7763",
    virtualization: "KVM",
    arch: "x86_64",
    cpu_cores: 4,
    os: "Debian 12",
    kernel_version: "6.1.0-18-amd64",
    gpu_name: "NVIDIA RTX 4090",
    region: "HK",
    mem_total: 8 * 1024 ** 3,
    swap_total: 2 * 1024 ** 3,
    disk_total: 80 * 1024 ** 3,
    weight: 10,
    price: 99,
    billing_cycle: "30",
    auto_renewal: true,
    currency: "¥",
    expired_at: "2026-11-10T00:00:00Z",
    tags: "CN2;BGP;原生IP",
    public_remark: "香港三网直连测试机",
    traffic_limit: 1000 * 1024 ** 3,
    traffic_limit_type: "max",
    ipv4: "103.135.248.58",
    ipv6: "2400:3200::1",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2026-10-30T00:00:00Z",
    group: "亚太主力",
    hidden: false,
    ...partial,
  };
}

function makeMetrics(partial: Partial<NodeMetrics> = {}): NodeMetrics {
  return {
    online: true,
    cpuPct: 35,
    ramUsed: 4 * 1024 ** 3,
    ramTotal: 8 * 1024 ** 3,
    ramPct: 50,
    swapUsed: 512 * 1024 ** 2,
    swapTotal: 2 * 1024 ** 3,
    diskUsed: 20 * 1024 ** 3,
    diskTotal: 80 * 1024 ** 3,
    diskPct: 25,
    netUp: 512 * 1024,
    netDown: 1024 * 1024,
    trafficUp: 1 * 1024 ** 3,
    trafficDown: 2 * 1024 ** 3,
    uptime: 86400 * 15,
    load1: 0.85,
    load5: 0.65,
    load15: 0.45,
    process: 142,
    connectionsTcp: 120,
    connectionsUdp: 30,
    updatedAt: Date.now(),
    pingStats: {
      "1": { latest: 32, loss: 0, avg: 35, min: 28, peak: 50 },
      "2": { latest: 48, loss: 2.5, avg: 45, min: 40, peak: 80 },
    },
    gpuPct: 68,
    gpuMemUsed: 12 * 1024 ** 3,
    gpuMemTotal: 24 * 1024 ** 3,
    gpuTemp: 64,
    ...partial,
  };
}

describe("nodeFields definitions & column normalization", () => {
  it("defines all 65 unique collected fields and covers default 10 columns", () => {
    expect(ALL_NODE_FIELD_IDS.length).toBe(65);
    expect(new Set(ALL_NODE_FIELD_IDS).size).toBe(65);
    expect(DEFAULT_LIST_COLUMNS).toEqual([
      "node",
      "os",
      "cpu",
      "memory",
      "disk",
      "load",
      "live_speed",
      "traffic",
      "network",
      "life",
    ]);
    for (const preset of LIST_COLUMN_PRESETS) {
      expect(preset.columns.length).toBeGreaterThan(0);
    }
  });

  it("normalizes custom column strings and arrays with fallback to default", () => {
    expect(normalizeListColumns("node, cpu, ipv4, cpu, invalid_field")).toEqual([
      "node",
      "cpu",
      "ipv4",
    ]);
    expect(normalizeListColumns(["name", "gpu_name", "price"])).toEqual([
      "name",
      "gpu_name",
      "price",
    ]);
    expect(normalizeListColumns("invalid_only")).toEqual([...DEFAULT_LIST_COLUMNS]);
    expect(normalizeListColumns("")).toEqual([...DEFAULT_LIST_COLUMNS]);
  });

  it("extracts sort and filter values for every single defined field without throwing", () => {
    const summary = makeSummary({ uuid: "u-1" });
    const meta = makeMeta({ uuid: "u-1" });
    const metrics = makeMetrics();
    const now = Date.parse("2026-10-31T00:00:00Z");

    for (const def of NODE_FIELD_DEFINITIONS) {
      const sortVal = extractNodeFieldSortValue(def.id, {
        summary,
        meta,
        metrics,
        displayName: meta.name,
        now,
      });
      const filterVal = extractNodeFieldFilterValue(def.id, {
        summary,
        meta,
        metrics,
        displayName: meta.name,
        now,
      });
      expect(sortVal).not.toBeUndefined();
      expect(filterVal).not.toBeUndefined();
    }
  });
});

describe("nodeFilter multi-field filtering & search", () => {
  const s1 = makeSummary({
    uuid: "hk-1",
    region: "HK",
    group: "亚太主力",
    online: true,
    cpuPct: 85,
    ramPct: 40,
  });
  const s2 = makeSummary({
    uuid: "us-1",
    region: "US",
    group: "欧美大盘",
    online: true,
    cpuPct: 12,
    ramPct: 88,
  });
  const s3 = makeSummary({
    uuid: "jp-off",
    region: "JP",
    group: "亚太主力",
    online: false,
    cpuPct: 0,
    ramPct: 0,
  });

  const metaByUuid = new Map<string, NodeInfo>([
    [
      "hk-1",
      makeMeta({
        uuid: "hk-1",
        name: "HK-CN2-Pro",
        os: "Debian 12",
        cpu_name: "AMD EPYC 7763",
        gpu_name: "NVIDIA RTX 4090",
        ipv4: "103.135.248.58",
        ipv6: "2400:3200::1",
        price: 120,
      }),
    ],
    [
      "us-1",
      makeMeta({
        uuid: "us-1",
        name: "US-LAX-Storage",
        group: "欧美大盘",
        os: "Ubuntu 24.04",
        cpu_name: "Intel Xeon Gold 6248",
        gpu_name: "",
        ipv4: "45.67.89.10",
        ipv6: "",
        price: 35,
      }),
    ],
    [
      "jp-off",
      makeMeta({
        uuid: "jp-off",
        name: "JP-TYO-Lite",
        os: "Alpine Linux 3.19",
        cpu_name: "Apple M4 Pro",
        gpu_name: "",
        ipv4: "194.104.146.92",
        ipv6: "",
        price: 50,
      }),
    ],
  ]);

  const metricsByUuid = new Map<string, NodeMetrics>([
    ["hk-1", makeMetrics({ cpuPct: 85, ramPct: 40 })],
    ["us-1", makeMetrics({ cpuPct: 12, ramPct: 88, gpuPct: 0, gpuMemTotal: 0 })],
  ]);

  const nameByUuid = new Map<string, string>([
    ["hk-1", "HK-CN2-Pro"],
    ["us-1", "US-LAX-Storage"],
    ["jp-off", "JP-TYO-Lite"],
  ]);

  it("filters by full-field keyword tokens and online status", () => {
    const byIp = filterHomeNodes(
      [s1, s2, s3],
      { keyword: "103.135.248.58", status: "all", rules: [] },
      { metaByUuid, metricsByUuid, nameByUuid },
    );
    expect(byIp.map((n) => n.uuid)).toEqual(["hk-1"]);

    const byCpuModel = filterHomeNodes(
      [s1, s2, s3],
      { keyword: "epyc 4090", status: "online", rules: [] },
      { metaByUuid, metricsByUuid, nameByUuid },
    );
    expect(byCpuModel.map((n) => n.uuid)).toEqual(["hk-1"]);

    const offlineOnly = filterHomeNodes(
      [s1, s2, s3],
      { keyword: "", status: "offline", rules: [] },
      { metaByUuid, metricsByUuid, nameByUuid },
    );
    expect(offlineOnly.map((n) => n.uuid)).toEqual(["jp-off"]);
  });

  it("evaluates numeric, enum, text, and emptiness rules accurately", () => {
    const filterState: NodeFilterState = {
      keyword: "",
      status: "all",
      rules: [
        { id: "r1", field: "cpu", operator: "gte", value: "80" },
        { id: "r2", field: "gpu_name", operator: "not_empty" },
      ],
    };
    const matched = filterHomeNodes([s1, s2, s3], filterState, {
      metaByUuid,
      metricsByUuid,
      nameByUuid,
    });
    expect(matched.map((n) => n.uuid)).toEqual(["hk-1"]);

    const priceBetween: NodeFilterState = {
      keyword: "",
      status: "all",
      rules: [{ id: "r3", field: "price", operator: "between", value: "30", value2: "60" }],
    };
    expect(
      filterHomeNodes([s1, s2, s3], priceBetween, {
        metaByUuid,
        metricsByUuid,
        nameByUuid,
      }).map((n) => n.uuid),
    ).toEqual(["us-1", "jp-off"]);
  });

  it("does not treat missing samples as zero, Linux, or unknown sentinels", () => {
    const bare = makeSummary({
      uuid: "bare",
      region: "",
      online: null,
      cpuCores: 0,
      ramTotal: 0,
      diskTotal: 0,
    });
    const bareMeta = makeMeta({
      uuid: "bare",
      os: "",
      region: "",
      arch: "",
      virtualization: "",
      gpu_name: "",
      cpu_cores: 0,
      mem_total: 0,
      swap_total: 0,
      disk_total: 0,
      ipv4: "",
      ipv6: "",
      currency: "",
      billing_cycle: "",
      traffic_limit: 0,
    });
    const bareMetrics = makeMetrics({
      gpuPct: 0,
      gpuMemUsed: 0,
      gpuMemTotal: 0,
      gpuTemp: 0,
      gpu: undefined,
      swapUsed: 0,
      swapTotal: 0,
      load1: 0.2,
      load5: 1.4,
      load15: 0.3,
    });
    const ctx = { summary: bare, meta: bareMeta, metrics: bareMetrics };

    expect(extractNodeFieldFilterValue("os", ctx)).toBe("");
    expect(extractNodeFieldFilterValue("region", ctx)).toBe("UN");
    expect(extractNodeFieldFilterValue("arch", ctx)).toBe("");
    expect(extractNodeFieldFilterValue("ip_stack", ctx)).toBe("");
    expect(extractNodeFieldFilterValue("cpu_cores", ctx)).toBeNull();
    expect(extractNodeFieldFilterValue("mem_total", ctx)).toBeNull();
    expect(extractNodeFieldFilterValue("swap", ctx)).toBeNull();
    expect(extractNodeFieldFilterValue("gpu_pct", ctx)).toBeNull();
    expect(extractNodeFieldFilterValue("gpu_temp", ctx)).toBeNull();
    expect(extractNodeFieldFilterValue("traffic_limit", ctx)).toBeNull();
    expect(extractNodeFieldFilterValue("traffic_used_pct", ctx)).toBeNull();
    expect(extractNodeFieldFilterValue("load_all", ctx)).toBe(1.4);
    expect(extractNodeFieldFilterValue("online", ctx)).toBeNull();

    const hiddenByZero = filterHomeNodes(
      [bare],
      {
        keyword: "",
        status: "all",
        rules: [{ id: "gpu", field: "gpu_pct", operator: "lte", value: "10" }],
      },
      {
        metaByUuid: new Map([["bare", bareMeta]]),
        metricsByUuid: new Map([["bare", bareMetrics]]),
      },
    );
    expect(hiddenByZero).toEqual([]);

    expect(
      evaluateFilterRule(
        { id: "off", field: "online", operator: "is_false" },
        ctx,
      ),
    ).toBe(false);
    expect(
      evaluateFilterRule(
        { id: "on", field: "online", operator: "is_true" },
        ctx,
      ),
    ).toBe(false);
  });

  it("collects enum options with accurate counts and formats rule labels", () => {
    const groupOpts = collectFieldEnumOptions("group", [s1, s2, s3], {
      metaByUuid,
      metricsByUuid,
      nameByUuid,
    });
    expect(groupOpts).toEqual([
      { value: "亚太主力", count: 2 },
      { value: "欧美大盘", count: 1 },
    ]);

    expect(
      formatFilterRuleLabel({ id: "1", field: "cpu", operator: "gte", value: "80" }),
    ).toBe("CPU ≥ 80 %");
    expect(
      evaluateFilterRule(
        { id: "2", field: "tags", operator: "in", values: ["CN2"] },
        { summary: s1, meta: metaByUuid.get("hk-1"), metrics: metricsByUuid.get("hk-1") },
      ),
    ).toBe(true);
  });
});

describe("extended sortHomeNodes across all collected fields", () => {
  it("sorts by CPU usage, ping latency, price, and online status", () => {
    const n1 = makeSummary({ uuid: "n1", cpuPct: 20, weight: 1, online: true });
    const n2 = makeSummary({ uuid: "n2", cpuPct: 90, weight: 2, online: true });
    const n3 = makeSummary({ uuid: "n3", cpuPct: 99, weight: 3, online: false });

    const metaByUuid = new Map<string, NodeInfo>([
      ["n1", makeMeta({ uuid: "n1", price: 200 })],
      ["n2", makeMeta({ uuid: "n2", price: 50 })],
      ["n3", makeMeta({ uuid: "n3", price: 10 })],
    ]);

    const metricsByUuid = new Map<string, NodeMetrics>([
      [
        "n1",
        makeMetrics({
          cpuPct: 20,
          pingStats: { "1": { latest: 120, loss: 0, avg: 110, min: 90, peak: 140 } },
        }),
      ],
      [
        "n2",
        makeMetrics({
          cpuPct: 90,
          pingStats: { "1": { latest: 25, loss: 0, avg: 28, min: 20, peak: 40 } },
        }),
      ],
    ]);

    const sortCtx: HomeSortContext = {
      nameByUuid: new Map([
        ["n1", "Alpha"],
        ["n2", "Beta"],
        ["n3", "OfflineNode"],
      ]),
      speedAvgByUuid: new Map(),
      speedActive: new Set(),
      metaByUuid,
      metricsByUuid,
    };

    // CPU desc: online n2 (90%) -> online n1 (20%) -> offline n3 (sunk)
    expect(sortHomeNodes([n1, n2, n3], "cpu", "desc", sortCtx).map((n) => n.uuid)).toEqual([
      "n2",
      "n1",
      "n3",
    ]);

    // Ping latency asc: n2 (25ms) -> n1 (120ms) -> offline n3
    expect(
      sortHomeNodes([n1, n2, n3], "ping_latency", "asc", sortCtx).map((n) => n.uuid),
    ).toEqual(["n2", "n1", "n3"]);

    // Price asc: n2 (50) -> n1 (200) -> offline n3
    expect(sortHomeNodes([n1, n2, n3], "price", "asc", sortCtx).map((n) => n.uuid)).toEqual([
      "n2",
      "n1",
      "n3",
    ]);

    // Online status asc: offline n3 first!
    expect(sortHomeNodes([n1, n2, n3], "online", "asc", sortCtx).map((n) => n.uuid)).toEqual([
      "n3",
      "n1",
      "n2",
    ]);
  });
});
