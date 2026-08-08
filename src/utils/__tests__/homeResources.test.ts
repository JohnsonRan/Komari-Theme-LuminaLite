import { describe, expect, it } from "vitest";
import type { HomeNodeSummary } from "@/services/wsStore";
import { aggregateHomeResources } from "@/utils/homeResources";

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

describe("aggregateHomeResources", () => {
  it("aggregates current resource usage from online nodes only", () => {
    const result = aggregateHomeResources([
      node({
        uuid: "online-a",
        cpuCores: 8,
        cpuPct: 50,
        ramUsed: 4,
        ramTotal: 8,
        diskUsed: 30,
        diskTotal: 100,
        load1: 2.5,
      }),
      node({
        uuid: "online-b",
        cpuCores: 4,
        cpuPct: 25,
        ramUsed: 6,
        ramTotal: 12,
        diskUsed: 50,
        diskTotal: 200,
        load1: 1.5,
      }),
      node({
        uuid: "offline",
        online: false,
        cpuCores: 32,
        cpuPct: 100,
        ramUsed: 64,
        ramTotal: 64,
        diskUsed: 500,
        diskTotal: 500,
        load1: 32,
      }),
    ]);

    expect(result).toEqual({
      onlineNodes: 2,
      cpuUsedCores: 5,
      cpuTotalCores: 12,
      memoryUsed: 10,
      memoryTotal: 20,
      diskUsed: 80,
      diskTotal: 300,
      load1: 4,
    });
  });

  it("bounds corrupt utilization and used-byte values without capping load", () => {
    const result = aggregateHomeResources([
      node({
        uuid: "odd",
        cpuCores: 4,
        cpuPct: 140,
        ramUsed: 12,
        ramTotal: 8,
        diskUsed: -4,
        diskTotal: 20,
        load1: 7,
      }),
    ]);

    expect(result.cpuUsedCores).toBe(4);
    expect(result.memoryUsed).toBe(8);
    expect(result.diskUsed).toBe(0);
    expect(result.load1).toBe(7);
  });
});
