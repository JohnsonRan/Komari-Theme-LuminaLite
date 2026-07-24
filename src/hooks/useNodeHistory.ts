import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getHomeHistory, type HomeHistoryResponse } from "@/services/api";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { buildNodeHistory, EMPTY_NODE_HISTORY, type NodeHistory } from "@/utils/nodeHistory";

/** 24 小时窗口切成 96 格 = 15 分钟一格。见 getHomeHistory 关于载荷与分辨率的取舍。 */
export const HOME_HISTORY_HOURS = 24;
export const HOME_HISTORY_SLOTS = 96;

// 历史是慢数据：15 分钟一格，5 分钟刷一次已经远快于它的变化速度。
// 刻意不挂在 2 秒的 WS tick 上 —— 那会把一次 ~60 KB 的请求变成持续流量。
const REFRESH_MS = 5 * 60_000;

const HOME_HISTORY_QUERY_KEY = ["home", "history", HOME_HISTORY_HOURS, HOME_HISTORY_SLOTS] as const;

/**
 * 首页 24 小时历史的共享查询。
 *
 * 每张卡片都调用它：react-query 按 key 去重，全首页只发一次请求、共用一份缓存。
 * 不按当前筛选结果查询 —— 那样每次切分组/地区都会换 queryKey 重新请求，而节点集合没变。
 */
function useHomeHistoryQuery() {
  const { isReady, showNodeHistory } = useThemeSettings();
  return useQuery<HomeHistoryResponse>({
    queryKey: HOME_HISTORY_QUERY_KEY,
    queryFn: ({ signal }) => getHomeHistory(HOME_HISTORY_HOURS, HOME_HISTORY_SLOTS, { signal }),
    enabled: isReady && showNodeHistory,
    staleTime: REFRESH_MS,
    refetchInterval: REFRESH_MS,
    // 旧版后端没有 metric API 时静默降级，不要每 5 分钟重试一次。
    retry: false,
  });
}

/**
 * 单个节点的 24 小时历史。
 *
 * 只为这一个 uuid 铺格子（O(96)），不构造整站的 map —— 否则每张卡片都要重算一遍全量。
 */
export function useNodeHistory(uuid: string): NodeHistory {
  const { data } = useHomeHistoryQuery();
  return useMemo(() => {
    if (!data) return EMPTY_NODE_HISTORY;
    const points = data.pointsByUuid.get(uuid);
    if (!points) return EMPTY_NODE_HISTORY;
    return buildNodeHistory(points, data.rangeStartMs, data.rangeEndMs, HOME_HISTORY_SLOTS);
  }, [data, uuid]);
}
