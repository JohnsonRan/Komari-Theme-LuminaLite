import { describe, expect, it } from "vitest";
import type { NodeInfo, NodeMetrics } from "@/types/komari";
import { mergeRealtime, shallowEqualMetrics } from "@/services/wsStore";
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

describe("GPU report pipeline", () => {
  const normalize = (payload: Record<string, unknown>, nodeMeta = meta) =>
    normalizeRealtime({ cpu: 1, ...payload }, nodeMeta, metrics)!;
  const merge = (payload: Record<string, unknown>, previous = metrics) =>
    mergeRealtime(previous, normalize(payload), true, meta.uuid);
  const device = (name: string, utilization: number) => ({
    name, utilization, memory_used: 0, memory_total: 1024, temperature: 40,
  });

  it("retains per-device information and aggregates nested reports", () => {
    const next = merge({ gpu: { count: 2, average_usage: 30, detailed_info: [device("A", 20), device("B", 40)] } });
    expect(next.gpu).toMatchObject({ count: 2, usage: 30, memoryUsed: 0, memoryTotal: 2048, temperature: 40,
      devices: [{ name: "A", usage: 20 }, { name: "B", usage: 40 }] });
    expect(next.gpuPct).toBe(30);
  });

  it("uses the live report count, not the number of GPUs named in static inventory", () => {
    // 脱敏自 1.5.0-fix1 的公开 WS 响应：静态枚举包含多卡，但仅一张卡正在上报。
    const realtime = normalize({ gpu: {
      count: 1, average_usage: 94,
      detailed_info: [{ name: "Dedicated GPU", memory_total: 17094934528, memory_used: 11592007680, utilization: 94, temperature: 61 }],
    } }, { ...meta, gpu_name: "Dedicated GPU × 2, Integrated GPU" });
    expect(realtime.gpu).toMatchObject({ count: 1, usage: 94, memoryTotal: 17094934528 });
    expect(realtime.gpu?.devices).toHaveLength(1);
  });

  it("accepts 1.5.0 flat fields, preferring average usage over the legacy scalar", () => {
    expect(merge({ gpu: 0, gpu_count: 1, gpu_average_usage: 42, gpu_detailed_info: [device("AMD", 42)] }).gpu)
      .toMatchObject({ count: 1, usage: 42, devices: [{ name: "AMD", usage: 42 }] });
  });

  it("keeps idle utilization without inventing missing memory or temperature", () => {
    expect(merge({ gpu: { count: 1, average_usage: 0 } }).gpu)
      .toMatchObject({ count: 1, usage: 0, memoryUsed: undefined, temperature: undefined });
    expect(normalize({ gpu: 0 }, { ...meta, gpu_name: "AMD" }).gpu?.usage).toBe(0);
    expect(normalize({ gpu: 0 }).gpu).toBeUndefined();
    expect(normalize({}).gpu).toBeUndefined();
  });

  it("accepts legacy flat memory-only and nested camelCase values", () => {
    expect(merge({ gpu_memory_used: 0, gpu_memory_total: 1024 }).gpu)
      .toMatchObject({ usage: undefined, memoryUsed: 0, memoryTotal: 1024 });
    expect(merge({ gpu: { usage: "12", memoryUsed: "0", memoryTotal: "1024", temperature: "0" } }).gpu)
      .toMatchObject({ usage: 12, memoryUsed: 0, memoryTotal: 1024, temperature: 0 });
  });

  it("preserves a missing report, but clears stale fields in a partial report and explicit zero devices", () => {
    const initial = merge({ gpu: { count: 1, detailed_info: [device("A", 50)] } });
    expect(merge({}, initial).gpu).toBe(initial.gpu);
    const partial = merge({ gpu: { count: 1, average_usage: 0 } }, initial);
    expect(partial.gpu?.memoryUsed).toBeUndefined();
    expect(partial.gpuMemTotal).toBe(0);
    const cleared = merge({ gpu_count: 0, gpu: 0, gpu_detailed_info: [] }, initial);
    expect(cleared.gpu).toEqual({ count: 0, devices: [] });
    expect(cleared.gpuPct).toBe(0);
    expect(cleared.gpuMemTotal).toBe(0);
  });

  it("notifies per-device changes even when all aggregate values stay equal", () => {
    const initial = merge({ gpu: { count: 2, detailed_info: [device("A", 20), device("B", 40)] } });
    const unchanged = merge({ gpu: { count: 2, detailed_info: [device("A", 20), device("B", 40)] } }, initial);
    expect(unchanged.gpu).toBe(initial.gpu);
    expect(shallowEqualMetrics(initial, unchanged)).toBe(true);
    const changed = merge({ gpu: { count: 2, detailed_info: [device("A", 40), device("B", 20)] } }, initial);
    expect(changed.gpuPct).toBe(initial.gpuPct);
    expect(shallowEqualMetrics(initial, changed)).toBe(false);
  });

  it("rejects invalid metrics and never totals incomplete per-card memory", () => {
    const report = merge({ gpu: { count: 2, average_usage: "bad", detailed_info: [
      device("A", 20), { name: "B", utilization: 200, temperature: -1, memory_used: null },
    ] } }).gpu;
    expect(report?.devices?.[1]).toMatchObject({ usage: undefined, temperature: undefined, memoryUsed: undefined });
    expect(report?.memoryTotal).toBeUndefined();
    expect(report?.usage).toBeUndefined();
    expect(report?.temperature).toBeUndefined();
    expect(merge({ gpu: { count: 2, detailed_info: [device("A", 20)] } }).gpu?.usage).toBeUndefined();
    expect(merge({ gpu: { usage: Infinity, temperature: "", memoryUsed: -1 } }).gpu).toBeUndefined();
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
