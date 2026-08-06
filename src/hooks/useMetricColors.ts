import { useEffect, useMemo, useSyncExternalStore } from "react";
import { clearCssColorCache } from "@/components/node/CanvasStrip";
import { usePreferences } from "@/hooks/usePreferences";
import { usePublicConfig } from "@/hooks/usePublicConfig";

// 指标色和暗色深度保存到 theme_settings，并通过 CSS 变量全局应用。
// 官方 managed 表单使用扁平 metricColor* 字符串键 + darkDepth number；
// 旧嵌套 metricColors 对象仅在尚未保存官方表单的存量配置中读取。

export type MetricColorKey =
  | "cpu"
  | "memory"
  | "disk"
  | "load"
  | "swap"
  | "speedIdle"
  | "speedLow"
  | "speedHigh"
  | "speedMax"
  | "trafficUp"
  | "trafficDown";

type MetricColorGroup = "metric" | "speed" | "traffic";

export const METRIC_COLOR_GROUPS: ReadonlyArray<{ id: MetricColorGroup; label: string }> = [
  { id: "metric", label: "卡片配色" },
  { id: "speed", label: "速率热力" },
  { id: "traffic", label: "流量方向" },
];

export const METRIC_COLOR_META: ReadonlyArray<{
  key: MetricColorKey;
  label: string;
  cssVar: string;
  group: MetricColorGroup;
  /** 官方 managed 表单中的扁平 string 键。 */
  flatKey: string;
}> = [
  { key: "cpu", label: "CPU", cssVar: "--progress-cpu", group: "metric", flatKey: "metricColorCpu" },
  {
    key: "memory",
    label: "内存",
    cssVar: "--progress-memory",
    group: "metric",
    flatKey: "metricColorMemory",
  },
  {
    key: "disk",
    label: "磁盘",
    cssVar: "--progress-disk",
    group: "metric",
    flatKey: "metricColorDisk",
  },
  {
    key: "load",
    label: "负载",
    cssVar: "--progress-load",
    group: "metric",
    flatKey: "metricColorLoad",
  },
  {
    key: "swap",
    label: "Swap",
    cssVar: "--progress-swap",
    group: "metric",
    flatKey: "metricColorSwap",
  },
  {
    key: "speedIdle",
    label: "超低速",
    cssVar: "--speed-idle",
    group: "speed",
    flatKey: "metricColorSpeedIdle",
  },
  {
    key: "speedLow",
    label: "低速",
    cssVar: "--speed-low",
    group: "speed",
    flatKey: "metricColorSpeedLow",
  },
  {
    key: "speedHigh",
    label: "高速",
    cssVar: "--speed-high",
    group: "speed",
    flatKey: "metricColorSpeedHigh",
  },
  {
    key: "speedMax",
    label: "急速",
    cssVar: "--speed-max",
    group: "speed",
    flatKey: "metricColorSpeedMax",
  },
  {
    key: "trafficUp",
    label: "上行",
    cssVar: "--traffic-up",
    group: "traffic",
    flatKey: "metricColorTrafficUp",
  },
  {
    key: "trafficDown",
    label: "下行",
    cssVar: "--traffic-down",
    group: "traffic",
    flatKey: "metricColorTrafficDown",
  },
];

type MetricColors = Partial<Record<MetricColorKey, string>>;

const SETTINGS_KEY = "metricColors";
const DARK_DEPTH_SETTINGS_KEY = "darkDepth";
const DARK_DEPTH_CACHE_KEY = "komaritheme:dark-depth";
const HEX = /^#[0-9a-f]{6}$/;
export const DEFAULT_DARK_DEPTH = 100;

interface PaletteDraft {
  colors: MetricColors;
  darkDepth: number;
}

function toInputHex(value: string): string {
  let v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(v)) v = "#" + [...v.slice(1)].map((c) => c + c).join("");
  return HEX.test(v) ? v : "#888888";
}

function hasOwn(settings: Record<string, unknown> | undefined, key: string): boolean {
  return Boolean(settings) && Object.prototype.hasOwnProperty.call(settings, key);
}

function parseHexColor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase();
  return HEX.test(v) ? v : undefined;
}

/**
 * 从后端 theme_settings 解析已保存的指标配色。Komari 会合并 manifest 的空字符串默认值，
 * 所以存量 metricColors 对象存在时必须优先；首次官方全量保存移除旧键后再读取扁平键。
 */
