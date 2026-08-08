import type { HomeNodeSummary } from "@/services/wsStore";

export interface HomeResourceOverview {
  onlineNodes: number;
  cpuUsedCores: number;
  cpuTotalCores: number;
  memoryUsed: number;
  memoryTotal: number;
  diskUsed: number;
  diskTotal: number;
  load1: number;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function boundedUsed(used: number, total: number): number {
  const safeTotal = finiteNonNegative(total);
  if (safeTotal <= 0) return 0;
  return Math.min(finiteNonNegative(used), safeTotal);
}

/**
 * 聚合在线节点的实时资源。离线节点保留在节点总览中，但不把陈旧指标混入当前使用量，
 * 分母也只使用同一批在线节点，避免离线容量把整体占用率稀释。
 */
export function aggregateHomeResources(nodes: HomeNodeSummary[]): HomeResourceOverview {
  const overview: HomeResourceOverview = {
    onlineNodes: 0,
    cpuUsedCores: 0,
    cpuTotalCores: 0,
    memoryUsed: 0,
    memoryTotal: 0,
    diskUsed: 0,
    diskTotal: 0,
    load1: 0,
  };

  for (const node of nodes) {
    if (node.online !== true) continue;

    overview.onlineNodes += 1;

    const cores = finiteNonNegative(node.cpuCores);
    const cpuPct = Math.min(100, finiteNonNegative(node.cpuPct));
    overview.cpuTotalCores += cores;
    overview.cpuUsedCores += cores * (cpuPct / 100);

    const memoryTotal = finiteNonNegative(node.ramTotal);
    overview.memoryTotal += memoryTotal;
    overview.memoryUsed += boundedUsed(node.ramUsed, memoryTotal);

    const diskTotal = finiteNonNegative(node.diskTotal);
    overview.diskTotal += diskTotal;
    overview.diskUsed += boundedUsed(node.diskUsed, diskTotal);

    overview.load1 += finiteNonNegative(node.load1);
  }

  return overview;
}
