import { useQuery } from "@tanstack/react-query";

const RECORD_QUERY_OPTIONS = {
  staleTime: 300_000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;

export function useLoadRecords(uuid: string, hours = 6, enabled = true) {
  return useQuery({
    queryKey: ["records", "load", uuid, hours],
    queryFn: async ({ signal }) => {
      const { getLoadRecords } = await import("@/services/api");
      return getLoadRecords(uuid, hours, { signal });
    },
    ...RECORD_QUERY_OPTIONS,
    enabled: Boolean(uuid) && enabled,
  });
}

export function usePingRecords(uuid: string, hours = 6, enabled = true) {
  return useQuery({
    queryKey: ["records", "ping", uuid, hours],
    queryFn: async ({ signal }) => {
      const { getPingRecords } = await import("@/services/api");
      return getPingRecords(uuid, hours, { signal });
    },
    ...RECORD_QUERY_OPTIONS,
    enabled: Boolean(uuid) && enabled,
  });
}

export function usePingStats(uuid: string, hours = 6, enabled = true) {
  return useQuery({
    queryKey: ["records", "ping-stats", uuid, hours],
    queryFn: async ({ signal }) => {
      const { getPingMetricStats } = await import("@/services/api");
      return getPingMetricStats(uuid, hours, { signal });
    },
    ...RECORD_QUERY_OPTIONS,
    retry: false,
    enabled: Boolean(uuid) && enabled,
  });
}
