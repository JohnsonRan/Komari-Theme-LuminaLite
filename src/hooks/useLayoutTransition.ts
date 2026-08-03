import { useLayoutEffect, useRef } from "react";
import {
  MOTION_COUNT_FLIP_MAX,
  MOTION_DURATION,
  MOTION_EASE,
} from "@/utils/motion";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useMotionSettings } from "@/components/ui/MotionSettings";

/** 序对是否完全一致(元素集合与相对顺序都不变)。FLIP 只播「移动」,集合/顺序没变就没有可播的。 */
export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export interface LayoutTransitionGate {
  hasHost: boolean;
  hasPreviousTrigger: boolean;
  triggerChanged: boolean;
  previousCount: number;
  nextCount: number;
  iconAnimations: boolean;
  reducedMotion: boolean;
  documentHidden: boolean;
}

/** FLIP 的完整批次门控。保持为纯函数，测试可覆盖每条降级边界。 */
export function shouldRunLayoutTransition(
  gate: LayoutTransitionGate,
  maxCount = MOTION_COUNT_FLIP_MAX,
): boolean {
  return (
    gate.hasHost &&
    gate.hasPreviousTrigger &&
    gate.triggerChanged &&
    gate.previousCount > 0 &&
    gate.nextCount > 0 &&
    gate.previousCount <= maxCount &&
    gate.nextCount <= maxCount &&
    gate.iconAnimations &&
    !gate.reducedMotion &&
    !gate.documentHidden
  );
}

/** 只生成 translate 关键帧：禁止 scale，避免卡片文字与 Canvas 被拉伸。 */
export function createFlipKeyframes(dx: number, dy: number): Keyframe[] {
  return [
    { transform: `translate(${dx}px, ${dy}px)` },
    { transform: "translate(0, 0)" },
  ];
}

interface TrackedItem {
  element: HTMLElement;
  left: number;
  top: number;
}

const EMPTY_TRACKED: TrackedItem[] = [];

/**
 * FLIP 重排:跟踪 host 内全部 [data-flip-id] 直接子元素,当 sequence(有序 uuid 列表)
 * 或 revision(视图模式等布局签名)变化时,对比前后视口位置,只给真正动了位置的元素
 * 播一段 transform-only 位移(仅 translate，避免缩放卡片文字与 Canvas)。新进/消失的元素不播:
 * 卡片首次内容入场由 content-enter 淡入负责,离场的直接移除 —— 这里只做「留下来但
 * 换了位置」的重排反馈。
 *
 * 门控(任一不满足就零操作,只维护快照、不启动动画):
 * - 「界面动效」开关关闭(data-icon-animations="false");
 * - 系统 prefers-reduced-motion;
 * - document.hidden(后台标签页的重排没人看得见);
 * - 元素不支持 WAAPI(无 element.animate);
 * - 任一侧数量超过 MOTION_COUNT_FLIP_MAX(与 tokens.css 的 --motion-count-flip-max 同值)。
 *
 * 读写纪律:layout effect 里先一次性读完所有终态 rect(批量读),再集中启动动画
 * (批量写)。animate() 本身不写 layout,谈不上强制同步布局,但读/写分段的形状让
 * 这一点不依赖 WAAPI 的实现细节。
 *
 * 与 content-visibility 的关系:卡片有 content-visibility:auto + contain-intrinsic-size,
 * 屏外卡片的 rect 可能是估算值,移动后的第一帧 rect 与移动前可能只差在估算修正上。
 * 对这类「估算跳变」不播动画的兜底是:位移前后都在视口外的卡片 dx/dy 通常为 0
 * (网格是文档流,估算尺寸是固定的),真的滚入视口时序列早已稳定,不会再触发本 hook。
 */
export function useLayoutTransition(
  hostRef: { current: HTMLElement | null },
  sequence: readonly string[],
  revision?: unknown,
): void {
  const reducedMotion = usePrefersReducedMotion();
  const { iconAnimations } = useMotionSettings();
  // 上一轮的完整快照:元素引用 + 视口位置。元素引用留着,才能识别「dom 还在但已离序列」。
  const trackedRef = useRef<TrackedItem[]>(EMPTY_TRACKED);
  // 上一轮的触发签名:顺序 + revision(视图模式)。两者都不变才算「没有重排」。
  const triggerRef = useRef<{ order: readonly string[]; revision: unknown } | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    const previous = trackedRef.current;
    const previousTrigger = triggerRef.current;

    // —— 读阶段(批量):收集本轮存活元素与终态 rect,不触发任何样式写入 ——
    const next: TrackedItem[] = [];
    if (host) {
      for (const element of host.querySelectorAll<HTMLElement>(":scope > [data-flip-id]")) {
        const rect = element.getBoundingClientRect();
        next.push({
          element,
          left: rect.left,
          top: rect.top,
        });
      }
    }
    trackedRef.current = next;
    triggerRef.current = { order: sequence, revision };

    const triggerChanged =
      previousTrigger !== null &&
      (previousTrigger.revision !== revision || !sameOrder(previousTrigger.order, sequence));

    // —— 门控:全部在读完之后、播之前判;关闭时上面只剩必要的快照维护 ——
    if (
      !shouldRunLayoutTransition({
        hasHost: host !== null,
        hasPreviousTrigger: previousTrigger !== null,
        triggerChanged,
        previousCount: previous.length,
        nextCount: next.length,
        iconAnimations,
        reducedMotion,
        documentHidden: typeof document !== "undefined" && document.hidden,
      })
    ) {
      return;
    }
    // shouldRunLayoutTransition 已验证该条件；这一行同时给 TypeScript 保留非空窄化。
    if (!host) return;

    const prevByUuid = new Map<string, TrackedItem>();
    for (const item of previous) {
      const uuid = item.element.dataset.flipId;
      // 只追踪仍挂在同一 host 里的元素:被卸载的(筛选掉/视图切换)没有终态可比。
      if (uuid && item.element.isConnected && host.contains(item.element)) {
        prevByUuid.set(uuid, item);
      }
    }
    if (prevByUuid.size === 0) return;

    // —— 播阶段(批量):只启动动画,不再读布局 ——
    const started: Animation[] = [];
    for (const item of next) {
      const uuid = item.element.dataset.flipId;
      if (!uuid) continue;
      const prev = prevByUuid.get(uuid);
      if (!prev) continue;
      const dx = prev.left - item.left;
      const dy = prev.top - item.top;
      if (dx === 0 && dy === 0) continue;
      if (typeof item.element.animate !== "function") continue;
      started.push(
        item.element.animate(createFlipKeyframes(dx, dy), {
          duration: MOTION_DURATION.slow,
          easing: MOTION_EASE.standard,
        }),
      );
    }

    if (started.length === 0) return;
    return () => {
      // 序列再次变化(或卸载)时打断在途位移,让新一轮以最新终态为基准,不叠两层位移。
      for (const animation of started) animation.cancel();
    };
  // reducedMotion 进依赖:切换系统降级时会多跑一次,但触发签名未变 → 短路,
  // 实际零操作(在途动画则因 cleanup 取消,正是要的降级行为)。
  }, [hostRef, sequence, revision, iconAnimations, reducedMotion]);
}
