import { useQuery } from "@tanstack/react-query";
import type { RecentStatusRecord } from "@/services/api";

/**
 * 获取节点近期实时缓冲数据，用于详情页在完整历史加载前快速展示迷你趋势。
 * 旧后端无此 RPC 时请求失败，hook 返回空数组（静默降级）。
 */
export function useRecentStatus(uuid: string | undefined) {
  return useQuery<RecentStatusRecord[]>({
    queryKey: ["recentStatus", uuid],
    queryFn: async ({ signal }) => {
      const { getNodeRecentStatus } = await import("@/services/api");
      return getNodeRecentStatus(uuid!, { signal });
    },
    enabled: Boolean(uuid),
    staleTime: 30_000,
    retry: false,
  });
}
