import { createContext, useContext, useMemo, useRef } from "react";
import type { HomeNodeSummary } from "@/services/wsStore";
import type { NodeInfo } from "@/types/komari";
import { getExpireDaysRemaining } from "@/utils/format";
import {
  equalAttention,
  evaluateNodeAttention,
  NO_ATTENTION,
  type AttentionResult,
  type AttentionThresholds,
} from "@/utils/nodeAttention";
import { resolveTrafficUsage } from "@/utils/traffic";

const EMPTY_ATTENTION = new Map<string, AttentionResult>();

/**
 * 首页算好的「需要关注」结果，供卡片直接读取。
 *
 * 判定只在 NodeGrid 求一次：卡片各自再算一遍的话，两处会各持一份滞回状态、而且喂进去的
 * 数据来源不同（汇总里的 pingLoss 取所有已绑定任务的最差值，卡片模型里是主任务的值），
 * 于是可能出现「排到最前但卡片没有标记」。同一个 uuid 只有一个答案。
 */
const AttentionContext = createContext<Map<string, AttentionResult>>(EMPTY_ATTENTION);

export const AttentionProvider = AttentionContext.Provider;

/** 卡片侧读取自己的判定结果；未开启或未命中时返回稳定的 NO_ATTENTION。 */
export function useAttention(uuid: string): AttentionResult {
  return useContext(AttentionContext).get(uuid) ?? NO_ATTENTION;
}

/**
 * 为首页每个节点求一次「是否需要关注」。
 *
 * 上一轮的结果存在 ref 里回喂给判定函数，滞回才有基准 —— 没有它，一个在阈值上下抖动的
 * 指标会让节点每秒在置顶区进出一次。ref 不进依赖数组：它只影响判定的边界，不该触发重算。
 */
export function useNodeAttention(
  nodes: HomeNodeSummary[],
  allMeta: NodeInfo[],
  thresholds: AttentionThresholds,
  enabled: boolean,
  now: number,
): Map<string, AttentionResult> {
  const previousRef = useRef<Map<string, AttentionResult>>(EMPTY_ATTENTION);

  // 节点元信息按小时级变化，而 nodes 每帧都是新引用；分开 memo，避免每帧重建整张索引。
  const metaByUuid = useMemo(
    () => new Map(allMeta.map((meta) => [meta.uuid, meta] as const)),
    [allMeta],
  );

  return useMemo(() => {
    if (!enabled) {
      previousRef.current = EMPTY_ATTENTION;
      return EMPTY_ATTENTION;
    }

    const previous = previousRef.current;
    const next = new Map<string, AttentionResult>();
    let changed = false;

    for (const node of nodes) {
      const meta = metaByUuid.get(node.uuid);
      const traffic = meta
        ? resolveTrafficUsage(
            meta.traffic_limit_type,
            node.trafficUp,
            node.trafficDown,
            meta.traffic_limit,
          )
        : null;

      const prev = previous.get(node.uuid);
      const result = evaluateNodeAttention(
        {
          online: node.online,
          cpuPct: node.cpuPct,
          ramPct: node.ramPct,
          diskPct: node.diskPct,
          loss: node.pingLoss,
          trafficFraction: traffic && !traffic.unlimited ? traffic.fraction : null,
          expireDays: meta ? getExpireDaysRemaining(meta.expired_at, now) : null,
        },
        thresholds,
        prev,
      );

      if (result.level === "none") {
        if (prev) changed = true;
        continue;
      }
      // 值没变就复用旧对象：整张 map 的引用得以保持稳定，卡片才不会每帧因 context 变化重渲染。
      if (prev && equalAttention(prev, result)) next.set(node.uuid, prev);
      else {
        next.set(node.uuid, result);
        changed = true;
      }
    }

    if (!changed && next.size === previous.size) return previous;
    const resolved = next.size > 0 ? next : EMPTY_ATTENTION;
    previousRef.current = resolved;
    return resolved;
  }, [nodes, metaByUuid, thresholds, enabled, now]);
}
