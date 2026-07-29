import {
  Grid3x3,
  LayoutGrid,
  List,
  Moon,
  Rows3,
  Sun,
  SunMoon,
} from "lucide-react";
import type { BackgroundPosition, BackgroundSize } from "@/utils/background";
import type { ResolvedThemeSettings } from "@/utils/themeSettings";

export const APPEARANCE_OPTIONS = [
  { value: "light", label: "浅色", icon: Sun },
  { value: "system", label: "跟随系统", icon: SunMoon },
  { value: "dark", label: "深色", icon: Moon },
] as const;

export const NODE_VIEW_MODE_OPTIONS = [
  { value: "large", label: "大卡片", icon: LayoutGrid },
  { value: "compact", label: "小卡片", icon: Rows3 },
  { value: "mini", label: "迷你卡片", icon: Grid3x3 },
  { value: "list", label: "列表", icon: List },
] as const;

export const MOBILE_VIEW_MODE_OPTIONS = NODE_VIEW_MODE_OPTIONS.filter(
  (option) => option.value !== "list",
);

export const BACKGROUND_SIZE_OPTIONS: Array<{ value: BackgroundSize; label: string }> = [
  { value: "cover", label: "填满" },
  { value: "contain", label: "完整" },
  { value: "auto", label: "原始" },
];

export const BACKGROUND_POSITION_OPTIONS: Array<{ value: BackgroundPosition; label: string }> = [
  { value: "top", label: "顶部" },
  { value: "center", label: "居中" },
  { value: "bottom", label: "底部" },
];

// 异常阈值的输入框清单。key 与 AttentionThresholds 同名，新增一项只需在这里加一行。
export const ATTENTION_THRESHOLD_FIELDS = [
  { key: "cpuPct", label: "CPU 使用率 ≥", unit: "%", max: 100 },
  { key: "memoryPct", label: "内存使用率 ≥", unit: "%", max: 100 },
  { key: "diskPct", label: "磁盘使用率 ≥", unit: "%", max: 100 },
  { key: "lossPct", label: "丢包率 ≥", unit: "%", max: 100 },
  { key: "trafficRemainPct", label: "剩余流量 ≤", unit: "%", max: 100 },
  { key: "expireDays", label: "距到期 ≤", unit: "天", max: 365 },
] as const satisfies ReadonlyArray<{
  key: keyof ResolvedThemeSettings["attentionThresholds"];
  label: string;
  unit: string;
  max: number;
}>;

// 吸顶分区导航:点击 chip 滚动到对应 InstancePanel(锚点 id = `theme-section-${id}`)。
// 编号与下方各分区的 kicker 序号一一对应,新增分区时两处同步维护。
export const THEME_SECTIONS = [
  { id: "appearance", num: "01", label: "外观" },
  { id: "view", num: "02", label: "视图" },
  { id: "background", num: "03", label: "背景" },
  { id: "colors", num: "04", label: "配色" },
  { id: "home", num: "05", label: "首页" },
  { id: "hidden", num: "06", label: "隐藏" },
  { id: "card", num: "07", label: "卡片" },
  { id: "ping", num: "08", label: "延迟" },
  { id: "detail", num: "09", label: "详情页" },
] as const;
