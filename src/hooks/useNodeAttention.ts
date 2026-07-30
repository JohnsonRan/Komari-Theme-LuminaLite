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

/** 输入签名：字段没变就跳过 evaluate，避免每 tick 对全表重算。 */
function attentionInputSignature(
  online: boolean | null,
  cpuPct: number,
  ramPct: number,
  diskPct: number,
  loss: number | null,
  trafficFraction: number | null,
  expireDays: number | null,
): string {
  return [
    online === true ? "1" : online === false ? "0" : "n",
    cpuPct.toFixed(2),
    ramPct.toFixed(2),
    diskPct.toFixed(2),
    loss == null ? "" : loss.toFixed(2),
    trafficFraction == null ? "" : trafficFraction.toFixed(4),
    expireDays == null ? "" : String(expireDays),
  ].join("|");
}

/**
 * 为首页每个节点求一次「是否需要关注」。
 *
 * 上一轮的结果存在 ref 里回喂给判定函数，滞回才有基准 —— 没有它，一个在阈值上下抖动的
 * 指标会让节点每秒在置顶区进出一次。ref 不进依赖数组：它只影响判定的边界，不该触发重算。
 *
 * 增量：输入签名未变的节点直接复用上轮结果，不跑 evaluate / traffic 配额。
 */
export function useNodeAttention(
  nodes: HomeNodeSummary[],
  allMeta: NodeInfo[],
  thresholds: AttentionThresholds,
  enabled: boolean,
  now: number,
): Map<string, AttentionResult> {
  const previousRef = useRef<Map<string, AttentionResult>>(EMPTY_ATTENTION);
  const signatureRef = useRef<Map<string, string>>(new Map());
  const thresholdsRef = useRef(thresholds);
  const nowBucketRef = useRef(now);

  // 节点元信息按小时级变化，而 nodes 每帧都是新引用；分开 memo，避免每帧重建整张索引。
  const metaByUuid = useMemo(
    () => new Map(allMeta.map((meta) => [meta.uuid, meta] as const)),
    [allMeta],
  );

  return useMemo(() => {
    if (!enabled) {
      previousRef.current = EMPTY_ATTENTION;
      signatureRef.current = new Map();
      return EMPTY_ATTENTION;
    }

    // 阈值或时钟桶变了：签名全部失效，必须重算（到期天数按小时变）。
    if (thresholdsRef.current !== thresholds || nowBucketRef.current !== now) {
      thresholdsRef.current = thresholds;
      nowBucketRef.current = now;
      signatureRef.current = new Map();
    }

    const previous = previousRef.current;
    const signatures = signatureRef.current;
    const next = new Map<string, AttentionResult>();
    const nextSignatures = new Map<string, string>();
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
      const trafficFraction = traffic && !traffic.unlimited ? traffic.fraction : null;
      const expireDays = meta ? getExpireDaysRemaining(meta.expired_at, now) : null;
      const sig = attentionInputSignature(
        node.online,
        node.cpuPct,
        node.ramPct,
        node.diskPct,
        node.pingLoss,
        trafficFraction,
        expireDays,
      );
      nextSignatures.set(node.uuid, sig);

      const prev = previous.get(node.uuid);
      if (signatures.get(node.uuid) === sig && prev) {
        // 输入未变 → 结果未变（含滞回状态），整段跳过。
        next.set(node.uuid, prev);
        continue;
      }
      if (signatures.get(node.uuid) === sig && !prev) {
        // 上轮无关注且输入未变：仍无关注。
        continue;
      }

      const result = evaluateNodeAttention(
        {
          online: node.online,
          cpuPct: node.cpuPct,
          ramPct: node.ramPct,
          diskPct: node.diskPct,
          loss: node.pingLoss,
          trafficFraction,
          expireDays,
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

    // 节点离开列表也算变化。
    if (!changed) {
      for (const uuid of previous.keys()) {
        if (!nextSignatures.has(uuid)) {
          changed = true;
          break;
        }
      }
    }

    signatureRef.current = nextSignatures;

    if (!changed && next.size === previous.size) {
      // 确认每个 uuid 都还在且引用一致。
      let same = true;
      for (const [uuid, value] of next) {
        if (previous.get(uuid) !== value) {
          same = false;
          break;
        }
      }
      if (same) return previous;
    }

    const resolved = next.size > 0 ? next : EMPTY_ATTENTION;
    previousRef.current = resolved;
    return resolved;
  }, [nodes, metaByUuid, thresholds, enabled, now]);
}
