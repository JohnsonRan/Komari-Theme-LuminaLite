import type { GpuDevice, GpuReport, NodeInfo, NodeMetrics, NodeRealtime } from "@/types/komari";

export type RealtimePayload = Record<string, unknown>;

export function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function asRecord(value: unknown): RealtimePayload {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RealtimePayload)
    : {};
}

// 旧扁平协议的 connections 是 TCP+UDP 合计。
export function resolveFlatConnectionsTcp(payload: RealtimePayload): number {
  if (payload.connections_tcp != null) return asNumber(payload.connections_tcp);
  return Math.max(0, asNumber(payload.connections) - asNumber(payload.connections_udp));
}

// GPU 缺失、负数和无效值不能伪装成 0；空闲设备的真实 0 必须保留。
function gpuNumber(value: unknown, max = Infinity): number | undefined {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return undefined;
  const number = asNumber(value, NaN);
  return number >= 0 && number <= max ? number : undefined;
}

/** 兼容 v2.Report、旧嵌套字段，以及由调用方映射的 1.5.0 扁平字段。 */
function parseGpuReport(gpu: RealtimePayload): GpuReport | undefined {
  const devices: GpuDevice[] = [];
  for (const raw of Array.isArray(gpu.detailed_info) ? gpu.detailed_info : []) {
    const device = asRecord(raw);
    if (Object.keys(device).length === 0) continue;
    devices.push({
      name: typeof device.name === "string" ? device.name.trim() : "",
      usage: gpuNumber(device.utilization ?? device.usage, 100),
      memoryUsed: gpuNumber(device.memory_used ?? device.memoryUsed),
      memoryTotal: gpuNumber(device.memory_total ?? device.memoryTotal),
      temperature: gpuNumber(device.temperature),
    });
  }
  const count = gpuNumber(gpu.count);
  const usage = gpuNumber(gpu.average_usage ?? gpu.averageUsage ?? gpu.usage, 100);
  const report: GpuReport = {
    count: count == null ? (devices.length || undefined) : Math.max(Math.trunc(count), devices.length),
    devices: Array.isArray(gpu.detailed_info) ? devices : undefined,
    usage,
    memoryUsed: gpuNumber(gpu.memory_used ?? gpu.memoryUsed),
    memoryTotal: gpuNumber(gpu.memory_total ?? gpu.memoryTotal),
    temperature: gpuNumber(gpu.temperature),
  };
  if (devices.length > 0) {
    for (const field of ["usage", "memoryUsed", "memoryTotal", "temperature"] as const) {
      const values = devices.flatMap((device) => device[field] == null ? [] : [device[field]]);
      // 只有全部已声明设备都有该指标时才补算，不能把部分设备的平均/合计冒充整机值。
      if (values.length !== devices.length || report.count !== devices.length) continue;
      const isMemory = field === "memoryUsed" || field === "memoryTotal";
      report[field] ??= values.reduce((sum, value) => sum + value, 0) / (isMemory ? 1 : values.length);
    }
  }
  if (report.count === 0) return { count: 0, devices: [] };
  return report.count != null || report.usage != null || report.memoryUsed != null ||
    report.memoryTotal != null || report.temperature != null ? report : undefined;
}

/**
 * Parses the embedded ping map from a realtime payload without applying UI binding rules.
 * Invalid negative values remain NaN so the metrics merge can normalize them to null.
 */
