import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import UplotReact from "uplot-react";
import type uPlot from "uplot";
import { ArrowDown, ArrowUp, CircuitBoard, Cpu, Gauge, HardDrive, MemoryStick, Network, RefreshCw, Thermometer, Workflow } from "lucide-react";
import { clsx } from "clsx";
import { useLoadRecords } from "@/hooks/useRecords";
import { useNodeMeta, useNodeMetrics } from "@/hooks/useNode";
import { useRecentStatus } from "@/hooks/useRecentStatus";
import { InstancePanel, InstanceChartLoading } from "./InstancePanel";
import {
  buildChartTooltipHooks,
  CHART_PALETTE,
  createTimeAxisFormatter,
  formatChartCoverageTime,
  getAxisColors,
  toChartSeconds,
  useChartInteractions,
  useResponsiveChartSize,
  type ChartTooltipState,
} from "./chartShared";
import { ChartTooltip, SwitchToggle } from "./ChartParts";
import {
  fillMissingMetricPoints,
  interpolateMetricGaps,
} from "./chartData";
import { formatByteRateLabel, formatBytes, formatTrafficRateLabel } from "@/utils/format";
import { historyChartRangeSeconds, historyCoverageLabel } from "@/utils/historyRange";
import { usePreferences } from "@/hooks/usePreferences";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import type { DetailNetworkUnit } from "@/utils/themeSettings";
import type { LoadRecord, NodeMetrics } from "@/types/komari";

const LOAD_HISTORY_SAMPLE_LIMIT = 360;
const LOAD_HISTORY_RENDER_LIMIT = 720;
const REALTIME_HISTORY_SEED_LIMIT = 120;
const REALTIME_SAMPLE_LIMIT = 600;

const CPU_KEYS = ["cpu"];
const CPU_COLORS = [CHART_PALETTE.cpu];
const MEMORY_KEYS = ["ram", "swap"];
const MEMORY_COLORS = [CHART_PALETTE.memory, CHART_PALETTE.warning];
const MEMORY_BYTES_KEYS = ["ramBytes", "swapBytes"];
const DISK_KEYS = ["disk"];
const DISK_COLORS = [CHART_PALETTE.disk];
const DISK_BYTES_KEYS = ["diskBytes"];
const NETWORK_KEYS = ["netIn", "netOut"];
const NETWORK_COLORS = [CHART_PALETTE.success, CHART_PALETTE.cpu];
const CONNECTION_KEYS = ["connections", "udp"];
const CONNECTION_COLORS = [CHART_PALETTE.memory, CHART_PALETTE.cpu];
const PROCESS_KEYS = ["process"];
const PROCESS_COLORS = [CHART_PALETTE.warning];
// GPU 使用率(%)、显存(% 或字节)、温度(°C) 各有独立量纲，拆成三张图各自用自己的坐标轴。
// 模块级常量，避免每次渲染创建新数组引用导致 chart options 变化、图表被整体重建。
const GPU_USAGE_KEYS = ["gpu"];
const GPU_USAGE_COLORS = ["#e05d7b"];
const GPU_MEM_KEYS = ["gpuMem"];
const GPU_BYTES_KEYS = ["gpuMemBytes"];
const GPU_MEM_COLORS = ["#c77dff"];
const GPU_TEMP_KEYS = ["gpuTemp"];
const GPU_TEMP_COLORS = ["#f4a261"];
const SERIES_LABELS: Record<string, string> = {
  cpu: "CPU",
  ram: "内存",
  swap: "Swap",
  disk: "磁盘",
  ramBytes: "内存",
  swapBytes: "Swap",
  diskBytes: "磁盘",
  netIn: "下行",
  netOut: "上行",
  connections: "TCP",
  udp: "UDP",
  process: "进程",
  gpu: "GPU",
  gpuMem: "显存",
  gpuMemBytes: "显存",
  gpuTemp: "温度",
};
const LOAD_INTERPOLATE_KEYS = [
  "cpu",
  "ram",
  "swap",
  "disk",
  "ramBytes",
  "swapBytes",
  "diskBytes",
  "netIn",
  "netOut",
  "connections",
  "udp",
  "process",
  "gpu",
  "gpuMem",
  "gpuMemBytes",
  "gpuTemp",
];

interface ChartPoint {
  time: number;
  [key: string]: number | null;
}

// times 由调用方统一算好：同一批 points 会喂给多张图，逐图重算时间轴是纯浪费。
function metricData(times: number[], points: ChartPoint[], keys: string[]): uPlot.AlignedData {
  return [times, ...keys.map((key) => points.map((point) => point[key] ?? null))] as uPlot.AlignedData;
}

