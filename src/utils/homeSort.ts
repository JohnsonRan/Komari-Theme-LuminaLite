import type { NodeInfo, NodeMetrics } from "@/types/komari";
import {
  getNodeMetaSnapshot,
  getNodeMetricsSnapshot,
  type HomeNodeSummary,
} from "@/services/wsStore";
import {
  ALL_NODE_FIELD_IDS,
  extractNodeFieldSortValue,
  getNodeFieldDefinition,
  NODE_FIELD_DEFINITIONS,
  type NodeFieldId,
} from "@/utils/nodeFields";

// 首页与列表全字段排序；默认使用后端 weight，除按「在线状态」本身排序外离线节点始终沉底。

export type HomeSortField = "default" | NodeFieldId;
export type HomeSortDirection = "asc" | "desc";

export const HOME_SORT_FIELDS: readonly HomeSortField[] = Array.from(
  new Set<HomeSortField>(["default", "name", "speed", "traffic", ...ALL_NODE_FIELD_IDS]),
);

const dynamicLabels = Object.fromEntries(
  NODE_FIELD_DEFINITIONS.map((def) => [def.id, def.label]),
) as Record<NodeFieldId, string>;

export const HOME_SORT_FIELD_LABELS: Record<HomeSortField, string> = {
  ...dynamicLabels,
  default: "默认",
  name: "名称",
  speed: "实时网速",
  traffic: "累计流量",
};

const dynamicNaturalDirections = Object.fromEntries(
  NODE_FIELD_DEFINITIONS.map((def) => [def.id, def.naturalSortDirection]),
) as Record<NodeFieldId, HomeSortDirection>;

// 每个维度的自然默认方向:文本升序(A→Z),数值降序(高的在前),延迟/权重升序。
export const HOME_SORT_NATURAL_DIRECTION: Record<HomeSortField, HomeSortDirection> = {
  ...dynamicNaturalDirections,
  default: "asc",
  name: "asc",
  speed: "desc",
  traffic: "desc",
};

export function isHomeSortField(value: unknown): value is HomeSortField {
  return typeof value === "string" && (HOME_SORT_FIELDS as readonly string[]).includes(value);
}

export function isHomeSortDirection(value: unknown): value is HomeSortDirection {
  return value === "asc" || value === "desc";
}

/** 实时总速率和列表「实时」列共用滞回，避免每一帧按瞬时字节重排。 */
export function isHysteresisSpeedField(field: HomeSortField): boolean {
  return field === "speed" || field === "live_speed";
}

export function sortFieldNeedsLiveMetrics(field: HomeSortField): boolean {
  if (field === "default") return false;
  if (field === "speed" || field === "traffic") return true;
  return getNodeFieldDefinition(field).needsLiveMetrics;
}

// 速率排序使用 0.5/0.3 MB/s 进出滞回门，避免节点反复换位。
export const HOME_SPEED_ENTER_BPS = 0.5 * 1024 * 1024;
export const HOME_SPEED_EXIT_BPS = 0.3 * 1024 * 1024;
export const HOME_SPEED_SAMPLE_WINDOW = 3;
export const HOME_SPEED_RESORT_INTERVAL_MS = 5000;

export interface HomeSortContext {
  /** uuid → 展示名(摘要里没有 name,需由 allMeta 注入)。 */
  nameByUuid: Map<string, string>;
  /** uuid → 近 3 样本平均总速率(字节/秒),仅「实时网速」维度用。 */
  speedAvgByUuid: Map<string, number>;
  /** 通过滞回门、当前算「活跃」的节点集合,仅「实时网速」维度用。 */
  speedActive: Set<string>;
  /** 可选注入静态节点元数据 Map（未传时自动读取 wsStore 快照）。 */
  metaByUuid?: ReadonlyMap<string, NodeInfo>;
  /** 可选注入实时指标 Map（未传时自动读取 wsStore 快照）。 */
  metricsByUuid?: ReadonlyMap<string, NodeMetrics>;
  /** 可选固定时间戳（便于测试到期/创建天数计算）。 */
  now?: number;
}

