import type { HomeSortField } from "@/utils/homeSort";

// 列表视图的可选列。「节点」列固定在最前，不在这里。

export type ListColumnId =
  | "os"
  | "cpu"
  | "memory"
  | "disk"
  | "load"
  | "live"
  | "traffic"
  | "net"
  | "life"
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
  | "ip"
  | "price"
  | "group";

export interface ListColumn {
  id: ListColumnId;
  label: string;
  /** grid 轨道 minmax(min px, fr)。 */
  min: number;
  fr: number;
  /** 点击表头时使用的排序维度；没有就不可排序。 */
  sort?: HomeSortField;
}

export const LIST_NODE_COLUMN = { label: "节点", min: 196, fr: 2.4, sort: "name" } as const;

export const LIST_COLUMNS: readonly ListColumn[] = [
  { id: "os", label: "系统", min: 116, fr: 1.1, sort: "os" },
  { id: "cpu", label: "CPU", min: 82, fr: 1, sort: "cpu" },
  { id: "memory", label: "内存", min: 82, fr: 1, sort: "memory" },
  { id: "disk", label: "磁盘", min: 82, fr: 1, sort: "disk" },
  { id: "load", label: "负载", min: 72, fr: 0.78, sort: "load" },
  { id: "live", label: "实时", min: 94, fr: 1, sort: "speed" },
  { id: "traffic", label: "流量", min: 110, fr: 1.15, sort: "traffic" },
  // 多任务时要放下「任务名 + 延迟 + 丢包」三段。
  { id: "net", label: "网络", min: 108, fr: 1.1 },
  { id: "life", label: "在线 / 到期", min: 102, fr: 1, sort: "expire" },
  { id: "cpu_name", label: "CPU 型号", min: 150, fr: 1.5, sort: "cpu_name" },
  { id: "cores", label: "核心", min: 56, fr: 0.6, sort: "cores" },
  { id: "arch", label: "架构", min: 72, fr: 0.7, sort: "arch" },
  { id: "virt", label: "虚拟化", min: 80, fr: 0.8, sort: "virt" },
  { id: "kernel", label: "内核", min: 120, fr: 1.2, sort: "kernel" },
  { id: "mem_total", label: "内存容量", min: 84, fr: 0.8, sort: "mem_total" },
  { id: "disk_total", label: "磁盘容量", min: 84, fr: 0.8, sort: "disk_total" },
  { id: "swap", label: "Swap", min: 82, fr: 1, sort: "swap" },
  { id: "process", label: "进程", min: 64, fr: 0.6, sort: "process" },
  { id: "connections", label: "连接 TCP/UDP", min: 96, fr: 0.9, sort: "connections" },
  { id: "ip", label: "IP", min: 64, fr: 0.6 },
  { id: "price", label: "价格", min: 96, fr: 1, sort: "price" },
  { id: "group", label: "分组", min: 90, fr: 0.9, sort: "group" },
];

export const LIST_COLUMN_MAP = new Map(LIST_COLUMNS.map((column) => [column.id, column] as const));

export const DEFAULT_LIST_COLUMNS: readonly ListColumnId[] = [
  "os",
  "cpu",
  "memory",
  "disk",
  "load",
  "live",
  "traffic",
  "net",
  "life",
];

/** 解析列 ID 列表(数组或逗号/换行分隔文本)：去掉未知项与重复项，保持原顺序。 */
export function parseListColumns(value: unknown): ListColumnId[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\s,，;；]+/)
      : [];
  const result: ListColumnId[] = [];
  for (const item of raw) {
    const id = typeof item === "string" ? item.trim() : "";
    if (LIST_COLUMN_MAP.has(id as ListColumnId) && !result.includes(id as ListColumnId)) {
      result.push(id as ListColumnId);
    }
  }
  return result;
}

export function listGridTemplate(columns: readonly { min: number; fr: number }[]): string {
  return columns.map(({ min, fr }) => `minmax(${min}px, ${fr}fr)`).join(" ");
}