function getHistoryRenderLimit(hours: number) {
  if (hours <= 4) return LOAD_HISTORY_SAMPLE_LIMIT;
  return LOAD_HISTORY_RENDER_LIMIT;
}

function downsamplePoints(points: ChartPoint[], limit: number) {
  if (points.length <= limit || limit < 2) return points;

  const result: ChartPoint[] = [];
  const lastIndex = points.length - 1;
  const step = lastIndex / (limit - 1);
  let previousIndex = -1;

  for (let index = 0; index < limit; index += 1) {
    const sourceIndex = Math.min(lastIndex, Math.round(index * step));
    if (sourceIndex === previousIndex) continue;
    result.push(points[sourceIndex]);
    previousIndex = sourceIndex;
  }

  return result;
}

function getSeriesLabel(key: string) {
  return SERIES_LABELS[key] ?? key;
}

function pointFromNode(node: NodeMetrics): ChartPoint {
  return {
    time: node.updatedAt > 0 ? node.updatedAt / 1000 : Date.now() / 1000,
    cpu: node.cpuPct,
    ram: node.ramTotal > 0 ? (node.ramUsed / node.ramTotal) * 100 : 0,
    swap: node.swapTotal > 0 ? (node.swapUsed / node.swapTotal) * 100 : 0,
    disk: node.diskTotal > 0 ? (node.diskUsed / node.diskTotal) * 100 : 0,
    ramBytes: node.ramUsed,
    swapBytes: node.swapUsed,
    diskBytes: node.diskUsed,
    netIn: node.netDown,
    netOut: node.netUp,
    connections: node.connectionsTcp,
    udp: node.connectionsUdp,
    process: node.process,
    gpu: node.gpuPct,
    gpuMem: node.gpuMemTotal > 0 ? (node.gpuMemUsed / node.gpuMemTotal) * 100 : 0,
    gpuMemBytes: node.gpuMemUsed,
    gpuTemp: node.gpuTemp,
  };
}

// 历史记录与近期缓冲字段名一致（后者类型更宽松），按结构取二者共有的字段。
type ChartSourceRecord = Pick<
  LoadRecord,
  | "cpu"
  | "ram"
  | "ram_total"
  | "swap"
  | "swap_total"
  | "disk"
  | "disk_total"
  | "net_in"
  | "net_out"
  | "connections"
  | "connections_udp"
  | "process"
  | "gpu"
  | "gpu_memory_used"
  | "gpu_memory_total"
  | "gpu_temperature"
>;

// 记录自带 total 为 0（新版后端不再存储 *_total 序列）时回退到节点注册时的静态总量。
function pointFromRecord(
  record: ChartSourceRecord,
  time: number,
  fallbackRamTotal: number,
  fallbackSwapTotal: number,
  fallbackDiskTotal: number,
): ChartPoint {
  const ramTotal = record.ram_total > 0 ? record.ram_total : fallbackRamTotal;
  const swapTotal = record.swap_total > 0 ? record.swap_total : fallbackSwapTotal;
  const diskTotal = record.disk_total > 0 ? record.disk_total : fallbackDiskTotal;
  return {
    time,
    cpu: record.cpu,
    ram: ramTotal > 0 ? (record.ram / ramTotal) * 100 : 0,
    swap: swapTotal > 0 ? (record.swap / swapTotal) * 100 : 0,
    disk: diskTotal > 0 ? (record.disk / diskTotal) * 100 : 0,
    ramBytes: record.ram,
    swapBytes: record.swap,
    diskBytes: record.disk,
    netIn: record.net_in,
    netOut: record.net_out,
    connections: record.connections,
    udp: record.connections_udp,
    process: record.process,
    gpu: record.gpu,
    gpuMem: record.gpu_memory_total > 0 ? (record.gpu_memory_used / record.gpu_memory_total) * 100 : 0,
    gpuMemBytes: record.gpu_memory_used,
    gpuTemp: record.gpu_temperature,
  };
}

// 网络速率按主题设置选择单位族，各族内自适应进位：
// mbs 按字节（B/s · KB/s · MB/s · GB/s），mbps 按比特（Kbps · Mbps · Gbps · Tbps）。
function formatNetworkRate(value: number, unit: DetailNetworkUnit): string {
  return unit === "mbps" ? formatTrafficRateLabel(value) : formatByteRateLabel(value);
}

const BYTES_TOOLTIP_KEYS = new Set(["ramBytes", "swapBytes", "diskBytes", "gpuMemBytes"]);

