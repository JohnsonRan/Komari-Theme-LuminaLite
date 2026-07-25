import type { LoadRecord } from "@/types/komari";

export const TRAFFIC_UP_METRIC = "traffic.up";
export const TRAFFIC_DOWN_METRIC = "traffic.down";
export const RATE_UP_METRIC = "net.out.rate";
export const RATE_DOWN_METRIC = "net.in.rate";
export const CONN_TCP_METRIC = "connections.tcp";
export const CONN_UDP_METRIC = "connections.udp";

export const TODAY_TRAFFIC_METRIC_KEYS = [
  TRAFFIC_UP_METRIC,
  TRAFFIC_DOWN_METRIC,
  RATE_UP_METRIC,
  RATE_DOWN_METRIC,
  CONN_TCP_METRIC,
  CONN_UDP_METRIC,
] as const;

export const TODAY_TRAFFIC_AGGREGATION = {
  [TRAFFIC_UP_METRIC]: "sum",
  [TRAFFIC_DOWN_METRIC]: "sum",
  [RATE_UP_METRIC]: "max",
  [RATE_DOWN_METRIC]: "max",
  // 连接数看峰值（今日最高并发），与速率一致取 max。
  [CONN_TCP_METRIC]: "max",
  [CONN_UDP_METRIC]: "max",
} as const;

export interface TrafficMetricSeries {
  metricKey: string;
  client: string;
  intervalSeconds?: number;
  points: Array<{ time: string; value: number | null; count: number }>;
}

export interface TodayTrafficStat {
  uuid: string;
  trafficUp: number;
  trafficDown: number;
  peakUp: number;
  peakUpAt: number | null;
  peakDown: number;
  peakDownAt: number | null;
  // 今日连接峰值（TCP / UDP），与速率峰值同取 max。
  peakTcp: number;
  peakTcpAt: number | null;
  peakUdp: number;
  peakUdpAt: number | null;
  sampleCount: number;
  hasSamples: boolean;
}

export interface TodayTrafficSample {
  timeMs: number;
  up: number;
  down: number;
}

// 连接数采样（TCP / UDP），供「今日连接」页画曲线。
export interface TodayConnectionSample {
  timeMs: number;
  tcp: number;
  udp: number;
}

function emptyStat(uuid: string): TodayTrafficStat {
  return {
    uuid,
    trafficUp: 0,
    trafficDown: 0,
    peakUp: 0,
    peakUpAt: null,
    peakDown: 0,
    peakDownAt: null,
    peakTcp: 0,
    peakTcpAt: null,
    peakUdp: 0,
    peakUdpAt: null,
    sampleCount: 0,
    hasSamples: false,
  };
}

function validPoint(point: TrafficMetricSeries["points"][number]) {
  return point.count > 0 && point.value != null && Number.isFinite(point.value);
}

export function summarizeTodayTrafficMetrics(
  series: TrafficMetricSeries[],
  uuids: string[],
): TodayTrafficStat[] {
  const stats = new Map(uuids.map((uuid) => [uuid, emptyStat(uuid)] as const));
  const sampleTimes = new Map(uuids.map((uuid) => [uuid, new Set<number>()] as const));

  for (const item of series) {
    const stat = stats.get(item.client);
    if (!stat) continue;
    for (const point of item.points) {
      if (!validPoint(point)) continue;
      const timeMs = Date.parse(point.time);
      if (!Number.isFinite(timeMs)) continue;
      const value = Math.max(0, point.value ?? 0);
      sampleTimes.get(item.client)?.add(timeMs);
      stat.hasSamples = true;

      switch (item.metricKey) {
        case TRAFFIC_UP_METRIC:
          stat.trafficUp += value;
          break;
        case TRAFFIC_DOWN_METRIC:
          stat.trafficDown += value;
          break;
        case RATE_UP_METRIC:
          if (value > stat.peakUp || stat.peakUpAt == null) {
            stat.peakUp = value;
            stat.peakUpAt = timeMs;
          }
          break;
        case RATE_DOWN_METRIC:
          if (value > stat.peakDown || stat.peakDownAt == null) {
            stat.peakDown = value;
            stat.peakDownAt = timeMs;
          }
          break;
        case CONN_TCP_METRIC:
          if (value > stat.peakTcp || stat.peakTcpAt == null) {
            stat.peakTcp = value;
            stat.peakTcpAt = timeMs;
          }
          break;
        case CONN_UDP_METRIC:
          if (value > stat.peakUdp || stat.peakUdpAt == null) {
            stat.peakUdp = value;
            stat.peakUdpAt = timeMs;
          }
          break;
      }
    }
  }

  for (const [uuid, stat] of stats) {
    stat.sampleCount = sampleTimes.get(uuid)?.size ?? 0;
  }
  return [...stats.values()];
}

