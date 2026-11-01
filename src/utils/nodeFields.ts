import type { NodeInfo, NodeMetrics } from "@/types/komari";
import type { HomeNodeSummary } from "@/services/wsStore";
import { resolveOsInfo } from "@/components/ui/OsLogo";
import { formatBillingCycle } from "@/utils/billing";
import { getExpireDaysRemaining, parseTags } from "@/utils/format";
import { getDisplayRegionCode } from "@/utils/geo";
import { getReportedGpuLabel } from "@/utils/gpu";
import { resolveTrafficUsage, trafficTypeLabel } from "@/utils/traffic";

export type NodeFieldCategory =
  | "default"
  | "identity"
  | "hardware"
  | "resource"
  | "network"
  | "billing";

export type NodeFieldFilterType = "text" | "enum" | "number" | "boolean";

export type NodeFieldId =
  // 核心默认列（保留原有列表视图 10 列）
  | "node"
  | "os"
  | "cpu"
  | "memory"
  | "disk"
  | "load"
  | "live_speed"
  | "traffic"
  | "network"
  | "life"
  // 基础与身份字段 (NodeInfo)
  | "online"
  | "name"
  | "group"
  | "region"
  | "tags"
  | "public_remark"
  | "ipv4"
  | "ipv6"
  | "ip_stack"
  | "weight"
  | "hidden"
  | "uuid"
  // 硬件与系统规格 (NodeInfo)
  | "cpu_name"
  | "cpu_cores"
  | "arch"
  | "virtualization"
  | "kernel_version"
  | "gpu_name"
  | "mem_total"
  | "swap_total"
  | "disk_total"
  // 实时资源与系统指标 (NodeMetrics)
  | "ram_used"
  | "swap"
  | "swap_used"
  | "disk_used"
  | "load5"
  | "load15"
  | "load_all"
  | "process"
  | "connections"
  | "connections_tcp"
  | "connections_udp"
  | "gpu_pct"
  | "gpu_mem"
  | "gpu_temp"
  // 网络、流量与延迟细分字段 (NodeMetrics & Ping)
  | "net_up"
  | "net_down"
  | "speed"
  | "traffic_up"
  | "traffic_down"
  | "traffic_total"
  | "traffic_limit"
  | "traffic_used_pct"
  | "traffic_limit_type"
  | "ping_latency"
  | "ping_avg"
  | "ping_loss"
  // 计费、周期与时间字段 (NodeInfo & NodeMetrics)
  | "uptime"
  | "expired_at"
  | "price"
  | "billing_cycle"
  | "currency"
  | "auto_renewal"
  | "created_at"
  | "updated_at";

export interface NodeFieldDefinition {
  id: NodeFieldId;
  label: string;
  shortLabel: string;
  category: NodeFieldCategory;
  minWidth: number;
  fr: number;
  align: "left" | "center" | "right";
  filterType: NodeFieldFilterType;
  unit?: string;
  naturalSortDirection: "asc" | "desc";
  needsLiveMetrics: boolean;
  description: string;
}

export const NODE_FIELD_CATEGORY_LABELS: Record<NodeFieldCategory, string> = {
  default: "默认核心列",
  identity: "基础与身份",
  hardware: "硬件与系统规格",
  resource: "实时资源与进程",
  network: "网络、流量与延迟",
  billing: "计费与生命周期",
};

export const NODE_FIELD_CATEGORIES: readonly NodeFieldCategory[] = [
  "default",
  "identity",
  "hardware",
  "resource",
  "network",
  "billing",
];