function formatTooltipValue(
  key: string,
  value: number | null | undefined,
  unit: string,
  networkUnit: DetailNetworkUnit,
) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (key === "netIn" || key === "netOut") return formatNetworkRate(value, networkUnit);
  if (BYTES_TOOLTIP_KEYS.has(key)) return formatBytes(value);
  if (key === "gpuTemp") return `${value.toFixed(1)}°C`;
  if (unit === "%") return `${value.toFixed(2)}%`;
  if (key === "process" || key === "connections" || key === "udp") return `${Math.round(value)}`;
  return value.toFixed(2);
}

function formatPercentAxisValue(value: number, min: number, max: number) {
  const span = Math.abs(max - min);
  if (span < 0.5) return `${value.toFixed(2)}%`;
  if (span < 5) return `${value.toFixed(1)}%`;
  return `${Math.round(value)}%`;
}

function formatNetworkAxisValue(value: number, networkUnit: DetailNetworkUnit) {
  if (!Number.isFinite(value) || value <= 0) return "";
  return formatNetworkRate(value, networkUnit);
}

function formatBytesAxisValue(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  return formatBytes(value);
}

function formatCountAxisValue(value: number, min: number, max: number) {
  const span = Math.abs(max - min);
  if (span < 10) return value.toFixed(1);
  return `${Math.round(value)}`;
}

// 不含尺寸的配置。width/height 由调用方在另一个 memo 里加上，resize 时只改这两个 key，
// uplot-react 就会调 setSize() 而不是重建整个 chart。(用普通函数而非 hook——它不调任何
// hook；之前的 `use` 前缀会触发 rules-of-hooks lint。)
function buildBaseOptions({
  title,
  keys,
  colors,
  unit,
  resolvedAppearance,
  rangeHours,
  spanGaps,
  axisKind = "default",
  axisSize,
  xRange,
  networkUnit = "mbs",
  zoomXRangeRef,
}: {
  title: string;
  keys: string[];
  colors: string[];
  unit: string;
  resolvedAppearance: "light" | "dark";
  rangeHours: number;
  spanGaps?: boolean;
  axisKind?: "default" | "percent" | "network" | "count" | "bytes";
  axisSize?: number;
  xRange?: [number, number] | null;
  networkUnit?: DetailNetworkUnit;
  zoomXRangeRef?: { readonly current: [number, number] | null };
}): Omit<uPlot.Options, "width" | "height"> {
  // bytes 模式的标签（如 "76.2 MB"）比百分比模式更宽，需要更大的轴尺寸避免文字被裁切。
  const resolvedAxisSize = axisSize ?? (axisKind === "bytes" ? 72 : 52);
  const isDark = resolvedAppearance === "dark";
  const { grid, text } = getAxisColors(isDark);

  return {
    padding: [8, 12, 10, 2],
    cursor: {
      drag: { x: true, y: false, dist: 8 },
      // 同 key 的图表共享光标：悬停任一子图时，其余子图同步显示同一时间点的 tooltip。
      sync: { key: "load-sync", setSeries: false },
    },
    legend: { show: false },
    scales: {
      x: xRange
        ? {
            time: true,
            auto: false,
            range: () => {
              const zoom = zoomXRangeRef?.current;
              return zoom ?? xRange;
            },
          }
        : { time: true },
      y: { auto: true },
    },
    axes: [
      {
        stroke: text,
        grid: { stroke: grid, width: 1 },
        ticks: { stroke: grid },
        size: rangeHours >= 72 ? 38 : 34,
        values: createTimeAxisFormatter(rangeHours),
      },
      {
        stroke: text,
        grid: { stroke: grid, width: 1 },
        ticks: { stroke: grid },
        size: resolvedAxisSize,
        values: (self, splits) => {
          const min = Number(self.scales.y.min ?? 0);
          const max = Number(self.scales.y.max ?? 0);
          return splits.map((value) => {
            if (value === 0 && axisKind !== "percent") return "";
            if (axisKind === "network") return formatNetworkAxisValue(value, networkUnit);
            if (axisKind === "bytes") return formatBytesAxisValue(value);
            if (axisKind === "percent") return formatPercentAxisValue(value, min, max);
            if (axisKind === "count") return formatCountAxisValue(value, min, max);
            return value === 0 ? "" : `${Math.round(value)}${unit}`;
          });
        },
      },
    ],
    series: [
      { label: "time" },
      ...keys.map((key, index) => ({
        label: key,
        stroke: colors[index] ?? colors[0],
        fill: index === 0 ? `${colors[index] ?? colors[0]}22` : undefined,
        width: 1.6,
        spanGaps: spanGaps ?? false,
        points: { show: false },
      })),
    ],
    hooks: {
      init: [
        (u) => {
          u.root.setAttribute("role", "img");
          u.root.setAttribute("aria-label", title);
        },
      ],
    },
  };
}

