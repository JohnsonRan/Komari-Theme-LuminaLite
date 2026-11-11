import type { HomeNodeSummary } from "@/services/wsStore";
import type { NodeInfo, NodeMetrics } from "@/types/komari";
import { formatRenewalPrice } from "@/utils/billing";
import { resolveExpireTimestamp } from "@/utils/format";

// 首页临时排序；默认使用后端 weight，离线节点始终沉底。

export type HomeSortField =
  | "default"
  | "name"
  | "speed"
  | "traffic"
  // 以下维度主要由列表表头触发。
  | "os"
  | "cpu"
  | "memory"
  | "disk"
  | "load"
  | "expire"
  | "cpu_name"
  | "cores"
  | "arch"
  | "virt"
  | "kernel"
  | "mem_total"
  | "disk_total"
  | "swap"
  | "process"
  | "connections"
  | "price"
  | "group";
export type HomeSortDirection = "asc" | "desc";

export const HOME_SORT_FIELD_LABELS: Record<HomeSortField, string> = {
  default: "默认",
  name: "名称",
  speed: "实时网速",
  traffic: "累计流量",
  os: "系统",
  cpu: "CPU",
  memory: "内存",
  disk: "磁盘",
  load: "负载",
  expire: "到期时间",
  cpu_name: "CPU 型号",
  cores: "核心数",
  arch: "架构",
  virt: "虚拟化",
  kernel: "内核",
  mem_total: "内存容量",
  disk_total: "磁盘容量",
  swap: "Swap",
  process: "进程数",
  connections: "连接数",
  price: "价格",
  group: "分组",
};

/** 排序下拉只列常用维度；其余由列表表头选择，选中后再临时补进下拉。 */
export const HOME_SORT_MENU_FIELDS: readonly HomeSortField[] = [
  "default",
  "name",
  "speed",
  "traffic",
];

const ASC_SORT_FIELDS = new Set<HomeSortField>([
  "default",
  "name",
  "os",
  "expire",
  "cpu_name",
  "arch",
  "virt",
  "kernel",
  "price",
  "group",
]);

// 每个维度的自然默认方向:文本升序(A→Z),数值降序(高的在前);到期和价格从小到大更常用。
export function naturalSortDirection(field: HomeSortField): HomeSortDirection {
  return ASC_SORT_FIELDS.has(field) ? "asc" : "desc";
}

/** 依赖首页实时摘要(HomeNodeSummary 的 live 字段)的维度。 */
export const LIVE_SORT_FIELDS = new Set<HomeSortField>([
  "speed",
  "traffic",
  "cpu",
  "memory",
  "disk",
  "load",
  "connections",
]);

/** 每帧都抖动的维度改为每 5s 重排一次，避免行每 2s 跳位；swap/进程不在摘要里，也靠这个刷新。 */
export const THROTTLED_SORT_FIELDS = new Set<HomeSortField>([
  "speed",
  "cpu",
  "memory",
  "load",
  "connections",
  "swap",
  "process",
]);

export function isHomeSortField(value: unknown): value is HomeSortField {
  return (
    typeof value === "string" && Object.prototype.hasOwnProperty.call(HOME_SORT_FIELD_LABELS, value)
  );
}

export function isHomeSortDirection(value: unknown): value is HomeSortDirection {
  return value === "asc" || value === "desc";
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
  /** uuid → 节点静态信息,系统/型号/容量/价格/到期等维度用。 */
  metaByUuid: Map<string, NodeInfo>;
  /** 读取完整实时指标(swap/进程不在摘要里);由调用方注入，保持这里是纯函数。 */
  metricsOf?: (uuid: string) => NodeMetrics | undefined;
}

const positive = (value: number | null | undefined) =>
  value != null && Number.isFinite(value) && value > 0 ? value : null;
const text = (value: string | null | undefined) => value?.trim() || null;

// null 表示该节点没有这项数据(未上报/未填写)，归入「无有效排序值」段，不当成 0 参与比较。
function primaryValue(
  node: HomeNodeSummary,
  field: HomeSortField,
  ctx: HomeSortContext,
): number | string | null {
  const meta = ctx.metaByUuid.get(node.uuid);
  switch (field) {
    case "name":
      return ctx.nameByUuid.get(node.uuid) ?? node.uuid;
    case "speed":
      return ctx.speedActive.has(node.uuid) ? (ctx.speedAvgByUuid.get(node.uuid) ?? 0) : null;
    case "traffic":
      return (node.trafficUp || 0) + (node.trafficDown || 0);
    case "cpu":
      return node.cpuPct;
    case "memory":
      return node.ramPct;
    case "disk":
      return node.diskPct;
    case "load":
      return node.load1;
    case "connections":
      return (node.connectionsTcp || 0) + (node.connectionsUdp || 0);
    case "swap": {
      const metrics = ctx.metricsOf?.(node.uuid);
      return metrics && metrics.swapTotal > 0 ? metrics.swapUsed / metrics.swapTotal : null;
    }
    case "process":
      return positive(ctx.metricsOf?.(node.uuid)?.process);
    case "os":
      return text(meta?.os);
    case "expire":
      return resolveExpireTimestamp(meta?.expired_at);
    case "cpu_name":
      return text(meta?.cpu_name);
    case "cores":
      return positive(meta?.cpu_cores);
    case "arch":
      return text(meta?.arch);
    case "virt":
      return text(meta?.virtualization);
    case "kernel":
      return text(meta?.kernel_version);
    case "mem_total":
      return positive(meta?.mem_total);
    case "disk_total":
      return positive(meta?.disk_total);
    case "price":
      if (!meta) return null;
      return positive(meta.price) ?? (formatRenewalPrice(meta) === "免费" ? 0 : null);
    case "group":
      return text(meta?.group);
    case "default":
    default:
      return node.weight;
  }
}

/** 三段式稳定排序，实时速率状态由调用方注入。 */
export function sortHomeNodes(
  nodes: HomeNodeSummary[],
  field: HomeSortField,
  direction: HomeSortDirection,
  ctx: HomeSortContext,
): HomeNodeSummary[] {
  const factor = direction === "asc" ? 1 : -1;
  // 预计算比较键，避免 comparator 重复查 Map。
  return nodes
    .map((node) => {
      const primary = primaryValue(node, field, ctx);
      // 0=参与排序，1=无有效排序值，2=离线；后两段按 weight 排列。
      const segment: 0 | 1 | 2 = node.online === false ? 2 : primary === null ? 1 : 0;
      return { node, segment, primary: primary ?? 0, weight: node.weight, uuid: node.uuid };
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