export const NODE_FIELD_DEFINITIONS: readonly NodeFieldDefinition[] = [
  // ── 默认核心列 ───────────────────────────────────────────────────────────────
  {
    id: "node",
    label: "节点",
    shortLabel: "节点",
    category: "default",
    minWidth: 196,
    fr: 2.4,
    align: "left",
    filterType: "text",
    naturalSortDirection: "asc",
    needsLiveMetrics: false,
    description: "国旗、节点名称、续费价格与标签胶囊",
  },
  {
    id: "os",
    label: "系统",
    shortLabel: "系统",
    category: "default",
    minWidth: 116,
    fr: 1.1,
    align: "left",
    filterType: "enum",
    naturalSortDirection: "asc",
    needsLiveMetrics: false,
    description: "操作系统图标与发行版名称",
  },
  {
    id: "cpu",
    label: "CPU 使用率",
    shortLabel: "CPU",
    category: "default",
    minWidth: 82,
    fr: 1,
    align: "center",
    filterType: "number",
    unit: "%",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "实时 CPU 占用百分比与进度条",
  },
  {
    id: "memory",
    label: "内存使用率",
    shortLabel: "内存",
    category: "default",
    minWidth: 82,
    fr: 1,
    align: "center",
    filterType: "number",
    unit: "%",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "实时物理内存占用百分比与进度条",
  },
  {
    id: "disk",
    label: "磁盘使用率",
    shortLabel: "磁盘",
    category: "default",
    minWidth: 82,
    fr: 1,
    align: "center",
    filterType: "number",
    unit: "%",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "实时磁盘空间占用百分比与进度条",
  },
  {
    id: "load",
    label: "1m 负载",
    shortLabel: "负载",
    category: "default",
    minWidth: 72,
    fr: 0.78,
    align: "center",
    filterType: "number",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "1 分钟系统平均负载（相对核心数进度条）",
  },
  {
    id: "live_speed",
    label: "实时速率 (↑/↓)",
    shortLabel: "实时",
    category: "default",
    minWidth: 94,
    fr: 1,
    align: "center",
    filterType: "number",
    unit: "MB/s",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "实时上行与下行网速双行堆叠",
  },
  {
    id: "traffic",
    label: "流量与配额",
    shortLabel: "流量",
    category: "default",
    minWidth: 110,
    fr: 1.15,
    align: "center",
    filterType: "number",
    unit: "GB",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "累计上下行流量及月度配额使用百分比",
  },
  {
    id: "network",
    label: "网络延迟图",
    shortLabel: "网络",
    category: "default",
    minWidth: 280,
    fr: 1.7,
    align: "center",
    filterType: "number",
    unit: "ms",
    naturalSortDirection: "asc",
    needsLiveMetrics: true,
    description: "最多三条延迟横排在一行，当前任务的历史柱贴在下方",
  },
  {
    id: "life",
    label: "在线 / 到期",
    shortLabel: "在线 / 到期",
    category: "default",
    minWidth: 102,
    fr: 1,
    align: "center",
    filterType: "number",
    unit: "天",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "上行是在线时长，下行是到期剩余。排序和筛选只按在线天数，到期请用「到期时间」列",
  },

  // ── 基础与身份字段 (NodeInfo) ────────────────────────────────────────────────
  {
    id: "online",
    label: "在线状态",
    shortLabel: "状态",
    category: "identity",
    minWidth: 74,
    fr: 0.75,
    align: "center",
    filterType: "boolean",
    naturalSortDirection: "desc",
    needsLiveMetrics: false,
    description: "节点当前是否在线",
  },
  {
    id: "name",
    label: "节点名称",
    shortLabel: "名称",
    category: "identity",
    minWidth: 140,
    fr: 1.4,
    align: "left",
    filterType: "text",
    naturalSortDirection: "asc",
    needsLiveMetrics: false,
    description: "纯节点名称文本",
  },
  {
    id: "group",
    label: "分组",
    shortLabel: "分组",
    category: "identity",
    minWidth: 88,
    fr: 0.9,
    align: "center",
    filterType: "enum",
    naturalSortDirection: "asc",
    needsLiveMetrics: false,
    description: "后端配置的节点分组名称",
  },
  {
    id: "region",
    label: "地区 / 国家",
    shortLabel: "地区",
    category: "identity",
    minWidth: 78,
    fr: 0.8,
    align: "center",
    filterType: "enum",
    naturalSortDirection: "asc",
    needsLiveMetrics: false,
    description: "节点所在国家或地区国旗与代码",
  },
  {
    id: "tags",
    label: "标签",
    shortLabel: "标签",
    category: "identity",
    minWidth: 120,
    fr: 1.2,
    align: "left",
    filterType: "enum",
    naturalSortDirection: "asc",
    needsLiveMetrics: false,
    description: "节点关联的自定义标签",
  },
  {
    id: "public_remark",
    label: "公开备注",
    shortLabel: "备注",
    category: "identity",
    minWidth: 130,
    fr: 1.3,
    align: "left",
    filterType: "text",
    naturalSortDirection: "asc",
    needsLiveMetrics: false,
    description: "管理员填写的公开备注说明",
  },
  {
    id: "ipv4",
    label: "IPv4",
    shortLabel: "IPv4",
    category: "identity",
    minWidth: 112,
    fr: 1.1,
    align: "center",
    filterType: "text",
    naturalSortDirection: "asc",
    needsLiveMetrics: false,
    description: "节点 IPv4 地址或接入状态",
  },
  {
    id: "ipv6",
    label: "IPv6",
    shortLabel: "IPv6",
    category: "identity",
    minWidth: 120,
    fr: 1.15,
    align: "center",
    filterType: "text",
    naturalSortDirection: "asc",
    needsLiveMetrics: false,
    description: "节点 IPv6 地址或接入状态",
  },
  {
    id: "ip_stack",
    label: "IP 协议栈",
    shortLabel: "IP 栈",
    category: "identity",
    minWidth: 84,
    fr: 0.85,
    align: "center",
    filterType: "enum",
    naturalSortDirection: "asc",
    needsLiveMetrics: false,
    description: "IPv4 / IPv6 双栈支持标识",
  },
  {
    id: "weight",
    label: "排序权重",
    shortLabel: "权重",
    category: "identity",
    minWidth: 68,
    fr: 0.7,
    align: "center",
    filterType: "number",
    naturalSortDirection: "asc",
    needsLiveMetrics: false,
    description: "后端节点配置的排序权重值",
  },
  {
    id: "hidden",
    label: "隐藏标记",
    shortLabel: "隐藏",
    category: "identity",
    minWidth: 72,
    fr: 0.72,
    align: "center",
    filterType: "boolean",
    naturalSortDirection: "desc",
    needsLiveMetrics: false,
    description: "节点是否被标记为仅管理员可见",
  },
  {
    id: "uuid",
    label: "UUID",
    shortLabel: "UUID",
    category: "identity",
    minWidth: 116,
    fr: 1.1,
    align: "left",
    filterType: "text",
    naturalSortDirection: "asc",
    needsLiveMetrics: false,
    description: "节点唯一标识符 UUID",
  },

  // ── 硬件与系统规格 (NodeInfo) ────────────────────────────────────────────────
  {
    id: "cpu_name",
    label: "CPU 型号",
    shortLabel: "CPU 型号",
    category: "hardware",
    minWidth: 152,
    fr: 1.5,
    align: "left",
    filterType: "text",
    naturalSortDirection: "asc",
    needsLiveMetrics: false,
    description: "处理器完整型号名称",
  },
  {
    id: "cpu_cores",
    label: "CPU 核心数",
    shortLabel: "核心数",
    category: "hardware",
    minWidth: 78,
    fr: 0.8,
    align: "center",
    filterType: "number",
    unit: "核",
    naturalSortDirection: "desc",
    needsLiveMetrics: false,
    description: "逻辑 CPU 核心数量",
  },
  {
    id: "arch",
    label: "系统架构",
    shortLabel: "架构",
    category: "hardware",
    minWidth: 84,
    fr: 0.85,
    align: "center",
    filterType: "enum",
    naturalSortDirection: "asc",
    needsLiveMetrics: false,
    description: "CPU 指令集架构（如 x86_64、arm64）",
  },
  {
    id: "virtualization",
    label: "虚拟化类型",
    shortLabel: "虚拟化",
    category: "hardware",
    minWidth: 84,
    fr: 0.85,
    align: "center",
    filterType: "enum",
    naturalSortDirection: "asc",
    needsLiveMetrics: false,
    description: "虚拟化技术类型（如 KVM、LXC、Dedicated）",
  },
  {
    id: "kernel_version",
    label: "内核版本",
    shortLabel: "内核",
    category: "hardware",
    minWidth: 110,
    fr: 1.1,
    align: "center",
    filterType: "text",
    naturalSortDirection: "asc",
    needsLiveMetrics: false,
    description: "操作系统内核版本号",
  },
  {
    id: "gpu_name",
    label: "GPU 型号",
    shortLabel: "GPU 型号",
    category: "hardware",
    minWidth: 136,
    fr: 1.3,
    align: "left",
    filterType: "text",
    naturalSortDirection: "asc",
    needsLiveMetrics: false,
    description: "系统识别或探针上报的显卡型号",
  },
  {
    id: "mem_total",
    label: "总内存容量",
    shortLabel: "总内存",
    category: "hardware",
    minWidth: 86,
    fr: 0.88,
    align: "center",
    filterType: "number",
    unit: "GB",
    naturalSortDirection: "desc",
    needsLiveMetrics: false,
    description: "物理内存总大小",
  },
  {
    id: "swap_total",
    label: "总 Swap 容量",
    shortLabel: "总 Swap",
    category: "hardware",
    minWidth: 86,
    fr: 0.88,
    align: "center",
    filterType: "number",
    unit: "GB",
    naturalSortDirection: "desc",
    needsLiveMetrics: false,
    description: "Swap 交换分区总大小",
  },
  {
    id: "disk_total",
    label: "总磁盘容量",
    shortLabel: "总磁盘",
    category: "hardware",
    minWidth: 86,
    fr: 0.88,
    align: "center",
    filterType: "number",
    unit: "GB",
    naturalSortDirection: "desc",
    needsLiveMetrics: false,
    description: "磁盘总容量大小",
  },

  // ── 实时资源与进程指标 (NodeMetrics) ─────────────────────────────────────────
  {
    id: "ram_used",
    label: "已用内存",
    shortLabel: "内存用量",
    category: "resource",
    minWidth: 102,
    fr: 1,
    align: "center",
    filterType: "number",
    unit: "GB",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "实时已用内存与总内存容量",
  },
  {
    id: "swap",
    label: "Swap 使用率",
    shortLabel: "Swap",
    category: "resource",
    minWidth: 84,
    fr: 0.9,
    align: "center",
    filterType: "number",
    unit: "%",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "Swap 交换分区占用百分比与进度条",
  },
  {
    id: "swap_used",
    label: "已用 Swap",
    shortLabel: "Swap 用量",
    category: "resource",
    minWidth: 102,
    fr: 1,
    align: "center",
    filterType: "number",
    unit: "GB",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "实时已用 Swap 与总容量",
  },
  {
    id: "disk_used",
    label: "已用磁盘",
    shortLabel: "磁盘用量",
    category: "resource",
    minWidth: 102,
    fr: 1,
    align: "center",
    filterType: "number",
    unit: "GB",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "实时已用磁盘与总磁盘容量",
  },
  {
    id: "load5",
    label: "5m 负载",
    shortLabel: "5m 负载",
    category: "resource",
    minWidth: 76,
    fr: 0.8,
    align: "center",
    filterType: "number",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "5 分钟系统平均负载",
  },
  {
    id: "load15",
    label: "15m 负载",
    shortLabel: "15m 负载",
    category: "resource",
    minWidth: 76,
    fr: 0.8,
    align: "center",
    filterType: "number",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "15 分钟系统平均负载",
  },
  {
    id: "load_all",
    label: "负载 (1/5/15m)",
    shortLabel: "完整负载",
    category: "resource",
    minWidth: 116,
    fr: 1.15,
    align: "center",
    filterType: "number",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "1 / 5 / 15 分钟负载；排序和筛选取三者中的最大值",
  },
  {
    id: "process",
    label: "进程数",
    shortLabel: "进程",
    category: "resource",
    minWidth: 74,
    fr: 0.78,
    align: "center",
    filterType: "number",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "当前运行进程总数",
  },
  {
    id: "connections",
    label: "连接数 (TCP/UDP)",
    shortLabel: "连接数",
    category: "resource",
    minWidth: 92,
    fr: 0.95,
    align: "center",
    filterType: "number",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "实时 TCP 与 UDP 连接数堆叠",
  },
  {
    id: "connections_tcp",
    label: "TCP 连接数",
    shortLabel: "TCP",
    category: "resource",
    minWidth: 78,
    fr: 0.82,
    align: "center",
    filterType: "number",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "实时活跃 TCP 连接数量",
  },
  {
    id: "connections_udp",
    label: "UDP 连接数",
    shortLabel: "UDP",
    category: "resource",
    minWidth: 78,
    fr: 0.82,
    align: "center",
    filterType: "number",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "实时活跃 UDP 连接数量",
  },
  {
    id: "gpu_pct",
    label: "GPU 使用率",
    shortLabel: "GPU %",
    category: "resource",
    minWidth: 84,
    fr: 0.88,
    align: "center",
    filterType: "number",
    unit: "%",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "显卡实时核心使用率百分比",
  },
  {
    id: "gpu_mem",
    label: "GPU 显存",
    shortLabel: "显存",
    category: "resource",
    minWidth: 104,
    fr: 1.05,
    align: "center",
    filterType: "number",
    unit: "GB",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "显卡实时显存已用与总量",
  },
  {
    id: "gpu_temp",
    label: "GPU 温度",
    shortLabel: "GPU 温度",
    category: "resource",
    minWidth: 82,
    fr: 0.85,
    align: "center",
    filterType: "number",
    unit: "°C",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "显卡实时核心温度 (°C)",
  },

  // ── 网络、流量与延迟细分字段 ────────────────────────────────────────────────
  {
    id: "net_up",
    label: "实时上行速率",
    shortLabel: "实时上行",
    category: "network",
    minWidth: 88,
    fr: 0.9,
    align: "center",
    filterType: "number",
    unit: "MB/s",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "当前实时出站速率",
  },
  {
    id: "net_down",
    label: "实时下行速率",
    shortLabel: "实时下行",
    category: "network",
    minWidth: 88,
    fr: 0.9,
    align: "center",
    filterType: "number",
    unit: "MB/s",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "当前实时入站速率",
  },
  {
    id: "speed",
    label: "实时总带宽",
    shortLabel: "总网速",
    category: "network",
    minWidth: 92,
    fr: 0.95,
    align: "center",
    filterType: "number",
    unit: "MB/s",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "实时上行 + 下行合并总带宽",
  },
  {
    id: "traffic_up",
    label: "累计上行流量",
    shortLabel: "累计上行",
    category: "network",
    minWidth: 92,
    fr: 0.95,
    align: "center",
    filterType: "number",
    unit: "GB",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "累计出站总流量",
  },
  {
    id: "traffic_down",
    label: "累计下行流量",
    shortLabel: "累计下行",
    category: "network",
    minWidth: 92,
    fr: 0.95,
    align: "center",
    filterType: "number",
    unit: "GB",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "累计入站总流量",
  },
  {
    id: "traffic_total",
    label: "累计总流量",
    shortLabel: "总流量",
    category: "network",
    minWidth: 96,
    fr: 1,
    align: "center",
    filterType: "number",
    unit: "GB",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "累计上行 + 下行总流量之和",
  },
  {
    id: "traffic_limit",
    label: "流量配额上限",
    shortLabel: "流量限额",
    category: "network",
    minWidth: 92,
    fr: 0.95,
    align: "center",
    filterType: "number",
    unit: "GB",
    naturalSortDirection: "desc",
    needsLiveMetrics: false,
    description: "周期流量配额上限（0 表示不限量）",
  },
  {
    id: "traffic_used_pct",
    label: "流量已用占比",
    shortLabel: "配额占比",
    category: "network",
    minWidth: 94,
    fr: 0.95,
    align: "center",
    filterType: "number",
    unit: "%",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "按计费口径折算的流量配额已用百分比",
  },
  {
    id: "traffic_limit_type",
    label: "流量计费方式",
    shortLabel: "计费口径",
    category: "network",
    minWidth: 92,
    fr: 0.9,
    align: "center",
    filterType: "enum",
    naturalSortDirection: "asc",
    needsLiveMetrics: false,
    description: "流量配额计算口径（上下取大/双向求和/仅上行/仅下行/上下取小）",
  },
  {
    id: "ping_latency",
    label: "当前延迟",
    shortLabel: "延迟",
    category: "network",
    minWidth: 82,
    fr: 0.85,
    align: "center",
    filterType: "number",
    unit: "ms",
    naturalSortDirection: "asc",
    needsLiveMetrics: true,
    description: "绑定的主 Ping 任务最新延迟 (ms)",
  },
  {
    id: "ping_avg",
    label: "平均延迟 (1h)",
    shortLabel: "平均延迟",
    category: "network",
    minWidth: 86,
    fr: 0.88,
    align: "center",
    filterType: "number",
    unit: "ms",
    naturalSortDirection: "asc",
    needsLiveMetrics: true,
    description: "近 1 小时平均 Ping 延迟 (ms)",
  },
  {
    id: "ping_loss",
    label: "Ping 丢包率",
    shortLabel: "丢包率",
    category: "network",
    minWidth: 80,
    fr: 0.82,
    align: "center",
    filterType: "number",
    unit: "%",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "绑定的 Ping 任务最高丢包率 (%)",
  },

  // ── 计费、周期与时间字段 ────────────────────────────────────────────────────
  {
    id: "uptime",
    label: "在线时长",
    shortLabel: "在线时长",
    category: "billing",
    minWidth: 86,
    fr: 0.88,
    align: "center",
    filterType: "number",
    unit: "天",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "节点持续在线运行时间",
  },
  {
    id: "expired_at",
    label: "到期时间",
    shortLabel: "到期",
    category: "billing",
    minWidth: 96,
    fr: 0.98,
    align: "center",
    filterType: "number",
    unit: "天",
    naturalSortDirection: "asc",
    needsLiveMetrics: false,
    description: "距离账单到期剩余天数与到期日",
  },
  {
    id: "price",
    label: "续费价格",
    shortLabel: "价格",
    category: "billing",
    minWidth: 92,
    fr: 0.95,
    align: "center",
    filterType: "number",
    naturalSortDirection: "desc",
    needsLiveMetrics: false,
    description: "账单续费金额与周期",
  },
  {
    id: "billing_cycle",
    label: "计费周期",
    shortLabel: "周期",
    category: "billing",
    minWidth: 80,
    fr: 0.82,
    align: "center",
    filterType: "enum",
    naturalSortDirection: "asc",
    needsLiveMetrics: false,
    description: "账单计费周期（月/季/半年/年/永久）",
  },
  {
    id: "currency",
    label: "计费币种",
    shortLabel: "币种",
    category: "billing",
    minWidth: 72,
    fr: 0.75,
    align: "center",
    filterType: "enum",
    naturalSortDirection: "asc",
    needsLiveMetrics: false,
    description: "账单结算货币代码或符号",
  },
  {
    id: "auto_renewal",
    label: "自动续费",
    shortLabel: "自动续费",
    category: "billing",
    minWidth: 80,
    fr: 0.8,
    align: "center",
    filterType: "boolean",
    naturalSortDirection: "desc",
    needsLiveMetrics: false,
    description: "是否开启到期自动续费",
  },
  {
    id: "created_at",
    label: "创建时间",
    shortLabel: "创建于",
    category: "billing",
    minWidth: 96,
    fr: 0.95,
    align: "center",
    filterType: "text",
    naturalSortDirection: "desc",
    needsLiveMetrics: false,
    description: "节点添加到面板的日期",
  },
  {
    id: "updated_at",
    label: "最后上报",
    shortLabel: "最后上报",
    category: "billing",
    minWidth: 92,
    fr: 0.9,
    align: "center",
    filterType: "number",
    unit: "秒前",
    naturalSortDirection: "desc",
    needsLiveMetrics: true,
    description: "筛选按距最近一次实时上报的秒数，越小越新；表头降序把最近上报排在前面",
  },
] as const;