function resolveRawPrimary(
  node: HomeNodeSummary,
  field: HomeSortField,
  ctx: HomeSortContext,
  now: number,
): number | string | null {
  switch (field) {
    case "default":
      return node.weight;
    case "name":
      return ctx.nameByUuid.get(node.uuid) ?? getNodeMetaSnapshot(node.uuid)?.name?.trim() ?? node.uuid;
    case "speed":
    case "live_speed":
      return ctx.speedAvgByUuid.get(node.uuid) ?? (node.netUp || 0) + (node.netDown || 0);
    case "traffic":
      return (node.trafficUp || 0) + (node.trafficDown || 0);
    default: {
      const meta = ctx.metaByUuid?.get(node.uuid) ?? getNodeMetaSnapshot(node.uuid);
      const metrics = ctx.metricsByUuid?.get(node.uuid) ?? getNodeMetricsSnapshot(node.uuid);
      const displayName = ctx.nameByUuid.get(node.uuid) ?? meta?.name?.trim() ?? node.uuid;
      return extractNodeFieldSortValue(field, {
        summary: node,
        meta,
        metrics,
        displayName,
        now,
      });
    }
  }
}

// 0=参与排序，1=无有效排序值，2=离线；后两段按 weight 排列。
function segmentOf(
  node: HomeNodeSummary,
  field: HomeSortField,
  ctx: HomeSortContext,
  rawPrimary: number | string | null,
): 0 | 1 | 2 {
  if (field === "online") return 0;
  if (node.online === false) return 2;
  if (isHysteresisSpeedField(field)) return ctx.speedActive.has(node.uuid) ? 0 : 1;
  if (rawPrimary === null) return 1;
  return 0;
}

/** 三段式稳定排序，实时速率状态由调用方注入。 */
export function sortHomeNodes(
  nodes: HomeNodeSummary[],
  field: HomeSortField,
  direction: HomeSortDirection,
  ctx: HomeSortContext,
): HomeNodeSummary[] {
  const factor = direction === "asc" ? 1 : -1;
  const now = ctx.now ?? Date.now();
  // 预计算比较键，避免 comparator 重复查 Map。
  return nodes
    .map((node) => {
      const rawPrimary = resolveRawPrimary(node, field, ctx, now);
      return {
        node,
        segment: segmentOf(node, field, ctx, rawPrimary),
        primary: rawPrimary ?? 0,
        weight: node.weight,
        uuid: node.uuid,
      };
    })
    .sort((a, b) => {
      if (a.segment !== b.segment) return a.segment - b.segment;

      if (a.segment === 0) {
        const cmp =
          typeof a.primary === "string" || typeof b.primary === "string"
            ? String(a.primary).localeCompare(String(b.primary), "zh-CN", { numeric: true })
            : a.primary - b.primary;
        if (cmp !== 0) return cmp * factor;
      }

      // 兜底键不受方向影响，保持顺序稳定。
      if (a.weight !== b.weight) return a.weight - b.weight;
      return a.uuid.localeCompare(b.uuid);
    })
    .map((entry) => entry.node);
}

/** 恢复冻结顺序，同时让新离线节点立即沉底。 */
export function reconcileSpeedOrder(
  nodes: HomeNodeSummary[],
  frozenUuids: string[],
): HomeNodeSummary[] {
  const byUuid = new Map(nodes.map((node) => [node.uuid, node] as const));
  const online: HomeNodeSummary[] = [];
  const offline: HomeNodeSummary[] = [];
  const used = new Set<string>();
  const place = (node: HomeNodeSummary) => {
    (node.online === false ? offline : online).push(node);
    used.add(node.uuid);
  };
  for (const uuid of frozenUuids) {
    const node = byUuid.get(uuid);
    if (node) place(node);
  }
  for (const node of nodes) {
    if (!used.has(node.uuid)) place(node);
  }
  return [...online, ...offline];
}