const ChartCard = memo(function ChartCard({
  icon,
  title,
  value,
  note,
  uuid,
  points,
  times,
  keys,
  colors,
  resolvedAppearance,
  rangeHours,
  unit = "",
  spanGaps,
  axisKind,
  axisSize,
  xRange,
  networkUnit = "mbs",
  resetSignal = 0,
}: {
  icon: ReactNode;
  title: string;
  value: ReactNode;
  note?: ReactNode;
  uuid: string;
  points: ChartPoint[];
  times: number[];
  keys: string[];
  colors: string[];
  resolvedAppearance: "light" | "dark";
  rangeHours: number;
  unit?: string;
  spanGaps?: boolean;
  axisKind?: "default" | "percent" | "network" | "count" | "bytes";
  axisSize?: number;
  xRange?: [number, number] | null;
  networkUnit?: DetailNetworkUnit;
  resetSignal?: number;
}) {
  const { w, h, ref: chartSizeRef } = useResponsiveChartSize("grid");
  const dataRef = useRef<uPlot.AlignedData>([[]]);
  const zoomXRangeRef = useRef<[number, number] | null>(null);
  const [tooltip, setTooltip] = useState<ChartTooltipState>({
    show: false,
    left: 0,
    top: 0,
    rows: [],
    time: "",
  });
  const { onCreate, pinned, zoomed, isGroupPinned } = useChartInteractions({
    fullRange: xRange ?? null,
    resetSignal,
    syncKey: "load-sync",
    zoomXRangeRef,
    onUnpin: () => setTooltip((prev) => (prev.show ? { ...prev, show: false } : prev)),
  });
  const data = useMemo(() => metricData(times, points, keys), [times, points, keys]);
  useLayoutEffect(() => {
    dataRef.current = data;
  }, [data]);
  const baseOptions = useMemo(
    () =>
      buildBaseOptions({
        title,
        keys,
        colors,
        unit,
        resolvedAppearance,
        rangeHours,
        spanGaps,
        axisKind,
        axisSize,
        xRange,
        networkUnit,
        zoomXRangeRef,
      }),
    [axisKind, axisSize, colors, keys, networkUnit, rangeHours, resolvedAppearance, spanGaps, title, unit, xRange],
  );

  const enhancedOptions = useMemo<Omit<uPlot.Options, "width" | "height">>(() => {
    const tooltip = buildChartTooltipHooks({
      dataRef,
      rangeHours,
      estimatedWidth: 176,
      setTooltip,
      isPinned: isGroupPinned,
      buildRows: (idx) =>
        keys.map((key, keyIndex) => ({
          label: getSeriesLabel(key),
          value: formatTooltipValue(
            key,
            dataRef.current[keyIndex + 1]?.[idx] as number | null | undefined,
            unit,
            networkUnit,
          ),
          color: colors[keyIndex] ?? colors[0],
        })),
    });
    return {
      ...baseOptions,
      hooks: {
        ...baseOptions.hooks,
        init: [...(baseOptions.hooks?.init ?? []), tooltip.onInit],
        destroy: [...(baseOptions.hooks?.destroy ?? []), tooltip.onDestroy],
        setCursor: [tooltip.onSetCursor],
      },
    };
  }, [colors, keys, baseOptions, networkUnit, isGroupPinned, rangeHours, unit]);

  const chartOptions = useMemo<uPlot.Options>(
    () => ({ ...enhancedOptions, width: w, height: h }) as uPlot.Options,
    [enhancedOptions, w, h],
  );

  return (
    <div
      className={clsx(
        "instance-chart-card",
        pinned && "is-pinned",
        zoomed && "is-zoomed",
      )}
      style={{ "--chart-accent": colors[0] } as CSSProperties}
    >
      <header className="instance-chart-card-head">
        <div className="instance-panel-subhead">
          {icon}
          <span>{title}</span>
          {pinned && (
            <span className="instance-chart-flag" title="已固定，点击图表取消">
              已固定
            </span>
          )}
          {zoomed && (
            <span className="instance-chart-flag is-zoom" title="已缩放，点击刷新按钮重置">
              已缩放
            </span>
          )}
        </div>
        <div className="instance-series-stats">
          <span className="tabular">{value}</span>
          {note != null && <span className="tabular text-[var(--text-tertiary)]">{note}</span>}
        </div>
      </header>
      <div ref={chartSizeRef} className="instance-uplot-wrap">
        <UplotReact
          key={`${uuid}-${rangeHours}-${axisKind ?? "default"}`}
          options={chartOptions}
          data={data}
          // 实时模式下滑动窗口需要 setData 重置缩放；但用户手动放大后
          // （zoomed）或固定后（pinned）不能再被每秒的数据更新冲掉——
          // 否则缩放保不住，固定的光标也会随着窗口滑动漂离点选的数据点。
          // 历史模式下始终重置 Y 轴自适应，确保数据源切换时纵轴正确缩放。
          resetScales={rangeHours === 0 ? !zoomed && !pinned : true}
          onCreate={onCreate}
        />
        <ChartTooltip tooltip={tooltip} />
      </div>
    </div>
  );
});

