import type { NodeInfo, NodeMetrics, NodeRealtime } from "@/types/komari";

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

/**
 * 解析后端 v1.Report 中的 GPU 字段。
 * 后端协议：{ count, average_usage, detailed_info: [{ name, memory_total, memory_used, utilization, temperature }] }
 * 兼容旧版扁平字段（usage / memoryUsed 等）。
 */
function parseGpuReport(
  gpu: RealtimePayload,
): { usage: number; memoryUsed?: number; memoryTotal?: number; temperature?: number } | undefined {
  if (Object.keys(gpu).length === 0) return undefined;

  // 新版协议：average_usage + detailed_info[]
  const detailedInfo = gpu.detailed_info;
  if (Array.isArray(detailedInfo) && detailedInfo.length > 0) {
    let memoryUsed = 0;
    let memoryTotal = 0;
    let tempSum = 0;
    let tempCount = 0;
    for (const device of detailedInfo) {
      const d = asRecord(device);
      memoryUsed += asNumber(d.memory_used ?? d.memoryUsed);
      memoryTotal += asNumber(d.memory_total ?? d.memoryTotal);
      const temp = asNumber(d.temperature, -1);
      if (temp >= 0) {
        tempSum += temp;
        tempCount += 1;
      }
    }
    return {
      usage: asNumber(gpu.average_usage ?? gpu.averageUsage ?? gpu.usage),
      memoryUsed,
      memoryTotal,
      temperature: tempCount > 0 ? tempSum / tempCount : undefined,
    };
  }

  // 旧版 / 扁平协议兼容
  const usage = asNumber(gpu.average_usage ?? gpu.averageUsage ?? gpu.usage);
  if (usage <= 0 && !asNumber(gpu.memory_used ?? gpu.memoryUsed) && !asNumber(gpu.temperature)) {
    return undefined;
  }
  return {
    usage,
    memoryUsed: asNumber(gpu.memory_used ?? gpu.memoryUsed) || undefined,
    memoryTotal: asNumber(gpu.memory_total ?? gpu.memoryTotal) || undefined,
    temperature: asNumber(gpu.temperature) || undefined,
  };
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

/** Normalizes both nested v1.Report and legacy flat realtime payloads. */
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
      : asNumber(payload.gpu) > 0 || asNumber(payload.gpu_temperature) > 0
        ? {
            usage: asNumber(payload.gpu),
            memoryUsed: asNumber(payload.gpu_memory_used) || undefined,
            memoryTotal: asNumber(payload.gpu_memory_total) || undefined,
            temperature: asNumber(payload.gpu_temperature) || undefined,
          }
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
