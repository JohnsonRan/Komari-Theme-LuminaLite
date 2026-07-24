import { useQuery } from "@tanstack/react-query";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { fetchWithTimeout } from "@/utils/abort";
import { VISITOR_INFO_PROVIDERS, type VisitorInfo } from "@/utils/visitorInfo";

const PROVIDER_TIMEOUT_MS = 8_000;

async function fetchVisitorInfo(signal?: AbortSignal): Promise<VisitorInfo | null> {
  for (const provider of VISITOR_INFO_PROVIDERS) {
    // 串行而非并发：第一家成功就不该再把访客 IP 送给另外两家。
    try {
      const response = await fetchWithTimeout(
        provider.url,
        { headers: { Accept: "application/json" }, signal },
        PROVIDER_TIMEOUT_MS,
      );
      if (!response.ok) continue;
      const info = provider.normalize(await response.json());
      if (info) return info;
    } catch {
      if (signal?.aborted) throw new Error("aborted");
      // 单家失败就换下一家；三家都失败时返回 null，调用方据此不渲染。
    }
  }
  return null;
}

/**
 * 访客自身的 IP 信息。同一次会话内不会变，所以查一次就长期复用，
 * 也不随路由切换重取（react-query 按 key 缓存）。
 */
export function useVisitorInfo() {
  const { isReady, showVisitorInfo } = useThemeSettings();
  return useQuery({
    queryKey: ["visitor-info"],
    queryFn: ({ signal }) => fetchVisitorInfo(signal),
    enabled: isReady && showVisitorInfo,
    staleTime: Infinity,
    gcTime: Infinity,
    // 三家接口内部已经逐个回退过了，整体再重试只是把同样的请求重发一遍。
    retry: false,
    refetchOnWindowFocus: false,
  });
}
