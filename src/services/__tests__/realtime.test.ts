import { describe, expect, it } from "vitest";
import type { NodeInfo, NodeMetrics } from "@/types/komari";
import {
  normalizeRealtime,
  parseEmbeddedPing,
  resolveFlatConnectionsTcp,
} from "@/services/ws/realtime";

const meta: NodeInfo = {
  uuid: "node-1",
  name: "Node 1",
  group: "",
  region: "",
  hidden: false,
  cpu_name: "",
  cpu_cores: 0,
  arch: "",
  virtualization: "",
  os: "",
  kernel_version: "",
  gpu_name: "",
  mem_total: 4096,
  swap_total: 1024,
  disk_total: 8192,
  weight: 0,
  price: 0,
  billing_cycle: "",
  auto_renewal: false,
  currency: "",
  expired_at: "",
  tags: "",
  public_remark: "",
  traffic_limit: 0,
  traffic_limit_type: "",
  ipv4: "",
  ipv6: "",
  created_at: "",
  updated_at: "",
};

const metrics: NodeMetrics = {
  online: null,
  cpuPct: 0,
  ramUsed: 0,
  ramTotal: 0,
  ramPct: 0,
  swapUsed: 0,
  swapTotal: 0,
  diskUsed: 0,
  diskTotal: 0,
  diskPct: 0,
  netUp: 0,
  netDown: 0,
  trafficUp: 0,
  trafficDown: 0,
  uptime: 0,
  load1: 0,
  load5: 0,
  load15: 0,
  process: 0,
  connectionsTcp: 0,
  connectionsUdp: 0,
  updatedAt: 0,
  pingStats: null,
  gpuPct: 0,
  gpuMemUsed: 0,
  gpuMemTotal: 0,
  gpuTemp: 0,
};

describe("parseEmbeddedPing", () => {
  it("keeps valid samples and represents negative samples as NaN", () => {
    const ping = parseEmbeddedPing({
      good: { latest: "12", loss: 0, avg: 10, min: 8, max: 16 },
      lost: { latest: -1, loss: -1 },
      invalid: null,
    });

    expect(ping?.good).toEqual({ latest: 12, loss: 0, avg: 10, min: 8, max: 16 });
    expect(Number.isNaN(ping?.lost.latest)).toBe(true);
    expect(Number.isNaN(ping?.lost.loss)).toBe(true);
  });

  it("rejects empty maps and non-object values", () => {
    expect(parseEmbeddedPing({})).toBeUndefined();
    expect(parseEmbeddedPing([])).toBeUndefined();
    expect(parseEmbeddedPing(null)).toBeUndefined();
  });
});

describe("normalizeRealtime", () => {
  it("normalizes nested reports and retains embedded ping data", () => {
    expect(
      normalizeRealtime(
        {
          cpu: { usage: "25" },
          ram: { used: 512 },
          network: { up: 100, down: 200, totalUp: 300, totalDown: 400 },
          connections: { tcp: 3, udp: 2 },
          ping: { task: { latest: 18, loss: 0 } },
        },
        meta,
        metrics,
      ),
    ).toMatchObject({
      cpu: { usage: 25 },
      ram: { total: 4096, used: 512 },
      network: { up: 100, down: 200, totalUp: 300, totalDown: 400 },
      connections: { tcp: 3, udp: 2 },
      ping: { task: { latest: 18, loss: 0 } },
    });
  });

  it("normalizes legacy combined connections without changing the TCP rule", () => {
    expect(
      normalizeRealtime({ connections: 12, connections_udp: 5 }, meta, metrics)?.connections,
    ).toEqual({ tcp: 7, udp: 5 });
    expect(resolveFlatConnectionsTcp({ connections: 12, connections_udp: 5 })).toBe(7);
  });
});
