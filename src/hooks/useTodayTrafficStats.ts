import { queryOptions, useQuery, type QueryClient } from "@tanstack/react-query";
import { getLoadRecords, getTodayTrafficMetrics } from "@/services/api";
import {
  buildTodayTrafficMetricSamples,
  buildTodayTrafficRecordSamples,
  summarizeTodayTrafficMetrics,
  summarizeTodayTrafficRecords,
  type TodayTrafficSample,
  type TodayTrafficStat,
} from "@/utils/trafficStats";

const FALLBACK_CONCURRENCY = 8;
const OPTIONAL_METRIC_TIMEOUT_MS = 6_000;
const FALLBACK_REQUEST_TIMEOUT_MS = 8_000;
const TRAFFIC_STATS_REFRESH_MS = 5 * 60 * 1000;

export interface TodayTrafficStatsResponse {
  rows: TodayTrafficStat[];
  samplesByUuid: Record<string, TodayTrafficSample[]>;
  rangeStartMs: number;
  rangeEndMs: number;
  intervalSeconds?: number;
  source: "metrics" | "records";
}

export function localDayStartMs(now: number) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

async function loadRecordFallback(
  uuids: string[],
  startMs: number,
  endMs: number,
  signal: AbortSignal,
): Promise<Pick<TodayTrafficStatsResponse, "rows" | "samplesByUuid">> {
  const rows: TodayTrafficStat[] = [];
  const samplesByUuid: Record<string, TodayTrafficSample[]> = {};
  for (let index = 0; index < uuids.length; index += FALLBACK_CONCURRENCY) {
    const batch = uuids.slice(index, index + FALLBACK_CONCURRENCY);
    const responses = await Promise.all(
      batch.map(async (uuid) => {
        const data = await getLoadRecords(uuid, 24, {
          signal,
          timeout: FALLBACK_REQUEST_TIMEOUT_MS,
          // 聚合接口刚刚失败过，兼容路径直接读 records，避免每台节点重复探测。
          skipMetricQuery: true,
        });
        return {
          row: summarizeTodayTrafficRecords(uuid, data.records, startMs, endMs),
          samples: buildTodayTrafficRecordSamples(data.records, startMs, endMs),
        };
      }),
    );
    for (let offset = 0; offset < responses.length; offset += 1) {
      const uuid = batch[offset];
      const response = responses[offset];
      if (!uuid || !response) continue;
      rows.push(response.row);
      samplesByUuid[uuid] = response.samples;
    }
  }
  return { rows, samplesByUuid };
}

function getTodayTrafficQueryOptions(uuids: string[], now: number) {
  const stableUuids = [...new Set(uuids)].sort();
  const startMs = localDayStartMs(now);
  const uuidSignature = stableUuids.join(",");

  return queryOptions({
    queryKey: ["traffic-stats", "today", startMs, uuidSignature],
    queryFn: async ({ signal }): Promise<TodayTrafficStatsResponse> => {
      const endMs = Date.now();
      try {
        const data = await getTodayTrafficMetrics(stableUuids, startMs, endMs, {
          signal,
          timeout: OPTIONAL_METRIC_TIMEOUT_MS,
        });
        return {
          rows: summarizeTodayTrafficMetrics(data.series, stableUuids),
          samplesByUuid: Object.fromEntries(
            stableUuids.map((uuid) => [
              uuid,
              buildTodayTrafficMetricSamples(data.series, uuid),
            ]),
          ),
          rangeStartMs: data.rangeStartMs,
          rangeEndMs: data.rangeEndMs,
          intervalSeconds: data.intervalSeconds,
          source: "metrics",
        };
      } catch (error) {
        if (signal.aborted) throw error;
        const fallback = await loadRecordFallback(stableUuids, startMs, endMs, signal);
        return {
          ...fallback,
          rangeStartMs: startMs,
          rangeEndMs: endMs,
          source: "records",
        };
      }
    },
    enabled: stableUuids.length > 0,
    staleTime: 60_000,
    refetchInterval: TRAFFIC_STATS_REFRESH_MS,
    refetchOnWindowFocus: false,
    retry: 0,
  });
}

export function useTodayTrafficStats(uuids: string[], now: number) {
  return useQuery(getTodayTrafficQueryOptions(uuids, now));
}

export function preloadTodayTrafficStats(
  queryClient: QueryClient,
  uuids: string[],
  now = Date.now(),
) {
  if (uuids.length === 0) return Promise.resolve();
  return queryClient.prefetchQuery(getTodayTrafficQueryOptions(uuids, now));
}