export const NODE_FIELD_MAP: ReadonlyMap<NodeFieldId, NodeFieldDefinition> = new Map(
  NODE_FIELD_DEFINITIONS.map((field) => [field.id, field]),
);

export const ALL_NODE_FIELD_IDS: readonly NodeFieldId[] = NODE_FIELD_DEFINITIONS.map(
  (field) => field.id,
);

export const DEFAULT_LIST_COLUMNS: readonly NodeFieldId[] = [
  "node",
  "os",
  "cpu",
  "memory",
  "disk",
  "load",
  "live_speed",
  "traffic",
  "network",
  "life",
];

export type ColumnPresetKey =
  | "default"
  | "compact"
  | "hardware"
  | "network"
  | "billing"
  | "all";

export type ListColumnPresetId = ColumnPresetKey;

export interface ListColumnPreset {
  id: ListColumnPresetId;
  label: string;
  description: string;
  columns: readonly NodeFieldId[];
}

export const COLUMN_PRESETS: Record<
  ColumnPresetKey,
  { label: string; description: string; columns: readonly NodeFieldId[] }
> = {
  default: {
    label: "默认视图",
    description: "经典的 10 列综合监控视图",
    columns: DEFAULT_LIST_COLUMNS,
  },
  compact: {
    label: "精简视图",
    description: "仅保留核心负载与实时网速",
    columns: ["node", "os", "cpu", "memory", "live_speed", "life"],
  },
  hardware: {
    label: "硬件与系统",
    description: "展示 CPU 型号、核心、架构、虚拟化、内核、容量与显卡",
    columns: [
      "node",
      "os",
      "arch",
      "virtualization",
      "kernel_version",
      "cpu_name",
      "cpu_cores",
      "mem_total",
      "swap_total",
      "disk_total",
      "gpu_name",
    ],
  },
  network: {
    label: "网络与连接",
    description: "展示 IP 栈、实时上下行、累计流量、配额、延迟、丢包与 TCP/UDP 连接",
    columns: [
      "node",
      "region",
      "ip_stack",
      "live_speed",
      "traffic",
      "traffic_limit",
      "traffic_limit_type",
      "network",
      "ping_latency",
      "ping_loss",
      "connections",
      "process",
    ],
  },
  billing: {
    label: "资产与计费",
    description: "展示分组、地区、续费价格、周期、币种、自动续费、到期与备注",
    columns: [
      "node",
      "group",
      "region",
      "price",
      "billing_cycle",
      "currency",
      "auto_renewal",
      "expired_at",
      "uptime",
      "public_remark",
    ],
  },
  all: {
    label: "全部字段",
    description: "开启所有收集到的节点与实时监控字段（支持横向滚动）",
    columns: ALL_NODE_FIELD_IDS,
  },
};

