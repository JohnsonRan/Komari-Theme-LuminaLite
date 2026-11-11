import { describe, expect, it } from "vitest";
import type { HomeNodeSummary } from "@/services/wsStore";
import type { NodeInfo } from "@/types/komari";
import {
  getHomeGroupOptions,
  matchesNodeSearch,
  normalizeHomeGroupOrder,
  sortHomeGroupOptions,
} from "@/utils/homeNodes";

function node(partial: Partial<HomeNodeSummary> & Pick<HomeNodeSummary, "uuid">): HomeNodeSummary {
  return {
    group: "",
    hidden: false,
    region: "",
    online: true,
    trafficDown: 0,
    trafficUp: 0,
    netDown: 0,
    netUp: 0,
    connectionsTcp: 0,
    connectionsUdp: 0,
    cpuCores: 0,
    cpuPct: 0,
    ramUsed: 0,
    ramTotal: 0,
    ramPct: 0,
    diskUsed: 0,
    diskTotal: 0,
    diskPct: 0,
    load1: 0,
    pingLoss: null,
    weight: 0,
    ...partial,
  };
}

describe("home node helpers", () => {
  it("builds group tabs from non-empty backend groups and keeps first-seen order", () => {
    expect(
      getHomeGroupOptions([
        node({ uuid: "a", group: "US 美国" }),
        node({ uuid: "b", group: "HK 香港" }),
        node({ uuid: "c", group: "US 美国" }),
        node({ uuid: "d", group: "" }),
      ]),
    ).toEqual(["US 美国", "HK 香港"]);
  });

});

describe("home group ordering", () => {
  it("normalizeHomeGroupOrder trims, drops empties, dedupes arrays and delimited text", () => {
    expect(normalizeHomeGroupOrder([" A ", "B", "A", "", null, "B"])).toEqual(["A", "B"]);
    expect(normalizeHomeGroupOrder("JP, US\nHK；JP")).toEqual(["JP", "US", "HK"]);
    expect(normalizeHomeGroupOrder(undefined)).toEqual([]);
    expect(normalizeHomeGroupOrder(42)).toEqual([]);
  });

  it("returns the original order when no custom order is set", () => {
    const groups = ["US", "HK", "JP"];
    expect(sortHomeGroupOptions(groups, [])).toBe(groups);
  });

  it("places configured groups first, then appends the rest in original order", () => {
    expect(sortHomeGroupOptions(["US", "HK", "JP", "SG"], ["JP", "US"])).toEqual([
      "JP",
      "US",
      "HK",
      "SG",
    ]);
  });

  it("ignores configured groups that no longer exist and never duplicates", () => {
    expect(sortHomeGroupOptions(["US", "HK"], ["GONE", "HK", "HK"])).toEqual(["HK", "US"]);
  });
});

describe("matchesNodeSearch", () => {
  const meta = {
    uuid: "u1",
    name: "Tokyo-01",
    group: "亚洲",
    region: "JP",
    tags: "CN2GIA;IPLC",
    public_remark: "",
    os: "Debian GNU/Linux 12",
    arch: "amd64",
    virtualization: "kvm",
    kernel_version: "6.1.0",
    cpu_name: "AMD EPYC 7763",
    gpu_name: "",
  } as NodeInfo;

  it("matches every whitespace-separated token case-insensitively across fields", () => {
    expect(matchesNodeSearch(meta, "")).toBe(true);
    expect(matchesNodeSearch(meta, "  tokyo  ")).toBe(true);
    expect(matchesNodeSearch(meta, "epyc debian")).toBe(true);
    expect(matchesNodeSearch(meta, "cn2gia 亚洲")).toBe(true);
    expect(matchesNodeSearch(meta, "epyc ubuntu")).toBe(false);
  });

  it("does not match nodes whose meta has not loaded", () => {
    expect(matchesNodeSearch(undefined, "tokyo")).toBe(false);
  });
});
