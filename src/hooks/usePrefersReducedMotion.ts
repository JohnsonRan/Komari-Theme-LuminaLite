import { useMediaQuery } from "@/hooks/useMediaQuery";
import { PREFERS_REDUCED_MOTION_QUERY } from "@/utils/motion";

/**
 * 响应式订阅系统 prefers-reduced-motion,供 FLIP、状态反馈等 JS 路径共用。
 * 默认 false(用户未要求减少动效);无 matchMedia 的环境(SSR/测试)恒为 false。
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery(PREFERS_REDUCED_MOTION_QUERY);
}