export const LIST_COLUMN_PRESETS: readonly ListColumnPreset[] = (
  Object.entries(COLUMN_PRESETS) as [
    ListColumnPresetId,
    (typeof COLUMN_PRESETS)[ListColumnPresetId],
  ][]
).map(([id, preset]) => ({
  id,
  label: preset.label,
  description: preset.description,
  columns: preset.columns,
}));

export function isNodeFieldId(value: unknown): value is NodeFieldId {
  return typeof value === "string" && NODE_FIELD_MAP.has(value as NodeFieldId);
}

export function getNodeFieldDefinition(id: NodeFieldId): NodeFieldDefinition {
  return NODE_FIELD_MAP.get(id) ?? NODE_FIELD_DEFINITIONS[0];
}

export function normalizeListColumns(
  raw: unknown,
  fallback: readonly NodeFieldId[] = DEFAULT_LIST_COLUMNS,
): NodeFieldId[] {
  let candidates: unknown[] = [];
  if (Array.isArray(raw)) {
    candidates = raw;
  } else if (typeof raw === "string" && raw.trim().length > 0) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) candidates = parsed;
      } catch {
        candidates = trimmed.split(/[\s,，;；\n]+/);
      }
    } else {
      candidates = trimmed.split(/[\s,，;；\n]+/);
    }
  }

  const seen = new Set<NodeFieldId>();
  const result: NodeFieldId[] = [];
  for (const item of candidates) {
    const key = typeof item === "string" ? item.trim() : "";
    if (isNodeFieldId(key) && !seen.has(key)) {
      seen.add(key);
      result.push(key);
    }
  }

  return result.length > 0 ? result : [...fallback];
}

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;