export function buildTodayTrafficMetricSamples(
  series: TrafficMetricSeries[],
  uuid: string,
): TodayTrafficSample[] {
  const samples = new Map<number, TodayTrafficSample>();
  for (const item of series) {
    if (
      item.client !== uuid ||
      (item.metricKey !== RATE_UP_METRIC && item.metricKey !== RATE_DOWN_METRIC)
    ) {
      continue;
    }
    for (const point of item.points) {
      if (!validPoint(point)) continue;
      const timeMs = Date.parse(point.time);
      if (!Number.isFinite(timeMs)) continue;
      const sample = samples.get(timeMs) ?? { timeMs, up: 0, down: 0 };
      if (item.metricKey === RATE_UP_METRIC) sample.up = Math.max(0, point.value ?? 0);
      else sample.down = Math.max(0, point.value ?? 0);
      samples.set(timeMs, sample);
    }
  }
  return [...samples.values()].sort((left, right) => right.timeMs - left.timeMs);
}

function recordTimeMs(record: LoadRecord) {
  if (typeof record.time === "number") {
    return record.time > 1_000_000_000_000 ? record.time : record.time * 1000;
  }
  return Date.parse(record.time);
}

function counterDelta(current: number, previous: number) {
  if (!Number.isFinite(current) || current < 0) return 0;
  if (!Number.isFinite(previous) || previous < 0) return 0;
  return current >= previous ? current - previous : current;
}

export function summarizeTodayTrafficRecords(
  uuid: string,
  records: LoadRecord[],
  startMs: number,
  endMs: number,
): TodayTrafficStat {
  const stat = emptyStat(uuid);
  const sorted = records
    .map((record) => ({ record, timeMs: recordTimeMs(record) }))
    .filter(({ timeMs }) => Number.isFinite(timeMs) && timeMs <= endMs)
    .sort((left, right) => left.timeMs - right.timeMs);

  let previous: LoadRecord | null = null;
  for (const item of sorted) {
    const { record, timeMs } = item;
    if (timeMs < startMs) {
      previous = record;
      continue;
    }

    stat.hasSamples = true;
    stat.sampleCount += 1;
    if (previous) {
      stat.trafficUp += counterDelta(record.net_total_up, previous.net_total_up);
      stat.trafficDown += counterDelta(record.net_total_down, previous.net_total_down);
    }
    if (record.net_out > stat.peakUp || stat.peakUpAt == null) {
      stat.peakUp = Math.max(0, record.net_out);
      stat.peakUpAt = timeMs;
    }
    if (record.net_in > stat.peakDown || stat.peakDownAt == null) {
      stat.peakDown = Math.max(0, record.net_in);
      stat.peakDownAt = timeMs;
    }
    if (record.connections > stat.peakTcp || stat.peakTcpAt == null) {
      stat.peakTcp = Math.max(0, record.connections);
      stat.peakTcpAt = timeMs;
    }
    if (record.connections_udp > stat.peakUdp || stat.peakUdpAt == null) {
      stat.peakUdp = Math.max(0, record.connections_udp);
      stat.peakUdpAt = timeMs;
    }
    previous = record;
  }

  return stat;
}

export function buildTodayTrafficRecordSamples(
  records: LoadRecord[],
  startMs: number,
  endMs: number,
): TodayTrafficSample[] {
  return records
    .map((record) => ({ record, timeMs: recordTimeMs(record) }))
    .filter(
      ({ timeMs }) => Number.isFinite(timeMs) && timeMs >= startMs && timeMs <= endMs,
    )
    .map(({ record, timeMs }) => ({
      timeMs,
      up: Math.max(0, Number.isFinite(record.net_out) ? record.net_out : 0),
      down: Math.max(0, Number.isFinite(record.net_in) ? record.net_in : 0),
    }))
    .sort((left, right) => right.timeMs - left.timeMs);
}

// metrics 路径：从 CONN_TCP/UDP 序列拼出单节点的连接曲线。
export function buildTodayConnectionMetricSamples(
  series: TrafficMetricSeries[],
  uuid: string,
): TodayConnectionSample[] {
  const samples = new Map<number, TodayConnectionSample>();
  for (const item of series) {
    if (item.client !== uuid || (item.metricKey !== CONN_TCP_METRIC && item.metricKey !== CONN_UDP_METRIC)) {
      continue;
    }
    for (const point of item.points) {
      if (!validPoint(point)) continue;
      const timeMs = Date.parse(point.time);
      if (!Number.isFinite(timeMs)) continue;
      const sample = samples.get(timeMs) ?? { timeMs, tcp: 0, udp: 0 };
      if (item.metricKey === CONN_TCP_METRIC) sample.tcp = Math.max(0, point.value ?? 0);
      else sample.udp = Math.max(0, point.value ?? 0);
      samples.set(timeMs, sample);
    }
  }
  return [...samples.values()].sort((left, right) => right.timeMs - left.timeMs);
}

// records 回退路径：从 LoadRecord.connections / connections_udp 拼连接曲线。
export function buildTodayConnectionRecordSamples(
  records: LoadRecord[],
  startMs: number,
  endMs: number,
): TodayConnectionSample[] {
  return records
    .map((record) => ({ record, timeMs: recordTimeMs(record) }))
    .filter(
      ({ timeMs }) => Number.isFinite(timeMs) && timeMs >= startMs && timeMs <= endMs,
    )
    .map(({ record, timeMs }) => ({
      timeMs,
      tcp: Math.max(0, Number.isFinite(record.connections) ? record.connections : 0),
      udp: Math.max(0, Number.isFinite(record.connections_udp) ? record.connections_udp : 0),
    }))
    .sort((left, right) => right.timeMs - left.timeMs);
}