export function LoadChart({
  uuid,
  hours,
  active = true,
}: {
  uuid: string;
  hours: number;
  active?: boolean;
}) {
  const queryHours = hours === 0 ? 1 : hours;
  const { data, isError, isFetching, isLoading, refetch } = useLoadRecords(
    uuid,
    queryHours,
    active,
  );
  // 近期实时缓冲：完整历史加载前先展示迷你趋势，避免白屏等待。
  const { data: recentRecords } = useRecentStatus(isLoading ? uuid : undefined);
  const isRealtime = hours === 0;
  const node = useNodeMetrics(uuid, isRealtime && active);
  // 新版后端不再存储 memory.total / swap.total / disk.total 指标序列，
  // 历史记录的 total 字段为 0 时回退到节点注册时的静态总量。
  const meta = useNodeMeta(uuid);
  const hasGpu = Boolean(meta?.gpu_name && meta.gpu_name !== "None");
  const { resolvedAppearance } = usePreferences();
  const themeSettings = useThemeSettings();
  const useBytesUnit = themeSettings.isReady && themeSettings.detailChartUnit === "bytes";
  const networkUnit = themeSettings.detailNetworkUnit;
  const [realtimePoints, setRealtimePoints] = useState<ChartPoint[]>([]);
  const [connectNulls, setConnectNulls] = useState(false);
  // 刷新按钮递增此值，通知各 ChartCard 重置缩放/固定状态。
  const [resetSignal, setResetSignal] = useState(0);
  // 鼠标悬停图表区域时暂停实时数据推送：避免滑动窗口在用户缩放/固定/阅读时
  // 不断位移，导致交互「随机失效」。离开后一次性补回缓冲期间的数据点。
  const [chartHovered, setChartHovered] = useState(false);
  const realtimeBufferRef = useRef<ChartPoint[]>([]);

  useEffect(() => {
    if (!active || !isRealtime || !node) return;
    if (chartHovered) {
      realtimeBufferRef.current.push(pointFromNode(node));
      return;
    }
    const buffered = realtimeBufferRef.current;
    realtimeBufferRef.current = [];
    setRealtimePoints((prev) => {
      // 逐点 [...next, candidate] 会把整段窗口（最多 600 点）复制一遍，
      // 悬停期间攒下的几十个缓冲点一次性补回时是 O(n²)；先攒后拼一次。
      const appended: ChartPoint[] = [];
      let lastTime = prev.length > 0 ? prev[prev.length - 1].time : null;
      for (const candidate of buffered) {
        if (lastTime !== null && Math.abs(lastTime - candidate.time) < 1) continue;
        appended.push(candidate);
        lastTime = candidate.time;
      }
      const latest = pointFromNode(node);
      if (lastTime === null || Math.abs(lastTime - latest.time) >= 1) appended.push(latest);
      if (appended.length === 0) return prev;
      return prev.concat(appended).slice(-REALTIME_SAMPLE_LIMIT);
    });
  }, [active, isRealtime, node, chartHovered]);

  useEffect(() => {
    realtimeBufferRef.current = [];
    setRealtimePoints([]);
  }, [hours, uuid]);

  const onChartGridEnter = useCallback(() => {
    if (isRealtime) setChartHovered(true);
  }, [isRealtime]);
  const onChartGridLeave = useCallback(() => {
    setChartHovered(false);
  }, []);

  const historyRecords = useMemo<Array<{ record: LoadRecord; time: number }>>(
    () =>
      (data?.records ?? [])
        .map((record) => ({ record, time: toChartSeconds(record.time) }))
        .filter(({ time }) => time > 0)
        .sort((left, right) => left.time - right.time),
    [data],
  );

  const fallbackRamTotal = meta?.mem_total ?? 0;
  const fallbackSwapTotal = meta?.swap_total ?? 0;
  const fallbackDiskTotal = meta?.disk_total ?? 0;

  const historyPoints = useMemo<ChartPoint[]>(() => {
    const rawPoints = historyRecords.map(({ record, time }) =>
      pointFromRecord(record, time, fallbackRamTotal, fallbackSwapTotal, fallbackDiskTotal),
    );
    const sampled = downsamplePoints(rawPoints, getHistoryRenderLimit(hours));
    const filled = fillMissingMetricPoints(sampled);
    return interpolateMetricGaps(filled, LOAD_INTERPOLATE_KEYS) as ChartPoint[];
  }, [historyRecords, hours, fallbackRamTotal, fallbackSwapTotal, fallbackDiskTotal]);

  // 近期缓冲转 ChartPoint：完整历史到达前作为临时数据源。
  const recentPoints = useMemo<ChartPoint[]>(() => {
    if (!recentRecords || recentRecords.length === 0) return [];
    return recentRecords
      .map((rec) => {
        const time = toChartSeconds(rec.time);
        if (time <= 0) return null;
        return pointFromRecord(rec, time, fallbackRamTotal, fallbackSwapTotal, fallbackDiskTotal);
      })
      .filter((p): p is ChartPoint => p !== null)
      .sort((a, b) => a.time - b.time);
  }, [recentRecords, fallbackRamTotal, fallbackSwapTotal, fallbackDiskTotal]);

  const points = useMemo<ChartPoint[]>(() => {
    if (isRealtime) {
      const initial = historyPoints.slice(-REALTIME_HISTORY_SEED_LIMIT);
      const merged = [...initial, ...realtimePoints].sort((a, b) => a.time - b.time);
      const deduped = merged.filter((point, index, arr) => {
        const next = arr[index + 1];
        return !next || Math.abs(next.time - point.time) >= 1;
      });
      return deduped.slice(-REALTIME_SAMPLE_LIMIT);
    }
    // 完整历史到达前用近期缓冲作为临时数据源。
    return historyPoints.length > 0 ? historyPoints : recentPoints;
  }, [historyPoints, recentPoints, isRealtime, realtimePoints]);

  // 时间轴所有图表共用，算一次即可。
  const times = useMemo(() => points.map((point) => point.time), [points]);

  // 即使节点标有 GPU 型号，若无实际数据上报（gpu_memory_total 始终为 0）
  // 则 GPU 图表无意义，直接隐藏。
  const hasGpuData = useMemo(() => {
    if (!hasGpu) return false;
    // gpu_memory_total > 0 是 GPU 监控活跃的最可靠信号
    if (historyRecords.some(({ record }) => record.gpu_memory_total > 0)) return true;
    if (recentPoints.some((p) => (p.gpuMemBytes ?? 0) > 0 || (p.gpuTemp ?? 0) > 0)) return true;
    if (isRealtime && node && node.gpuMemTotal > 0) return true;
    return false;
  }, [hasGpu, historyRecords, recentPoints, isRealtime, node]);

  const sourceRecordCount = historyRecords.length;
  const wasDownsampled = !isRealtime && sourceRecordCount > getHistoryRenderLimit(hours);
  const sampleSummary = isRealtime
    ? `${points.length} 个点`
    : wasDownsampled
      ? `${points.length} / ${sourceRecordCount} 个点`
      : `${points.length} 个点`;
  const coverageSummary = points.length
    ? `${formatChartCoverageTime(points[0].time)} - ${formatChartCoverageTime(points[points.length - 1].time)}`
    : "—";
  const requestedXRange = useMemo(
    () => (isRealtime ? null : historyChartRangeSeconds(data)),
    [data, isRealtime],
  );
  const coverageLabel = useMemo(
    () =>
      isRealtime
        ? null
        : historyCoverageLabel(data, points[0]?.time, points[points.length - 1]?.time),
    [data, isRealtime, points],
  );

  // 历史模式头部数值：记录自带 total 为 0 时回退到节点静态总量。
  const lastRecord = data?.records.length ? data.records[data.records.length - 1] : undefined;
  const lastRamTotal = (lastRecord?.ram_total ?? 0) > 0 ? lastRecord!.ram_total : fallbackRamTotal;
  const lastSwapTotal = (lastRecord?.swap_total ?? 0) > 0 ? lastRecord!.swap_total : fallbackSwapTotal;
  const lastDiskTotal = (lastRecord?.disk_total ?? 0) > 0 ? lastRecord!.disk_total : fallbackDiskTotal;
  const lastGpuMemUsed = lastRecord?.gpu_memory_used ?? 0;
  const lastGpuMemTotal =
    (lastRecord?.gpu_memory_total ?? 0) > 0 ? lastRecord!.gpu_memory_total : (node?.gpuMemTotal ?? 0);

  if (isLoading && !recentPoints.length) {
    return <InstanceChartLoading title="负载图表" />;
  }

  if (isError && !points.length) {
    return (
      <InstancePanel title="负载图表">
        <div className="instance-empty">
          <span>负载历史加载失败</span>
          <button
            type="button"
            className="instance-toggle-button"
            onClick={() => void refetch()}
            disabled={isFetching}
            aria-busy={isFetching}
          >
            {isFetching ? "重试中" : "重试"}
          </button>
        </div>
      </InstancePanel>
    );
  }

  if (!points.length) {
    return (
      <InstancePanel title="负载图表">
        <div className="instance-empty">暂无负载历史数据</div>
      </InstancePanel>
    );
  }

  // 各图仅在 icon/title/value/keys/colors/坐标轴上有差异，其余接线九张图完全一致。
  const sharedChartProps = {
    uuid,
    points,
    times,
    resolvedAppearance,
    rangeHours: hours,
    spanGaps: connectNulls,
    xRange: requestedXRange,
    resetSignal,
  };

  return (
    <InstancePanel
      title="负载图表"
      aside={
        <div className="instance-chart-headmeta">
          <div className="instance-chart-meta" aria-label="图表数据范围">
            <span title={coverageSummary}>
              <strong>{coverageLabel ?? `覆盖 ${coverageSummary}`}</strong>
            </span>
            <span>
              采样 <strong>{sampleSummary}</strong>
            </span>
          </div>
          <SwitchToggle
            label="断点连线"
            active={connectNulls}
            onToggle={() => setConnectNulls((value) => !value)}
          />
          <button
            type="button"
            className="instance-toggle-button"
            onClick={() => {
              setResetSignal((value) => value + 1);
              void refetch();
            }}
            disabled={isFetching}
            aria-busy={isFetching}
          >
            <RefreshCw size={14} aria-hidden />
            {isFetching ? "刷新中" : "刷新"}
          </button>
        </div>
      }
      className="instance-chart-panel"
    >
      <div
        className="instance-chart-grid"
        onMouseEnter={onChartGridEnter}
        onMouseLeave={onChartGridLeave}
      >
        <ChartCard
          {...sharedChartProps}
          icon={<Cpu size={13} />}
          title="CPU"
          value={
            isRealtime && node
              ? `${node.cpuPct.toFixed(2)}%`
              : `${(points[points.length - 1]?.cpu ?? 0).toFixed(2)}%`
          }
          note="使用率"
          keys={CPU_KEYS}
          colors={CPU_COLORS}
          unit="%"
          axisKind="percent"
        />
        <ChartCard
          {...sharedChartProps}
          icon={<MemoryStick size={13} />}
          title="内存"
          value={
            isRealtime && node
              ? `${formatBytes(node.ramUsed)} / ${formatBytes(node.ramTotal)}`
              : lastRecord
                ? `${formatBytes(lastRecord.ram)} / ${formatBytes(lastRamTotal)}`
                : "—"
          }
          note={
            isRealtime && node
              ? node.swapTotal
                ? `Swap ${formatBytes(node.swapUsed)} / ${formatBytes(node.swapTotal)}`
                : "Swap 无"
              : lastRecord && lastSwapTotal > 0
                ? `Swap ${formatBytes(lastRecord.swap)} / ${formatBytes(lastSwapTotal)}`
                : "Swap 无"
          }
          keys={useBytesUnit ? MEMORY_BYTES_KEYS : MEMORY_KEYS}
          colors={MEMORY_COLORS}
          unit={useBytesUnit ? "" : "%"}
          axisKind={useBytesUnit ? "bytes" : "percent"}
        />
        <ChartCard
          {...sharedChartProps}
          icon={<HardDrive size={13} />}
          title="磁盘"
          value={
            isRealtime && node
              ? `${formatBytes(node.diskUsed)} / ${formatBytes(node.diskTotal)}`
              : lastRecord
                ? `${formatBytes(lastRecord.disk)} / ${formatBytes(lastDiskTotal)}`
                : "—"
          }
          note="已用空间"
          keys={useBytesUnit ? DISK_BYTES_KEYS : DISK_KEYS}
          colors={DISK_COLORS}
          unit={useBytesUnit ? "" : "%"}
          axisKind={useBytesUnit ? "bytes" : "percent"}
        />
        <ChartCard
          {...sharedChartProps}
          icon={<Network size={13} />}
          title="网络"
          value={
            isRealtime && node
              ? `${formatNetworkRate(node.netDown, networkUnit)} / ${formatNetworkRate(node.netUp, networkUnit)}`
              : data?.records.length
                ? `${formatNetworkRate(data.records[data.records.length - 1]?.net_in ?? 0, networkUnit)} / ${formatNetworkRate(data.records[data.records.length - 1]?.net_out ?? 0, networkUnit)}`
                : "—"
          }
          note={
            <span className="instance-overview-multi">
              <span className="inline-flex items-center gap-1"><ArrowDown size={11} />{isRealtime && node ? formatBytes(node.trafficDown) : data?.records.length ? formatBytes(data.records[data.records.length - 1]?.net_total_down ?? 0) : "—"}</span>
              <span className="inline-flex items-center gap-1"><ArrowUp size={11} />{isRealtime && node ? formatBytes(node.trafficUp) : data?.records.length ? formatBytes(data.records[data.records.length - 1]?.net_total_up ?? 0) : "—"}</span>
            </span>
          }
          keys={NETWORK_KEYS}
          colors={NETWORK_COLORS}
          axisKind="network"
          axisSize={78}
          networkUnit={networkUnit}
        />
        <ChartCard
          {...sharedChartProps}
          icon={<Workflow size={13} />}
          title="连接数"
          value={
            isRealtime && node
              ? `TCP ${node.connectionsTcp} / UDP ${node.connectionsUdp}`
              : data?.records.length
                ? `TCP ${Math.round(data.records[data.records.length - 1]?.connections ?? 0)} / UDP ${Math.round(data.records[data.records.length - 1]?.connections_udp ?? 0)}`
                : "—"
          }
          note="连接"
          keys={CONNECTION_KEYS}
          colors={CONNECTION_COLORS}
          axisKind="count"
        />
        <ChartCard
          {...sharedChartProps}
          icon={<Gauge size={13} />}
          title="进程"
          value={
            isRealtime && node
              ? node.process.toString()
              : data?.records.length
                ? Math.round(data.records[data.records.length - 1]?.process ?? 0).toString()
                : "—"
          }
          note={
            isRealtime && node
              ? `负载 ${node.load1.toFixed(2)} | ${node.load5.toFixed(2)} | ${node.load15.toFixed(2)}`
              : data?.records.length
                ? `负载 ${(data.records[data.records.length - 1]?.load ?? 0).toFixed(2)}`
                : "—"
          }
          keys={PROCESS_KEYS}
          colors={PROCESS_COLORS}
          axisKind="count"
        />
        {hasGpuData && (
          <ChartCard
            {...sharedChartProps}
            icon={<CircuitBoard size={13} />}
            title="GPU 使用率"
            value={
              isRealtime && node
                ? `${node.gpuPct.toFixed(2)}%`
                : `${(points[points.length - 1]?.gpu ?? 0).toFixed(2)}%`
            }
            note={meta?.gpu_name || "使用率"}
            keys={GPU_USAGE_KEYS}
            colors={GPU_USAGE_COLORS}
            unit="%"
            axisKind="percent"
          />
        )}
        {hasGpuData && (
          <ChartCard
            {...sharedChartProps}
            icon={<MemoryStick size={13} />}
            title="GPU 显存"
            value={
              isRealtime && node
                ? node.gpuMemTotal > 0
                  ? `${formatBytes(node.gpuMemUsed)} / ${formatBytes(node.gpuMemTotal)}`
                  : formatBytes(node.gpuMemUsed)
                : lastGpuMemTotal > 0
                  ? `${formatBytes(lastGpuMemUsed)} / ${formatBytes(lastGpuMemTotal)}`
                  : formatBytes(lastGpuMemUsed)
            }
            note={meta?.gpu_name || "显存占用"}
            keys={useBytesUnit ? GPU_BYTES_KEYS : GPU_MEM_KEYS}
            colors={GPU_MEM_COLORS}
            unit={useBytesUnit ? "" : "%"}
            axisKind={useBytesUnit ? "bytes" : "percent"}
          />
        )}
        {hasGpuData && (
          <ChartCard
            {...sharedChartProps}
            icon={<Thermometer size={13} />}
            title="GPU 温度"
            value={
              isRealtime && node
                ? node.gpuTemp > 0 ? `${node.gpuTemp.toFixed(1)}°C` : "—"
                : (points[points.length - 1]?.gpuTemp ?? 0) > 0
                  ? `${(points[points.length - 1]?.gpuTemp ?? 0).toFixed(1)}°C`
                  : "—"
            }
            note={meta?.gpu_name || "温度"}
            keys={GPU_TEMP_KEYS}
            colors={GPU_TEMP_COLORS}
            unit="°C"
            axisKind="default"
          />
        )}
      </div>
    </InstancePanel>
  );
}