export function resolveIpStackLabel(ipv4?: string | null, ipv6?: string | null): string {
  const hasV4 = Boolean(ipv4 && String(ipv4).trim());
  const hasV6 = Boolean(ipv6 && String(ipv6).trim());
  if (hasV4 && hasV6) return "IPv4 / IPv6";
  if (hasV4) return "仅 IPv4";
  if (hasV6) return "仅 IPv6";
  return "";
}

/** 与列表「系统」列相同的短标签。没有原始系统字符串时不猜 Linux。 */
function osDisplayLabel(raw: string | null | undefined): string {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return "";
  const name = resolveOsInfo(trimmed).name;
  const match = trimmed.match(/\d+(?:\.\d+)?/);
  return match ? `${name} ${match[0]}` : name;
}

function hasReportedGpu(meta: NodeInfo | undefined, metrics: NodeMetrics | undefined): boolean {
  if (getReportedGpuLabel(metrics?.gpu)) return true;
  if ((meta?.gpu_name ?? "").trim()) return true;
  if ((metrics?.gpuMemTotal ?? 0) > 0) return true;
  if ((metrics?.gpuPct ?? 0) > 0) return true;
  return false;
}

function positiveOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function bytesToDisplay(bytes: number | null | undefined, unit: number): number | null {
  const positive = positiveOrNull(bytes);
  return positive == null ? null : positive / unit;
}

