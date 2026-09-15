import { queryOptions, useQuery, type QueryClient } from "@tanstack/react-query";
import {
  buildTodayConnectionMetricSamples,
  buildTodayTrafficMetricSamples,
  summarizeTodayTrafficMetrics,
  type TodayConnectionSample,
  type TodayTrafficSample,
  type TodayTrafficStat,
} from "@/utils/trafficStats";

const METRIC_TIMEOUT_MS = 6_000;
const TRAFFIC_STATS_REFRESH_MS = 5 * 60 * 1000;

export interface TodayTrafficStatsResponse {
  rows: TodayTrafficStat[];
  samplesByUuid: Record<string, TodayTrafficSample[]>;
  connectionSamplesByUuid: Record<string, TodayConnectionSample[]>;
  rangeStartMs: number;
  rangeEndMs: number;
  intervalSeconds?: number;
}

export function localDayStartMs(now: number) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

function getTodayTrafficQueryOptions(uuids: string[], now: number) {
  const stableUuids = [...new Set(uuids)].sort();
  const startMs = localDayStartMs(now);
  const uuidSignature = stableUuids.join(",");

  return queryOptions({
    queryKey: ["traffic-stats", "today", startMs, uuidSignature],
    queryFn: async ({ signal }): Promise<TodayTrafficStatsResponse> => {
      const endMs = Date.now();
      const { getTodayTrafficMetrics } = await import("@/services/api");
      const data = await getTodayTrafficMetrics(stableUuids, startMs, endMs, {
        signal,
        timeout: METRIC_TIMEOUT_MS,
      });
      return {
        rows: summarizeTodayTrafficMetrics(data.series, stableUuids),
        samplesByUuid: Object.fromEntries(
          stableUuids.map((uuid) => [
            uuid,
            buildTodayTrafficMetricSamples(data.series, uuid),
          ]),
        ),
        connectionSamplesByUuid: Object.fromEntries(
          stableUuids.map((uuid) => [
            uuid,
            buildTodayConnectionMetricSamples(data.series, uuid),
          ]),
        ),
        rangeStartMs: data.rangeStartMs,
        rangeEndMs: data.rangeEndMs,
        intervalSeconds: data.intervalSeconds,
      };
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
