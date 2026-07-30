import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  retainStore,
  getAllNodeMetaSnapshot,
  getHomeNodeStructuresSnapshot,
  getHomeNodeSummariesSnapshot,
  getNodeMetaSnapshot,
  getNodeMetricsSnapshot,
  getNodeTrafficTrendSnapshot,
  getVisibleNodeUuidsSnapshot,
  subscribeHomeNodeStructures,
  subscribeHomeNodeSummaries,
  subscribeAllNodes,
  subscribeStoreStatus,
  subscribeVisibleNodeUuids,
  subscribeToNodeMeta,
  subscribeToNodeMetrics,
  subscribeToNodeTrafficTrend,
  getStoreStatusSnapshot,
  type HomeNodeStructure,
  type HomeNodeSummary,
} from "@/services/wsStore";
import type { NodeInfo, NodeMetrics, TrafficTrendSample } from "@/types/komari";

const noopUnsubscribe = () => undefined;

function useEnsured(enabled = true) {
  useEffect(() => {
    if (enabled) return retainStore();
  }, [enabled]);
}

export function useNodeMeta(uuid: string): NodeInfo | undefined {
  useEnsured();
  return useNodeMetaSnapshot(uuid);
}

function useNodeMetaSnapshot(uuid: string): NodeInfo | undefined {
  const subscribe = useCallback(
    (callback: () => void) => subscribeToNodeMeta(uuid, callback),
    [uuid],
  );
  const getSnapshot = useCallback(() => getNodeMetaSnapshot(uuid), [uuid]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useNodeMetrics(uuid: string, enabled = true): NodeMetrics | undefined {
  useEnsured(enabled);
  return useNodeMetricsSnapshot(uuid, enabled);
}

function useNodeMetricsSnapshot(uuid: string, enabled = true): NodeMetrics | undefined {
  const subscribe = useCallback(
    (callback: () => void) =>
      enabled ? subscribeToNodeMetrics(uuid, callback) : noopUnsubscribe,
    [uuid, enabled],
  );
  const getSnapshot = useCallback(
    () => (enabled ? getNodeMetricsSnapshot(uuid) : undefined),
    [uuid, enabled],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useNodeTrafficTrend(
  uuid: string,
): { up: TrafficTrendSample[]; down: TrafficTrendSample[] } {
  useEnsured();
  return useNodeTrafficTrendSnapshot(uuid);
}

function useNodeTrafficTrendSnapshot(
  uuid: string,
): { up: TrafficTrendSample[]; down: TrafficTrendSample[] } {
  const subscribe = useCallback(
    (callback: () => void) => subscribeToNodeTrafficTrend(uuid, callback),
    [uuid],
  );
  const getSnapshot = useCallback(() => getNodeTrafficTrendSnapshot(uuid), [uuid]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useNodeCardSnapshots(uuid: string) {
  useEnsured();
  return {
    meta: useNodeMetaSnapshot(uuid),
    metrics: useNodeMetricsSnapshot(uuid),
    trafficTrend: useNodeTrafficTrendSnapshot(uuid),
  };
}

export function useVisibleNodeUuids(includeHidden = false): string[] {
  useEnsured();
  const getSnapshot = useCallback(
    () => getVisibleNodeUuidsSnapshot(includeHidden),
    [includeHidden],
  );
  return useSyncExternalStore(
    subscribeVisibleNodeUuids,
    getSnapshot,
    getSnapshot,
  );
}

export function useAllNodeMeta(): NodeInfo[] {
  useEnsured();
  return useSyncExternalStore(
    subscribeAllNodes,
    getAllNodeMetaSnapshot,
    getAllNodeMetaSnapshot,
  );
}

const EMPTY_HOME_SUMMARIES: HomeNodeSummary[] = [];

/** 结构态：分组/地区/权重/在线。网速/CPU 抖动不触发重渲染。 */
export function useHomeNodeStructures(): HomeNodeStructure[] {
  useEnsured();
  return useSyncExternalStore(
    subscribeHomeNodeStructures,
    getHomeNodeStructuresSnapshot,
    getHomeNodeStructuresSnapshot,
  );
}

/**
 * 实时汇总：网速/CPU/流量等每 WS tick 可能变。
 * enabled=false 时不订阅，避免首页父级在仅需结构序时被 live 拖着重渲染。
 */
export function useHomeNodeSummaries(enabled = true): HomeNodeSummary[] {
  useEnsured(enabled);
  const subscribe = useCallback(
    (listener: () => void) =>
      enabled ? subscribeHomeNodeSummaries(listener) : noopUnsubscribe,
    [enabled],
  );
  const getSnapshot = useCallback(
    () => (enabled ? getHomeNodeSummariesSnapshot() : EMPTY_HOME_SUMMARIES),
    [enabled],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

const EMPTY_STORE_STATUS = {
  failureStreak: 0,
  hydrated: false,
  nodeInfoError: false,
} as const;

export function useNodeStoreStatus(enabled = true) {
  useEnsured(enabled);
  const subscribe = useCallback(
    (listener: () => void) => (enabled ? subscribeStoreStatus(listener) : noopUnsubscribe),
    [enabled],
  );
  const getSnapshot = useCallback(
    () => (enabled ? getStoreStatusSnapshot() : EMPTY_STORE_STATUS),
    [enabled],
  );
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  );
}