function maxLoad(summary: HomeNodeSummary, metrics: NodeMetrics | undefined): number {
  const load1 = metrics?.load1 ?? summary.load1 ?? 0;
  const load5 = metrics?.load5 ?? 0;
  const load15 = metrics?.load15 ?? 0;
  return Math.max(load1, load5, load15);
}

function resolvePrimaryPingStat(
  metrics: NodeMetrics | undefined,
): { latest: number | null; avg: number | null; loss: number | null } {
  if (!metrics?.pingStats) return { latest: null, avg: null, loss: null };
  let firstLatest: number | null = null;
  let firstAvg: number | null = null;
  let worstLoss: number | null = null;
  for (const key in metrics.pingStats) {
    const stat = metrics.pingStats[key];
    if (!stat) continue;
    if (firstLatest == null && stat.latest != null && Number.isFinite(stat.latest)) {
      firstLatest = stat.latest;
    }
    if (firstAvg == null && stat.avg != null && Number.isFinite(stat.avg)) {
      firstAvg = stat.avg;
    }
    if (stat.loss != null && Number.isFinite(stat.loss)) {
      if (worstLoss == null || stat.loss > worstLoss) worstLoss = stat.loss;
    }
  }
  return { latest: firstLatest, avg: firstAvg, loss: worstLoss };
}

function parseTimestampMs(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? (raw > 1e12 ? raw : raw * 1000) : null;
  }
  const str = String(raw).trim();
  if (!str) return null;
  const num = Number(str);
  if (Number.isFinite(num) && num > 0) {
    return num > 1e12 ? num : num * 1000;
  }
  const parsed = Date.parse(str);
  return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
}

export interface NodeFieldValueContext {
  summary: HomeNodeSummary;
  meta?: NodeInfo;
  metrics?: NodeMetrics;
  displayName?: string;
  now?: number;
}

/**
 * 提取任意收集字段的排序键值（number | string | null）。
 * 返回 null 表示该节点没有该字段的有效样本（排序时置于有效值之后）。
 */
export function extractNodeFieldSortValue(
  field: NodeFieldId,
  ctx: NodeFieldValueContext,
): number | string | null {
  const { summary, meta, metrics, displayName, now = Date.now() } = ctx;
  const name = displayName ?? (meta?.name?.trim() || summary.uuid);

  switch (field) {
    case "node":
    case "name":
      return name;
    case "uuid":
      return summary.uuid;
    case "online":
      return summary.online === true ? 1 : summary.online === false ? 0 : -1;
    case "os":
      return osDisplayLabel(meta?.os) || null;
    case "group":
      return (meta?.group ?? summary.group ?? "").trim();
    case "region":
      return getDisplayRegionCode(meta?.region ?? summary.region) || null;
    case "tags":
      return (meta?.tags ?? "").trim();
    case "public_remark":
      return (meta?.public_remark ?? "").trim();
    case "ipv4":
      return (meta?.ipv4 ?? "").trim();
    case "ipv6":
      return (meta?.ipv6 ?? "").trim();
    case "ip_stack":
      return resolveIpStackLabel(meta?.ipv4, meta?.ipv6) || null;
    case "weight":
      return meta?.weight ?? summary.weight ?? 0;
    case "hidden":
      return (meta?.hidden ?? summary.hidden) ? 1 : 0;
    case "cpu_name":
      return (meta?.cpu_name ?? "").trim();
    case "cpu_cores":
      return positiveOrNull(meta?.cpu_cores ?? summary.cpuCores);
    case "arch":
      return (meta?.arch ?? "").trim();
    case "virtualization":
      return (meta?.virtualization ?? "").trim();
    case "kernel_version":
      return (meta?.kernel_version ?? "").trim();
    case "gpu_name":
      return (getReportedGpuLabel(metrics?.gpu) ?? meta?.gpu_name ?? "").trim();
    case "mem_total":
      return positiveOrNull(meta?.mem_total ?? metrics?.ramTotal ?? summary.ramTotal);
    case "swap_total":
      return positiveOrNull(meta?.swap_total ?? metrics?.swapTotal);
    case "disk_total":
      return positiveOrNull(meta?.disk_total ?? metrics?.diskTotal ?? summary.diskTotal);
    case "cpu":
      return metrics?.cpuPct ?? summary.cpuPct ?? 0;
    case "memory":
      return metrics?.ramPct ?? summary.ramPct ?? 0;
    case "ram_used":
      return metrics?.ramUsed ?? summary.ramUsed ?? 0;
    case "swap": {
      const used = metrics?.swapUsed ?? 0;
      const total = metrics?.swapTotal ?? meta?.swap_total ?? 0;
      return total > 0 ? (used / total) * 100 : null;
    }
    case "swap_used": {
      const total = metrics?.swapTotal ?? meta?.swap_total ?? 0;
      return total > 0 ? (metrics?.swapUsed ?? 0) : null;
    }
    case "disk":
      return metrics?.diskPct ?? summary.diskPct ?? 0;
    case "disk_used":
      return metrics?.diskUsed ?? summary.diskUsed ?? 0;
    case "load":
      return metrics?.load1 ?? summary.load1 ?? 0;
    case "load5":
      return metrics?.load5 ?? 0;
    case "load15":
      return metrics?.load15 ?? 0;
    case "load_all":
      return maxLoad(summary, metrics);
    case "process":
      return metrics?.process ?? 0;
    case "connections":
      return (
        (metrics?.connectionsTcp ?? summary.connectionsTcp ?? 0) +
        (metrics?.connectionsUdp ?? summary.connectionsUdp ?? 0)
      );
    case "connections_tcp":
      return metrics?.connectionsTcp ?? summary.connectionsTcp ?? 0;
    case "connections_udp":
      return metrics?.connectionsUdp ?? summary.connectionsUdp ?? 0;
    case "gpu_pct":
      return hasReportedGpu(meta, metrics) ? (metrics?.gpuPct ?? 0) : null;
    case "gpu_mem":
      return positiveOrNull(metrics?.gpuMemTotal) != null ? (metrics?.gpuMemUsed ?? 0) : null;
    case "gpu_temp":
      return hasReportedGpu(meta, metrics) ? positiveOrNull(metrics?.gpuTemp) : null;
    case "live_speed":
    case "speed":
      return (metrics?.netUp ?? summary.netUp ?? 0) + (metrics?.netDown ?? summary.netDown ?? 0);
    case "net_up":
      return metrics?.netUp ?? summary.netUp ?? 0;
    case "net_down":
      return metrics?.netDown ?? summary.netDown ?? 0;
    case "traffic":
    case "traffic_total":
      return (
        (metrics?.trafficUp ?? summary.trafficUp ?? 0) +
        (metrics?.trafficDown ?? summary.trafficDown ?? 0)
      );
    case "traffic_up":
      return metrics?.trafficUp ?? summary.trafficUp ?? 0;
    case "traffic_down":
      return metrics?.trafficDown ?? summary.trafficDown ?? 0;
    case "traffic_limit":
      return positiveOrNull(meta?.traffic_limit);
    case "traffic_used_pct": {
      const usage = resolveTrafficUsage(
        meta?.traffic_limit_type,
        metrics?.trafficUp ?? summary.trafficUp ?? 0,
        metrics?.trafficDown ?? summary.trafficDown ?? 0,
        meta?.traffic_limit ?? 0,
      );
      return usage.unlimited ? null : usage.fraction * 100;
    }
    case "traffic_limit_type":
      return trafficTypeLabel(meta?.traffic_limit_type);
    case "network":
    case "ping_latency": {
      const { latest } = resolvePrimaryPingStat(metrics);
      return latest;
    }
    case "ping_avg": {
      const { avg } = resolvePrimaryPingStat(metrics);
      return avg;
    }
    case "ping_loss": {
      const { loss } = resolvePrimaryPingStat(metrics);
      return loss ?? summary.pingLoss;
    }
    case "life":
    case "uptime":
      return metrics?.uptime ?? 0;
    case "expired_at":
      return getExpireDaysRemaining(meta?.expired_at, now);
    case "price":
      return meta?.price != null && meta.price >= 0 ? meta.price : 0;
    case "billing_cycle":
      return meta?.billing_cycle ? formatBillingCycle(meta.billing_cycle) : "";
    case "currency":
      return (meta?.currency ?? "").trim();
    case "auto_renewal":
      return meta?.auto_renewal ? 1 : 0;
    case "created_at":
      return parseTimestampMs(meta?.created_at);
    case "updated_at":
      return metrics?.updatedAt && metrics.updatedAt > 0
        ? metrics.updatedAt
        : parseTimestampMs(meta?.updated_at);
  }
}

