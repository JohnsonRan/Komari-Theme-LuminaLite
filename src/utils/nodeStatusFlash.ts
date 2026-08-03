// 节点状态的一次性视觉反馈(上线/离线/命中异常阈值时卡片/行闪烁一次)。
// 与 attentionAttrs(常驻语义染色)互补：这里仅把状态转移映射成短暂呈现信号。

import type { AttentionLevel } from "./nodeAttention";

/** 节点对外可感知的粗粒度状态。`null` 表示尚未有实时读数。 */
export type NodeStatusTone = "online" | "offline" | null;
export type NodeStatusFlashKind = "offline" | "attention" | "online";

export interface NodeStatusSnapshot {
  tone: NodeStatusTone;
  attention: AttentionLevel;
}

/**
 * 离线/在线与「需要关注」等级的唯一转移表。
 * 优先级：offline(故障) > attention(阈值命中) > online(恢复在线)。
 */
export function resolveStatusFlash(
  prev: NodeStatusTone,
  next: NodeStatusTone,
  prevAttention: AttentionLevel,
  nextAttention: AttentionLevel,
): NodeStatusFlashKind | null {
  if (prev === null || next === null) return null;
  if (prev === next) {
    return prevAttention !== nextAttention && nextAttention !== "none" ? "attention" : null;
  }
  if (next === "offline") return "offline";
  return "online";
}

/** 只让卡片自身的状态闪烁 animationend 清类，忽略 content-enter 和子元素动画。 */
export function isNodeStatusFlashAnimationName(name: string): boolean {
  return (
    name === "motion-flash-online" ||
    name === "motion-flash-offline" ||
    name === "motion-flash-attention"
  );
}