export function readMetricColorsFromSettings(
  settings: Record<string, unknown> | undefined,
): MetricColors {
  const out: MetricColors = {};
  const legacy = settings?.[SETTINGS_KEY];
  if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
    const source = legacy as Record<string, unknown>;
    for (const { key } of METRIC_COLOR_META) {
      const parsed = parseHexColor(source[key]);
      if (parsed) out[key] = parsed;
    }
    return out;
  }

  const hasFlat = METRIC_COLOR_META.some(({ flatKey }) => hasOwn(settings, flatKey));
  if (!hasFlat) return out;
  for (const { key, flatKey } of METRIC_COLOR_META) {
    if (!hasOwn(settings, flatKey)) continue;
    const parsed = parseHexColor(settings?.[flatKey]);
    if (parsed) out[key] = parsed;
  }
  return out;
}

export function normalizeDarkDepth(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_DARK_DEPTH;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

/** 缺省值 100 为近黑(AMOLED)观感、与纯黑画布配套；只接受 0–100 的受限黑色深度。 */
export function readDarkDepthFromSettings(
  settings: Record<string, unknown> | undefined,
): number {
  return normalizeDarkDepth(settings?.[DARK_DEPTH_SETTINGS_KEY]);
}

function readPaletteDraft(settings: Record<string, unknown> | undefined): PaletteDraft {
  return {
    colors: readMetricColorsFromSettings(settings),
    darkDepth: readDarkDepthFromSettings(settings),
  };
}

// ---- 已应用配色：写 CSS 变量 + 维护 version 让 canvas 卡片即时重绘 ----
let version = 0;
let appliedSig = "__init__";
let appliedDarkDepth: number | null = null;
let rafId: number | null = null;
const listeners = new Set<() => void>();

function bumpVersionThrottled() {
  // 合并同一帧的取色事件，避免重复重绘所有卡片。
  if (rafId != null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    version += 1;
    for (const l of listeners) l();
  });
}

/** 把一组配色应用到 <html>（CSS 变量即时覆盖；canvas 经 version 重绘）。相同配色不重复应用。 */
function applyMetricColors(colors: MetricColors) {
  const sig = JSON.stringify(colors ?? {});
  if (sig === appliedSig) return;
  appliedSig = sig;
  const root = document.documentElement;
  for (const { key, cssVar } of METRIC_COLOR_META) {
    const v = colors[key];
    if (v) root.style.setProperty(cssVar, v);
    else root.style.removeProperty(cssVar);
  }
  clearCssColorCache();
  bumpVersionThrottled();
}

/** 只设置强度变量；亮色 token 不引用它，因此调整不会污染浅色模式。 */
function applyDarkDepth(value: number) {
  const depth = normalizeDarkDepth(value);
  if (depth === appliedDarkDepth) return;
  appliedDarkDepth = depth;
  const root = document.documentElement;
  if (depth === DEFAULT_DARK_DEPTH) root.style.removeProperty("--dark-depth");
  else root.style.setProperty("--dark-depth", String(depth));
  clearCssColorCache();
  bumpVersionThrottled();
  try {
    if (depth === DEFAULT_DARK_DEPTH) localStorage.removeItem(DARK_DEPTH_CACHE_KEY);
    else localStorage.setItem(DARK_DEPTH_CACHE_KEY, String(depth));
  } catch {
    // 首帧缓存失败不影响当前预览与后端设置。
  }
}

function applyPalette(palette: PaletteDraft) {
  applyMetricColors(palette.colors);
  applyDarkDepth(palette.darkDepth);
}

/** 供 canvas 卡片（NodeCard）订阅：配色变化时拼进 redrawKey 触发重绘。 */
export function useMetricColorsVersion(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => version,
    () => version,
  );
}

/**
 * canvas 组件的重绘键：外观（明/暗）与自定义配色任一变化，都要重新解析 CSS 变量。
 *
 * 收在这里是因为「什么会让 canvas 失效」是本模块的知识 —— 之前四个卡片各自拼这个字符串，
 * 已经拼歪了一个（迷你卡只带外观，配色改动后残留旧像素）。
 */
export function useCanvasRedrawKey(): string {
  const { resolvedAppearance } = usePreferences();
  const colorsVersion = useMetricColorsVersion();
  return `${resolvedAppearance}:${colorsVersion}`;
}

/** 读取每个指标当前生效的 hex（含默认 token），供取色器显示初值。 */
export function readEffectiveColors(): Record<MetricColorKey, string> {
  const styles = getComputedStyle(document.documentElement);
  const out = {} as Record<MetricColorKey, string>;
  for (const { key, cssVar } of METRIC_COLOR_META) out[key] = toInputHex(styles.getPropertyValue(cssVar));
  return out;
}

/** 全局：把后端保存的配色应用到所有访客（在 AppShell 挂载一次）。 */
export function useMetricColorsSync() {
  const { data: config } = usePublicConfig();
  const palette = useMemo(
    () => (config ? readPaletteDraft(config.theme_settings) : null),
    [config],
  );
  useEffect(() => {
    // 配置返回前保留 index.html 恢复的首帧缓存。
    if (!palette) return;
    applyPalette(palette);
  }, [palette]);
}