/**
 * 提取用于条件筛选的标准化值：
 * - 数值字段统一换算到字段声明的单位（如 GB、MB/s、%、天、ms、核），方便用户直接输入自然数值筛选；
 * - 枚举/文本字段返回字符串或字符串数组（如 tags）；
 * - 布尔字段返回 boolean。
 */
export function extractNodeFieldFilterValue(
  field: NodeFieldId,
  ctx: NodeFieldValueContext,
): number | string | string[] | boolean | null {
  const { summary, meta, metrics, displayName, now = Date.now() } = ctx;
  const name = displayName ?? (meta?.name?.trim() || summary.uuid);

  switch (field) {
    case "online":
      if (summary.online === true) return true;
      if (summary.online === false) return false;
      return null;
    case "hidden":
      return Boolean(meta?.hidden ?? summary.hidden);
    case "auto_renewal":
      return Boolean(meta?.auto_renewal);

    case "node":
      return [
        name,
        summary.uuid,
        meta?.group ?? summary.group,
        meta?.region ?? summary.region,
        meta?.public_remark ?? "",
        meta?.tags ?? "",
      ]
        .filter(Boolean)
        .join(" ");
    case "name":
      return name;
    case "uuid":
      return summary.uuid;
    case "os":
      return osDisplayLabel(meta?.os);
    case "group":
      return (meta?.group ?? summary.group ?? "").trim() || "未分组";
    case "region":
      return getDisplayRegionCode(meta?.region ?? summary.region) || "";
    case "tags": {
      const parsed = parseTags(meta?.tags).map((t) => t.label);
      return parsed.length > 0 ? parsed : [];
    }
    case "public_remark":
      return (meta?.public_remark ?? "").trim();
    case "ipv4":
      return (meta?.ipv4 ?? "").trim();
    case "ipv6":
      return (meta?.ipv6 ?? "").trim();
    case "ip_stack":
      return resolveIpStackLabel(meta?.ipv4, meta?.ipv6);
    case "cpu_name":
      return (meta?.cpu_name ?? "").trim();
    case "arch":
      return (meta?.arch ?? "").trim();
    case "virtualization":
      return (meta?.virtualization ?? "").trim();
    case "kernel_version":
      return (meta?.kernel_version ?? "").trim();
    case "gpu_name":
      return (getReportedGpuLabel(metrics?.gpu) ?? meta?.gpu_name ?? "").trim();
    case "traffic_limit_type":
      return trafficTypeLabel(meta?.traffic_limit_type);
    case "billing_cycle":
      return meta?.billing_cycle ? formatBillingCycle(meta.billing_cycle) : "";
    case "currency":
      return (meta?.currency ?? "").trim();
    case "created_at":
      return (meta?.created_at ?? "").trim();

    // 数值类字段（换算到声明的人类可读单位）
    case "weight":
      return meta?.weight ?? summary.weight ?? 0;
    case "cpu_cores":
      return positiveOrNull(meta?.cpu_cores ?? summary.cpuCores);
    case "mem_total":
      return bytesToDisplay(meta?.mem_total ?? metrics?.ramTotal ?? summary.ramTotal, GIB);
    case "swap_total":
      return bytesToDisplay(meta?.swap_total ?? metrics?.swapTotal, GIB);
    case "disk_total":
      return bytesToDisplay(meta?.disk_total ?? metrics?.diskTotal ?? summary.diskTotal, GIB);
    case "cpu":
      return metrics?.cpuPct ?? summary.cpuPct ?? 0;
    case "memory":
      return metrics?.ramPct ?? summary.ramPct ?? 0;
    case "ram_used":
      return (metrics?.ramUsed ?? summary.ramUsed ?? 0) / GIB;
    case "swap": {
      const used = metrics?.swapUsed ?? 0;
      const total = metrics?.swapTotal ?? meta?.swap_total ?? 0;
      return total > 0 ? (used / total) * 100 : null;
    }
    case "swap_used": {
      const total = metrics?.swapTotal ?? meta?.swap_total ?? 0;
      return total > 0 ? (metrics?.swapUsed ?? 0) / GIB : null;
    }
    case "disk":
      return metrics?.diskPct ?? summary.diskPct ?? 0;
    case "disk_used":
      return (metrics?.diskUsed ?? summary.diskUsed ?? 0) / GIB;
    case "load":
      return metrics?.load1 ?? summary.load1 ?? 0;
    case "load_all":
      return maxLoad(summary, metrics);
    case "load5":
      return metrics?.load5 ?? 0;
    case "load15":
      return metrics?.load15 ?? 0;
    case "process":
      return metrics?.process ?? 0;
    case "connections":
      return (
        (metrics?.connectionsTcp ?? summary.connectionsTcp ?? 0) +
        (metrics?.connectionsUdp ?? summary.connectionsUdp ?? 0)
      );
    case "connections_tcp":
      return metrics?.connectionsTcp ?? summary.connectionsTcp ?? 0;
    case "connections_udp":
      return metrics?.connectionsUdp ?? summary.connectionsUdp ?? 0;
    case "gpu_pct":
      return hasReportedGpu(meta, metrics) ? (metrics?.gpuPct ?? 0) : null;
    case "gpu_mem":
      return positiveOrNull(metrics?.gpuMemTotal) != null ? (metrics?.gpuMemUsed ?? 0) / GIB : null;
    case "gpu_temp":
      return hasReportedGpu(meta, metrics) ? positiveOrNull(metrics?.gpuTemp) : null;
    case "live_speed":
    case "speed":
      return (
        ((metrics?.netUp ?? summary.netUp ?? 0) + (metrics?.netDown ?? summary.netDown ?? 0)) / MIB
      );
    case "net_up":
      return (metrics?.netUp ?? summary.netUp ?? 0) / MIB;
    case "net_down":
      return (metrics?.netDown ?? summary.netDown ?? 0) / MIB;
    case "traffic":
    case "traffic_total":
      return (
        ((metrics?.trafficUp ?? summary.trafficUp ?? 0) +
          (metrics?.trafficDown ?? summary.trafficDown ?? 0)) /
        GIB
      );
    case "traffic_up":
      return (metrics?.trafficUp ?? summary.trafficUp ?? 0) / GIB;
    case "traffic_down":
      return (metrics?.trafficDown ?? summary.trafficDown ?? 0) / GIB;
    case "traffic_limit":
      return bytesToDisplay(meta?.traffic_limit, GIB);
    case "traffic_used_pct": {
      const usage = resolveTrafficUsage(
        meta?.traffic_limit_type,
        metrics?.trafficUp ?? summary.trafficUp ?? 0,
        metrics?.trafficDown ?? summary.trafficDown ?? 0,
        meta?.traffic_limit ?? 0,
      );
      return usage.unlimited ? null : usage.fraction * 100;
    }
    case "network":
    case "ping_latency":
      return resolvePrimaryPingStat(metrics).latest;
    case "ping_avg":
      return resolvePrimaryPingStat(metrics).avg;
    case "ping_loss":
      return resolvePrimaryPingStat(metrics).loss ?? summary.pingLoss;
    case "life":
    case "uptime":
      return (metrics?.uptime ?? 0) / 86_400;
    case "expired_at":
      return getExpireDaysRemaining(meta?.expired_at, now);
    case "price":
      return meta?.price != null && meta.price >= 0 ? meta.price : 0;
    case "updated_at": {
      const ts = metrics?.updatedAt && metrics.updatedAt > 0 ? metrics.updatedAt : null;
      return ts != null ? Math.max(0, (now - ts) / 1000) : null;
    }
  }
}