export function parseEmbeddedPing(
  raw: unknown,
): NodeRealtime["ping"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const map = raw as Record<string, unknown>;
  const keys = Object.keys(map);
  if (keys.length === 0) return undefined;
  // 负值视为无效（全部丢包时后端可能返回 -1）；NaN 由下游 Number.isFinite 收敛为 null。
  const toStat = (value: unknown) => {
    const n = asNumber(value, -1);
    return n >= 0 ? n : NaN;
  };
  const result: NonNullable<NodeRealtime["ping"]> = {};
  for (const key of keys) {
    const entry = map[key];
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    result[key] = {
      latest: toStat(rec.latest),
      loss: toStat(rec.loss),
      avg: toStat(rec.avg),
      min: toStat(rec.min),
      max: toStat(rec.max),
    };
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/** Normalizes nested reports and both current/legacy flat realtime payloads. */
export function normalizeRealtime(
  raw: unknown,
  meta: NodeInfo,
  metrics: NodeMetrics,
): NodeRealtime | null {
  const payload = asRecord(raw);
  if (Object.keys(payload).length === 0) return null;

  const cpu = asRecord(payload.cpu);
  const gpu = asRecord(payload.gpu);
  const ram = asRecord(payload.ram);
  const swap = asRecord(payload.swap);
  const load = asRecord(payload.load);
  const disk = asRecord(payload.disk);
  const network = asRecord(payload.network);
  const connections = asRecord(payload.connections);
  const hasNestedShape =
    Object.keys(cpu).length > 0 ||
    Object.keys(ram).length > 0 ||
    Object.keys(network).length > 0;

  const ping = parseEmbeddedPing(payload.ping);

  if (hasNestedShape) {
    return {
      cpu: { usage: asNumber(cpu.usage) },
      gpu: parseGpuReport(gpu),
      ram: {
        total: asNumber(ram.total, metrics.ramTotal || meta.mem_total),
        used: asNumber(ram.used),
      },
      swap: {
        total: asNumber(swap.total, metrics.swapTotal || meta.swap_total),
        used: asNumber(swap.used),
      },
      load: {
        load1: asNumber(load.load1),
        load5: asNumber(load.load5),
        load15: asNumber(load.load15),
      },
      disk: {
        total: asNumber(disk.total, metrics.diskTotal || meta.disk_total),
        used: asNumber(disk.used),
      },
      network: {
        up: asNumber(network.up),
        down: asNumber(network.down),
        totalUp: asNumber(network.totalUp),
        totalDown: asNumber(network.totalDown),
      },
      connections: {
        tcp: asNumber(connections.tcp),
        udp: asNumber(connections.udp),
      },
      uptime: asNumber(payload.uptime),
      process: asNumber(payload.process),
      updated_at: (payload.updated_at ?? payload.time) as string | number | undefined,
      ping,
    };
  }

  return {
    cpu: { usage: asNumber(payload.cpu) },
    gpu: typeof payload.gpu === "object" && payload.gpu !== null
      ? parseGpuReport(asRecord(payload.gpu))
      : payload.gpu_count != null || Array.isArray(payload.gpu_detailed_info) ||
          (Boolean(meta.gpu_name.trim()) && !/^none$/i.test(meta.gpu_name.trim())) ||
          [payload.gpu, payload.gpu_average_usage, payload.gpu_memory_used, payload.gpu_memory_total, payload.gpu_temperature]
            .some((value) => (gpuNumber(value) ?? 0) > 0)
        ? parseGpuReport({
            count: payload.gpu_count,
            average_usage: payload.gpu_average_usage ?? payload.gpu,
            detailed_info: payload.gpu_detailed_info,
            memory_used: payload.gpu_memory_used,
            memory_total: payload.gpu_memory_total,
            temperature: payload.gpu_temperature,
          })
        : undefined,
    ram: {
      total: asNumber(payload.ram_total, metrics.ramTotal || meta.mem_total),
      used: asNumber(payload.ram),
    },
    swap: {
      total: asNumber(payload.swap_total, metrics.swapTotal || meta.swap_total),
      used: asNumber(payload.swap),
    },
    load: {
      load1: asNumber(payload.load),
      load5: asNumber(payload.load5),
      load15: asNumber(payload.load15),
    },
    disk: {
      total: asNumber(payload.disk_total, metrics.diskTotal || meta.disk_total),
      used: asNumber(payload.disk),
    },
    network: {
      up: asNumber(payload.net_out),
      down: asNumber(payload.net_in),
      totalUp: asNumber(payload.net_total_up),
      totalDown: asNumber(payload.net_total_down),
    },
    connections: {
      tcp: resolveFlatConnectionsTcp(payload),
      udp: asNumber(payload.connections_udp),
    },
    uptime: asNumber(payload.uptime),
    process: asNumber(payload.process),
    updated_at: (payload.updated_at ?? payload.time) as string | number | undefined,
    ping,
  };
}
