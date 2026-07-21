import type { LoadRecord } from "@/types/komari";

const LOAD_METRIC_FIELD = {
  "cpu.usage": "cpu",
  "memory.used": "ram",
  "memory.total": "ram_total",
  "swap.used": "swap",
  "swap.total": "swap_total",
  "load.average": "load",
  "disk.used": "disk",
  "disk.total": "disk_total",
  "net.in.rate": "net_in",
  "net.out.rate": "net_out",
  "net.total.up": "net_total_up",
  "net.total.down": "net_total_down",
  "process.count": "process",
  "connections.tcp": "connections",
  "connections.udp": "connections_udp",
} as const satisfies Record<string, keyof LoadRecord>;

export const LOAD_METRIC_KEYS = Object.keys(LOAD_METRIC_FIELD);

export const LOAD_LAST_AGGREGATION = {
  "memory.total": "last",
  "swap.total": "last",
  "disk.total": "last",
  "net.total.up": "last",
  "net.total.down": "last",
} as const;

export interface LoadMetricSeries {
  metricKey: string;
  client: string;
  intervalSeconds?: number;
  points: Array<{ time: string; value: number | null; count: number }>;
}

function emptyLoadRecord(client: string, time: string): LoadRecord {
  return {
    cpu: 0,
    gpu: 0,
    ram: 0,
    ram_total: 0,
    swap: 0,
    swap_total: 0,
    load: 0,
    temp: 0,
    disk: 0,
    disk_total: 0,
    net_in: 0,
    net_out: 0,
    net_total_up: 0,
    net_total_down: 0,
    process: 0,
    connections: 0,
    connections_udp: 0,
    time,
    client,
  };
}

export function mergeLoadMetricSeries(series: LoadMetricSeries[]): LoadRecord[] {
  const records = new Map<string, LoadRecord>();
  for (const item of series) {
    const field = LOAD_METRIC_FIELD[item.metricKey as keyof typeof LOAD_METRIC_FIELD];
    if (!field || !item.client) continue;
    for (const point of item.points) {
      if (point.count <= 0 || point.value == null || !Number.isFinite(point.value)) continue;
      const timeMs = Date.parse(point.time);
      if (!Number.isFinite(timeMs)) continue;
      const key = `${item.client}\u0000${timeMs}`;
      const record = records.get(key) ?? emptyLoadRecord(item.client, point.time);
      record[field] = point.value;
      records.set(key, record);
    }
  }
  return [...records.values()].sort(
    (left, right) => Date.parse(String(left.time)) - Date.parse(String(right.time)),
  );
}