/**
 * 构建节点的全字段检索串，用于关键词搜索。
 */
export function buildNodeSearchIndex(ctx: NodeFieldValueContext): string {
  const { summary, meta, metrics, displayName } = ctx;
  const osResolved = meta?.os ? resolveOsInfo(meta.os).name : "";
  const gpuLabel = getReportedGpuLabel(metrics?.gpu) ?? meta?.gpu_name ?? "";
  const ipStack = resolveIpStackLabel(meta?.ipv4, meta?.ipv6);
  const cycle = meta?.billing_cycle ? formatBillingCycle(meta.billing_cycle) : "";
  const trafficType = trafficTypeLabel(meta?.traffic_limit_type);

  return [
    displayName,
    meta?.name,
    summary.uuid,
    meta?.group ?? summary.group,
    meta?.region ?? summary.region,
    getDisplayRegionCode(meta?.region ?? summary.region),
    meta?.os,
    osResolved,
    meta?.kernel_version,
    meta?.arch,
    meta?.virtualization,
    meta?.cpu_name,
    meta?.cpu_cores ? `${meta.cpu_cores}核 ${meta.cpu_cores}c` : "",
    gpuLabel,
    meta?.tags,
    meta?.public_remark,
    meta?.ipv4,
    meta?.ipv6,
    ipStack,
    meta?.currency,
    cycle,
    trafficType,
    summary.online === true ? "在线 online" : summary.online === false ? "离线 offline" : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
