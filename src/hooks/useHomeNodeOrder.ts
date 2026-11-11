import { useEffect, useMemo, useRef, useState } from "react";
import { getNodeMetricsSnapshot, type HomeNodeSummary } from "@/services/wsStore";
import type { NodeInfo } from "@/types/komari";
import {
  HOME_SPEED_ENTER_BPS,
  HOME_SPEED_EXIT_BPS,
  HOME_SPEED_RESORT_INTERVAL_MS,
  HOME_SPEED_SAMPLE_WINDOW,
  THROTTLED_SORT_FIELDS,
  reconcileSpeedOrder,
  sortHomeNodes,
  type HomeSortDirection,
  type HomeSortField,
} from "@/utils/homeSort";

interface Params {
  nodes: HomeNodeSummary[];
  field: HomeSortField;
  direction: HomeSortDirection;
  nameByUuid: Map<string, string>;
  metaByUuid: Map<string, NodeInfo>;
}

const EMPTY_NUMBER_MAP = new Map<string, number>();
const EMPTY_SET = new Set<string>();

export function useHomeNodeOrder({
  nodes,
  field,
  direction,
  nameByUuid,
  metaByUuid,
}: Params): HomeNodeSummary[] {
  const throttled = THROTTLED_SORT_FIELDS.has(field);
  const ringRef = useRef<Map<string, number[]>>(new Map());
  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
    if (field !== "speed") {
      if (ringRef.current.size) ringRef.current.clear();
      return;
    }
    const ring = ringRef.current;
    const seen = new Set<string>();
    for (const node of nodes) {
      seen.add(node.uuid);
      const total = (node.netUp || 0) + (node.netDown || 0);
      const arr = ring.get(node.uuid);
      if (arr) {
        arr.push(total);
        if (arr.length > HOME_SPEED_SAMPLE_WINDOW) arr.shift();
      } else {
        ring.set(node.uuid, [total]);
      }
    }
    for (const uuid of ring.keys()) {
      if (!seen.has(uuid)) ring.delete(uuid);
    }
  }, [nodes, field]);

  const stableOrder = useMemo(() => {
    if (throttled) return null;
    return sortHomeNodes(nodes, field, direction, {
      nameByUuid,
      metaByUuid,
      speedAvgByUuid: EMPTY_NUMBER_MAP,
      speedActive: EMPTY_SET,
    });
  }, [throttled, field, direction, nodes, nameByUuid, metaByUuid]);

  // 抖动维度冻结顺序、每 5s 重排一次；网速另加滑动平均与滞回门。
  const [frozenUuids, setFrozenUuids] = useState<string[]>([]);
  const activeRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!throttled) {
      activeRef.current = new Set();
      return;
    }
    const recompute = () => {
      const current = nodesRef.current;
      const avg = new Map<string, number>();
      const next = new Set<string>();
      if (field === "speed") {
        for (const node of current) {
          const arr = ringRef.current.get(node.uuid);
          avg.set(node.uuid, arr && arr.length ? arr.reduce((sum, v) => sum + v, 0) / arr.length : 0);
        }
        for (const node of current) {
          if (node.online === false) continue;
          const value = avg.get(node.uuid) ?? 0;
          const threshold = activeRef.current.has(node.uuid) ? HOME_SPEED_EXIT_BPS : HOME_SPEED_ENTER_BPS;
          if (value >= threshold) next.add(node.uuid);
        }
        activeRef.current = next;
      }
      const ordered = sortHomeNodes(current, field, direction, {
        nameByUuid,
        metaByUuid,
        metricsOf: getNodeMetricsSnapshot,
        speedAvgByUuid: avg,
        speedActive: next,
      });
      const nextUuids = ordered.map((node) => node.uuid);
      setFrozenUuids((previous) =>
        previous.length === nextUuids.length &&
        previous.every((uuid, index) => uuid === nextUuids[index])
          ? previous
          : nextUuids,
      );
    };
    recompute();
    const id = window.setInterval(recompute, HOME_SPEED_RESORT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [throttled, field, direction, nameByUuid, metaByUuid]);

  const frozenOrder = useMemo(
    () => (throttled ? reconcileSpeedOrder(nodes, frozenUuids) : null),
    [throttled, nodes, frozenUuids],
  );

  return (throttled ? frozenOrder : stableOrder) ?? nodes;
}
