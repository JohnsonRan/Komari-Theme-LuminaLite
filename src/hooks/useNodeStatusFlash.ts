import { useCallback, useEffect, useRef, useState, type AnimationEvent } from "react";
import { useMotionSettings } from "@/components/ui/MotionSettings";
import {
  isNodeStatusFlashAnimationName,
  resolveStatusFlash,
  type NodeStatusFlashKind,
  type NodeStatusSnapshot,
} from "@/utils/nodeStatusFlash";
import type { AttentionResult } from "@/utils/nodeAttention";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

/**
 * 节点状态的一次性视觉反馈：online/offline 翻转或 attention 进入 warning 时，
 * 给卡片挂 status-flash-* 类；真实 CSS animationend 到达后立即摘类。
 *
 * 不用 JS 定时器：React StrictMode 会在开发环境重连 Effect，定时器 cleanup 可能在
 * 动画刚开始时被调用。由 animationend 驱动既与实际视觉时长一致，也不会留下覆盖阴影的类。
 */
export function useNodeStatusFlash(
  online: boolean | null,
  attention: AttentionResult,
): {
  className: string | null;
  onAnimationEnd: (event: AnimationEvent<HTMLElement>) => void;
} {
  const reducedMotion = usePrefersReducedMotion();
  const { iconAnimations } = useMotionSettings();
  const [flashKind, setFlashKind] = useState<NodeStatusFlashKind | null>(null);
  const previousRef = useRef<NodeStatusSnapshot | null>(null);
  const tone = online === null ? null : online ? "online" : "offline";

  useEffect(() => {
    const next: NodeStatusSnapshot = { tone, attention: attention.level };
    const previous = previousRef.current;
    // 门控期间也推进基线，重新开启时不能补播已经过去的变化。
    previousRef.current = next;

    if (!iconAnimations || reducedMotion) {
      setFlashKind(null);
      return;
    }
    if (previous === null || tone === null) return;

    const kind = resolveStatusFlash(
      previous.tone,
      next.tone,
      previous.attention,
      next.attention,
    );
    if (kind) setFlashKind(kind);
  }, [tone, attention.level, iconAnimations, reducedMotion]);

  const onAnimationEnd = useCallback((event: AnimationEvent<HTMLElement>) => {
    if (event.currentTarget !== event.target) return;
    if (!isNodeStatusFlashAnimationName(event.animationName)) return;
    setFlashKind(null);
  }, []);

  return {
    className: flashKind === null ? null : `status-flash-${flashKind}`,
    onAnimationEnd,
  };
}
