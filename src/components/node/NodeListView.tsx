import { memo, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  CircleDollarSign,
  ListFilter,
} from "@/components/ui/icons";
import { clsx } from "clsx";
import { Flag } from "@/components/ui/Flag";
import { OsLogo } from "@/components/ui/OsLogo";
import { AnimatedValue } from "@/components/ui/AnimatedValue";
import {
  useNodeCardModel,
  type NodePingSeries,
} from "@/hooks/useNodeCardModel";
import { useListColumns } from "@/hooks/useListColumns";
import { useHomeSort } from "@/hooks/useHomeSort";
import { useNodeFilter } from "@/hooks/useNodeFilter";
import { useLayoutTransition } from "@/hooks/useLayoutTransition";
import { useNodeStatusFlash } from "@/hooks/useNodeStatusFlash";
import { useCanvasRedrawKey } from "@/hooks/useMetricColors";
import { formatBillingCycle } from "@/utils/billing";
import {
  formatBytes,
  formatByteRate,
  formatRelativeTime,
  trimFixed,
} from "@/utils/format";
import { getDisplayRegionCode } from "@/utils/geo";
import { getReportedGpuLabel } from "@/utils/gpu";
import { latencyHeatColor, lossHeatColor, speedRateColor } from "@/utils/metricTone";
import {
  getNodeFieldDefinition,
  resolveIpStackLabel,
  type NodeFieldId,
} from "@/utils/nodeFields";
import { trafficTypeLabel } from "@/utils/traffic";
import { LatencyBars } from "./LatencyBars";
import { PingTaskTabs } from "./PingTaskTabs";
import { attentionAttrs } from "@/utils/nodeAttention";
import { AttentionReasons } from "./AttentionReasons";
import {
  clamp01,
  compactPercentText,
  formatOsLabel,
  joinTagTitle,
  nodeDetailLinkLabels,
} from "./nodeCardShared";

type NodeCardModel = ReturnType<typeof useNodeCardModel>;

function formatShortDate(raw: string | number | null | undefined): string {
  if (raw == null) return "—";
  const str = String(raw).trim();
  if (!str) return "—";
  const ts = Date.parse(str);
  if (Number.isNaN(ts) || ts <= 0) return "—";
  return new Date(ts).toISOString().slice(0, 10);
}

function worstSeriesLoss(series: NodePingSeries[]): number | null {
  let worst: number | null = null;
  for (const item of series) {
    const loss = item.ping.loss;
    if (loss == null || !Number.isFinite(loss)) continue;
    if (worst == null || loss > worst) worst = loss;
  }
  return worst;
}

// 列表网络列的延迟柱数:比卡片(24)少,配窄列宽,柱子仍清晰可读。
const LIST_PING_BUCKETS = 12;

type ListGaugeStyle = CSSProperties & {
  "--list-gauge-color": string;
  "--list-gauge-fill": string;
};

type DynamicListStyle = CSSProperties & {
  "--node-list-grid-template"?: string;
  "--node-list-min-width"?: string;
};

function pctText(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return compactPercentText(value);
}

// 细 CSS 分段条 + 百分比,与大卡 MetricBar 同一视觉语言,但压成一格(数值在上、细条在下)。
function ListGauge({
  value,
  fraction,
  paint,
  unit = "%",
}: {
  value: string;
  fraction: number;
  paint: string;
  unit?: string;
}) {
  const style: ListGaugeStyle = {
    "--list-gauge-color": paint,
    "--list-gauge-fill": `${clamp01(fraction) * 100}%`,
  };
  return (
    <div className="node-list-gauge">
      <span className="node-list-gauge-value tabular">
        <AnimatedValue text={value} />
        {unit && <small>{unit}</small>}
      </span>
      <span className="node-list-gauge-track" style={style} aria-hidden />
    </div>
  );
}

// 一格两行的小堆叠(实时速率/在线到期共用):每行「值 + 可选单位」,可单独着色。
function StackLine({
  icon,
  value,
  unit,
  color,
}: {
  icon?: React.ReactNode;
  value: string;
  unit?: string;
  color?: string;
}) {
  return (
    <span className="node-list-line" style={color ? { color } : undefined}>
      {icon && <span className="node-list-line-icon">{icon}</span>}
      <span className="node-list-line-value tabular">
        <AnimatedValue text={value} />
        {unit && <small>{unit}</small>}
      </span>
    </span>
  );
}

// 网络列:当前延迟在上,聚合延迟柱状图在下(热力着色,与大卡同一视觉语言)。
// 绑定了多个 Ping 任务时,标签行让延迟柱切换到对应任务。
function ListLatency({
  pingSeries,
  activeIndex,
  onSelect,
  redrawKey,
}: {
  pingSeries: NodePingSeries[];
  activeIndex: number;
  onSelect: (index: number) => void;
  redrawKey: string;
}) {
  const { ping, buckets, latencyColor } = pingSeries[activeIndex];
  const latency = ping.lastValue;
  return (
    <div className="node-list-latency">
      <PingTaskTabs
        series={pingSeries}
        activeIndex={activeIndex}
        onSelect={onSelect}
        size="small"
      />
      {/* 多任务时标签行已经把三个延迟都读出来了,再重复一遍当前值只会撑高行高。 */}
      {pingSeries.length === 1 && (
        <span className="node-list-latency-value tabular" style={{ color: latencyColor }}>
          <AnimatedValue text={latency != null ? String(Math.round(latency)) : "—"} />
          {latency != null && <small>ms</small>}
        </span>
      )}
      <LatencyBars buckets={buckets} max={ping.max} redrawKey={redrawKey} height={14} />
    </div>
  );
}

function renderDynamicCell(
  colId: NodeFieldId,
  model: NodeCardModel,
  pingIndex: number,
  setActivePingIndex: (index: number) => void,
  redrawKey: string,
) {
  if (!model.node) return null;
  const {
    node,
    traffic,
    pingSeries,
    hasHomepagePingBinding,
    footerTags,
    expire,
    expireColor,
    uptime,
    renewalPrice,
    loadFraction,
    upRate,
    downRate,
    osName,
    attention,
  } = model;

  const def = getNodeFieldDefinition(colId);
  const alignClass =
    def.align === "center"
      ? "is-align-center"
      : def.align === "right"
        ? "is-align-right"
        : "is-align-left";
  const usedPct = `${Math.round(clamp01(traffic.fraction) * 100)}%`;
  const primaryPing = pingSeries[0]?.ping;
  const primaryLoss = worstSeriesLoss(pingSeries);

  switch (colId) {
    case "node":
      return (
        <div key={colId} className="node-list-cell node-list-node">
          <AttentionReasons attention={attention} />
          <div className="node-list-node-text">
            <div className="node-list-node-head">
              <Flag region={node.region} size={14} />
              <span className="node-list-name" title={node.name}>
                {node.name}
              </span>
            </div>
            {(renewalPrice || footerTags.length > 0) && (
              <div
                className="node-list-chips"
                title={footerTags.length > 0 ? joinTagTitle(footerTags) : undefined}
              >
                {renewalPrice && (
                  <span className="dstatus-price-chip">
                    <CircleDollarSign size={12} strokeWidth={2.2} />
                    {renewalPrice}
                  </span>
                )}
                {footerTags.map((tag, index) => (
                  <span
                    key={`${tag.label}-${index}`}
                    className="dstatus-tag-chip"
                    data-tag={tag.color}
                    style={{ background: "var(--tag-bg)", color: "var(--tag-fg)" }}
                  >
                    {tag.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      );

    case "os": {
      const rawOs = node.os?.trim() ?? "";
      return (
        <div key={colId} className="node-list-cell col-os">
          {rawOs ? (
            <>
              <OsLogo value={node.os} size={16} />
              <span className="node-list-os-name" title={rawOs}>
                {formatOsLabel(osName, node.os)}
              </span>
            </>
          ) : (
            <span className="node-list-muted">—</span>
          )}
        </div>
      );
    }

    case "cpu":
      return (
        <div key={colId} className="node-list-cell col-metric">
          <ListGauge
            value={pctText(node.cpuPct)}
            fraction={node.cpuPct / 100}
            paint="var(--progress-cpu)"
          />
        </div>
      );

    case "memory":
      return (
        <div key={colId} className="node-list-cell col-metric">
          <ListGauge
            value={pctText(node.ramPct)}
            fraction={node.ramPct / 100}
            paint="var(--progress-memory)"
          />
        </div>
      );

    case "disk":
      return (
        <div key={colId} className="node-list-cell col-metric">
          <ListGauge
            value={pctText(node.diskPct)}
            fraction={node.diskPct / 100}
            paint="var(--progress-disk)"
          />
        </div>
      );

    case "load":
      return (
        <div key={colId} className="node-list-cell col-load">
          <ListGauge
            value={node.load1.toFixed(2)}
            unit=""
            fraction={loadFraction}
            paint="var(--progress-load)"
          />
        </div>
      );

    case "live_speed":
      return (
        <div key={colId} className="node-list-cell col-live node-list-stack">
          <StackLine
            icon={<ArrowUp size={11} strokeWidth={2.4} />}
            value={upRate.value}
            unit={upRate.unit}
            color={speedRateColor(upRate.unit)}
          />
          <StackLine
            icon={<ArrowDown size={11} strokeWidth={2.4} />}
            value={downRate.value}
            unit={downRate.unit}
            color={speedRateColor(downRate.unit)}
          />
        </div>
      );

    case "traffic":
      return (
        <div
          key={colId}
          className="node-list-cell col-traffic"
          title={`剩余 ${traffic.remainingLabel} · ${traffic.detail}`}
        >
          <div className="node-list-traffic-rows">
            <StackLine
              icon={<ArrowUp size={11} strokeWidth={2.1} />}
              value={formatBytes(node.trafficUp)}
            />
            <StackLine
              icon={<ArrowDown size={11} strokeWidth={2.1} />}
              value={formatBytes(node.trafficDown)}
            />
          </div>
          <span className="node-list-traffic-quota" style={{ color: traffic.color }}>
            {usedPct}
          </span>
        </div>
      );

    case "network":
      return (
        <div key={colId} className="node-list-cell col-net">
          {hasHomepagePingBinding ? (
            <ListLatency
              pingSeries={pingSeries}
              activeIndex={pingIndex}
              onSelect={setActivePingIndex}
              redrawKey={redrawKey}
            />
          ) : (
            <span className="node-list-muted">—</span>
          )}
        </div>
      );

    case "life":
      return (
        <div key={colId} className="node-list-cell col-life node-list-stack">
          <StackLine value={uptime.value} unit={uptime.unit} color="var(--progress-cpu)" />
          <StackLine value={expire.value} unit={expire.unit} color={expireColor} />
        </div>
      );

    // ── 基础与身份字段 ──────────────────────────────────────────────────────
    case "online":
      return (
        <div key={colId} className={clsx("node-list-cell", alignClass)}>
          <span
            className={clsx(
              "node-list-status-pill",
              node.online === true
                ? "is-online"
                : node.online === false
                  ? "is-offline"
                  : "is-unknown",
            )}
          >
            <span className="node-list-status-dot" />
            {node.online === true ? "在线" : node.online === false ? "离线" : "未知"}
          </span>
        </div>
      );

    case "name":
      return (
        <div key={colId} className={clsx("node-list-cell", alignClass)} title={node.name}>
          <span className="node-list-name">{node.name}</span>
        </div>
      );

    case "group":
      return (
        <div key={colId} className={clsx("node-list-cell", alignClass)}>
          {node.group?.trim() ? (
            <span className="node-list-badge">{node.group.trim()}</span>
          ) : (
            <span className="node-list-muted">未分组</span>
          )}
        </div>
      );

    case "region": {
      const code = getDisplayRegionCode(node.region);
      return (
        <div key={colId} className={clsx("node-list-cell node-list-inline", alignClass)}>
          <Flag region={node.region} size={14} />
          <span className="tabular">{code || "—"}</span>
        </div>
      );
    }

    case "tags":
      return (
        <div
          key={colId}
          className={clsx("node-list-cell", alignClass)}
          title={footerTags.length > 0 ? joinTagTitle(footerTags) : undefined}
        >
          {footerTags.length > 0 ? (
            <div className="node-list-chips">
              {footerTags.map((tag, idx) => (
                <span
                  key={`${tag.label}-${idx}`}
                  className="dstatus-tag-chip"
                  data-tag={tag.color}
                  style={{ background: "var(--tag-bg)", color: "var(--tag-fg)" }}
                >
                  {tag.label}
                </span>
              ))}
            </div>
          ) : (
            <span className="node-list-muted">—</span>
          )}
        </div>
      );

    case "public_remark":
      return (
        <div
          key={colId}
          className={clsx("node-list-cell", alignClass)}
          title={node.public_remark || undefined}
        >
          {node.public_remark?.trim() ? (
            <span className="node-list-ellipsis">{node.public_remark.trim()}</span>
          ) : (
            <span className="node-list-muted">—</span>
          )}
        </div>
      );

    case "ipv4":
      return (
        <div
          key={colId}
          className={clsx("node-list-cell tabular", alignClass)}
          title={node.ipv4 || undefined}
        >
          {node.ipv4?.trim() ? (
            <span className="node-list-ellipsis">{node.ipv4.trim()}</span>
          ) : (
            <span className="node-list-muted">—</span>
          )}
        </div>
      );

    case "ipv6":
      return (
        <div
          key={colId}
          className={clsx("node-list-cell tabular", alignClass)}
          title={node.ipv6 || undefined}
        >
          {node.ipv6?.trim() ? (
            <span className="node-list-ellipsis">{node.ipv6.trim()}</span>
          ) : (
            <span className="node-list-muted">—</span>
          )}
        </div>
      );

    case "ip_stack": {
      const label = resolveIpStackLabel(node.ipv4, node.ipv6);
      return (
        <div key={colId} className={clsx("node-list-cell", alignClass)}>
          {label ? (
            <span className="node-list-badge">{label}</span>
          ) : (
            <span className="node-list-muted">—</span>
          )}
        </div>
      );
    }

    case "weight":
      return (
        <div key={colId} className={clsx("node-list-cell tabular", alignClass)}>
          {node.weight}
        </div>
      );

    case "hidden":
      return (
        <div key={colId} className={clsx("node-list-cell", alignClass)}>
          {node.hidden ? (
            <span className="node-list-badge is-warn">隐藏</span>
          ) : (
            <span className="node-list-muted">公开</span>
          )}
        </div>
      );

    case "uuid":
      return (
        <div
          key={colId}
          className={clsx("node-list-cell tabular", alignClass)}
          title={node.uuid}
        >
          <span className="node-list-ellipsis">{node.uuid}</span>
        </div>
      );

    // ── 硬件与系统规格字段 ──────────────────────────────────────────────────
    case "cpu_name":
      return (
        <div
          key={colId}
          className={clsx("node-list-cell", alignClass)}
          title={node.cpu_name || undefined}
        >
          {node.cpu_name?.trim() ? (
            <span className="node-list-ellipsis">{node.cpu_name.trim()}</span>
          ) : (
            <span className="node-list-muted">—</span>
          )}
        </div>
      );

    case "cpu_cores":
      return (
        <div key={colId} className={clsx("node-list-cell tabular", alignClass)}>
          {node.cpu_cores > 0 ? `${node.cpu_cores} 核` : "—"}
        </div>
      );

    case "arch":
      return (
        <div key={colId} className={clsx("node-list-cell", alignClass)}>
          {node.arch?.trim() ? (
            <span className="node-list-badge">{node.arch.trim()}</span>
          ) : (
            <span className="node-list-muted">—</span>
          )}
        </div>
      );

    case "virtualization":
      return (
        <div key={colId} className={clsx("node-list-cell", alignClass)}>
          {node.virtualization?.trim() ? (
            <span className="node-list-badge">{node.virtualization.trim()}</span>
          ) : (
            <span className="node-list-muted">—</span>
          )}
        </div>
      );

    case "kernel_version":
      return (
        <div
          key={colId}
          className={clsx("node-list-cell tabular", alignClass)}
          title={node.kernel_version || undefined}
        >
          {node.kernel_version?.trim() ? (
            <span className="node-list-ellipsis">{node.kernel_version.trim()}</span>
          ) : (
            <span className="node-list-muted">—</span>
          )}
        </div>
      );

    case "gpu_name": {
      const gpuLabel = getReportedGpuLabel(node.gpu) || node.gpu_name?.trim() || "";
      return (
        <div
          key={colId}
          className={clsx("node-list-cell", alignClass)}
          title={gpuLabel || undefined}
        >
          {gpuLabel ? (
            <span className="node-list-ellipsis">{gpuLabel}</span>
          ) : (
            <span className="node-list-muted">—</span>
          )}
        </div>
      );
    }

    case "mem_total":
      return (
        <div key={colId} className={clsx("node-list-cell tabular", alignClass)}>
          {node.mem_total > 0 ? formatBytes(node.mem_total) : "—"}
        </div>
      );

    case "swap_total":
      return (
        <div key={colId} className={clsx("node-list-cell tabular", alignClass)}>
          {node.swap_total > 0 ? formatBytes(node.swap_total) : "—"}
        </div>
      );

    case "disk_total":
      return (
        <div key={colId} className={clsx("node-list-cell tabular", alignClass)}>
          {node.disk_total > 0 ? formatBytes(node.disk_total) : "—"}
        </div>
      );

    // ── 实时资源与进程指标 ──────────────────────────────────────────────────
    case "ram_used":
      return (
        <div key={colId} className="node-list-cell node-list-stack">
          <StackLine value={formatBytes(node.ramUsed)} color="var(--progress-memory)" />
          <StackLine value={`/ ${formatBytes(node.ramTotal || node.mem_total)}`} />
        </div>
      );

    case "swap": {
      const swapTotal = node.swapTotal || node.swap_total || 0;
      const swapPct = swapTotal > 0 ? (node.swapUsed / swapTotal) * 100 : 0;
      return (
        <div key={colId} className="node-list-cell col-metric">
          {swapTotal > 0 ? (
            <ListGauge
              value={pctText(swapPct)}
              fraction={swapPct / 100}
              paint="var(--progress-swap)"
            />
          ) : (
            <span className="node-list-muted">未启用</span>
          )}
        </div>
      );
    }

    case "swap_used": {
      const swapTotal = node.swapTotal || node.swap_total || 0;
      return (
        <div key={colId} className="node-list-cell node-list-stack">
          {swapTotal > 0 ? (
            <>
              <StackLine value={formatBytes(node.swapUsed)} color="var(--progress-swap)" />
              <StackLine value={`/ ${formatBytes(swapTotal)}`} />
            </>
          ) : (
            <span className="node-list-muted">—</span>
          )}
        </div>
      );
    }

    case "disk_used":
      return (
        <div key={colId} className="node-list-cell node-list-stack">
          <StackLine value={formatBytes(node.diskUsed)} color="var(--progress-disk)" />
          <StackLine value={`/ ${formatBytes(node.diskTotal || node.disk_total)}`} />
        </div>
      );

    case "load5":
      return (
        <div key={colId} className={clsx("node-list-cell tabular", alignClass)}>
          <AnimatedValue text={node.load5.toFixed(2)} />
        </div>
      );

    case "load15":
      return (
        <div key={colId} className={clsx("node-list-cell tabular", alignClass)}>
          <AnimatedValue text={node.load15.toFixed(2)} />
        </div>
      );

    case "load_all":
      return (
        <div key={colId} className={clsx("node-list-cell tabular", alignClass)}>
          <span>
            {node.load1.toFixed(2)} / {node.load5.toFixed(2)} / {node.load15.toFixed(2)}
          </span>
        </div>
      );

    case "process":
      return (
        <div key={colId} className={clsx("node-list-cell tabular", alignClass)}>
          <AnimatedValue text={String(node.process)} />
        </div>
      );

    case "connections":
      return (
        <div key={colId} className="node-list-cell node-list-stack">
          <StackLine value={`TCP ${node.connectionsTcp}`} />
          <StackLine value={`UDP ${node.connectionsUdp}`} />
        </div>
      );

    case "connections_tcp":
      return (
        <div key={colId} className={clsx("node-list-cell tabular", alignClass)}>
          <AnimatedValue text={String(node.connectionsTcp)} />
        </div>
      );

    case "connections_udp":
      return (
        <div key={colId} className={clsx("node-list-cell tabular", alignClass)}>
          <AnimatedValue text={String(node.connectionsUdp)} />
        </div>
      );

    case "gpu_pct": {
      const hasGpu = Boolean(
        getReportedGpuLabel(node.gpu) || node.gpu_name?.trim() || node.gpuPct > 0,
      );
      return (
        <div key={colId} className="node-list-cell col-metric">
          {hasGpu ? (
            <ListGauge
              value={pctText(node.gpuPct)}
              fraction={node.gpuPct / 100}
              paint="var(--progress-cpu)"
            />
          ) : (
            <span className="node-list-muted">—</span>
          )}
        </div>
      );
    }

    case "gpu_mem":
      return (
        <div key={colId} className="node-list-cell node-list-stack">
          {node.gpuMemTotal > 0 ? (
            <>
              <StackLine value={formatBytes(node.gpuMemUsed)} />
              <StackLine value={`/ ${formatBytes(node.gpuMemTotal)}`} />
            </>
          ) : (
            <span className="node-list-muted">—</span>
          )}
        </div>
      );

    case "gpu_temp":
      return (
        <div key={colId} className={clsx("node-list-cell tabular", alignClass)}>
          {node.gpuTemp > 0 ? `${Math.round(node.gpuTemp)}°C` : "—"}
        </div>
      );

    // ── 网络、流量与延迟细分字段 ────────────────────────────────────────────
    case "net_up":
      return (
        <div key={colId} className={clsx("node-list-cell", alignClass)}>
          <StackLine
            icon={<ArrowUp size={11} strokeWidth={2.4} />}
            value={upRate.value}
            unit={upRate.unit}
            color={speedRateColor(upRate.unit)}
          />
        </div>
      );

    case "net_down":
      return (
        <div key={colId} className={clsx("node-list-cell", alignClass)}>
          <StackLine
            icon={<ArrowDown size={11} strokeWidth={2.4} />}
            value={downRate.value}
            unit={downRate.unit}
            color={speedRateColor(downRate.unit)}
          />
        </div>
      );

    case "speed": {
      const totalRate = formatByteRate((node.netUp || 0) + (node.netDown || 0));
      return (
        <div key={colId} className={clsx("node-list-cell", alignClass)}>
          <StackLine
            value={totalRate.value}
            unit={totalRate.unit}
            color={speedRateColor(totalRate.unit)}
          />
        </div>
      );
    }

    case "traffic_up":
      return (
        <div key={colId} className={clsx("node-list-cell tabular", alignClass)}>
          <StackLine
            icon={<ArrowUp size={11} strokeWidth={2.1} />}
            value={formatBytes(node.trafficUp)}
          />
        </div>
      );

    case "traffic_down":
      return (
        <div key={colId} className={clsx("node-list-cell tabular", alignClass)}>
          <StackLine
            icon={<ArrowDown size={11} strokeWidth={2.1} />}
            value={formatBytes(node.trafficDown)}
          />
        </div>
      );

    case "traffic_total":
      return (
        <div key={colId} className={clsx("node-list-cell tabular", alignClass)}>
          {formatBytes((node.trafficUp || 0) + (node.trafficDown || 0))}
        </div>
      );

    case "traffic_limit":
      return (
        <div key={colId} className={clsx("node-list-cell tabular", alignClass)}>
          {node.traffic_limit > 0 ? formatBytes(node.traffic_limit) : "不限"}
        </div>
      );

    case "traffic_used_pct":
      return (
        <div key={colId} className="node-list-cell col-metric">
          {node.traffic_limit > 0 ? (
            <ListGauge
              value={String(Math.round(clamp01(traffic.fraction) * 100))}
              fraction={traffic.fraction}
              paint={traffic.color}
            />
          ) : (
            <span className="node-list-muted">不限</span>
          )}
        </div>
      );

    case "traffic_limit_type":
      return (
        <div key={colId} className={clsx("node-list-cell", alignClass)}>
          {node.traffic_limit > 0 ? (
            <span className="node-list-badge">{trafficTypeLabel(node.traffic_limit_type)}</span>
          ) : (
            <span className="node-list-muted">未设限</span>
          )}
        </div>
      );

    case "ping_latency": {
      const lat = primaryPing?.lastValue ?? null;
      return (
        <div key={colId} className={clsx("node-list-cell tabular", alignClass)}>
          {lat != null ? (
            <span style={{ color: latencyHeatColor(lat) }}>{Math.round(lat)} ms</span>
          ) : (
            <span className="node-list-muted">—</span>
          )}
        </div>
      );
    }

    case "ping_avg": {
      const avg = primaryPing?.avg ?? null;
      return (
        <div key={colId} className={clsx("node-list-cell tabular", alignClass)}>
          {avg != null ? (
            <span style={{ color: latencyHeatColor(avg) }}>{Math.round(avg)} ms</span>
          ) : (
            <span className="node-list-muted">—</span>
          )}
        </div>
      );
    }

    case "ping_loss": {
      const loss = primaryLoss;
      return (
        <div key={colId} className={clsx("node-list-cell tabular", alignClass)}>
          {loss != null ? (
            <span style={{ color: lossHeatColor(loss) }}>{trimFixed(loss, 1)}%</span>
          ) : (
            <span className="node-list-muted">—</span>
          )}
        </div>
      );
    }

    // ── 计费与生命周期字段 ──────────────────────────────────────────────────
    case "uptime":
      return (
        <div key={colId} className={clsx("node-list-cell", alignClass)}>
          <StackLine value={uptime.value} unit={uptime.unit} color="var(--progress-cpu)" />
        </div>
      );

    case "expired_at":
      return (
        <div
          key={colId}
          className={clsx("node-list-cell", alignClass)}
          title={node.expired_at ? formatShortDate(node.expired_at) : undefined}
        >
          <StackLine value={expire.value} unit={expire.unit} color={expireColor} />
        </div>
      );

    case "price":
      return (
        <div key={colId} className={clsx("node-list-cell tabular", alignClass)}>
          {renewalPrice ? (
            <span className="dstatus-price-chip">
              <CircleDollarSign size={12} strokeWidth={2.2} />
              {renewalPrice}
            </span>
          ) : node.price === -1 ? (
            <span className="node-list-badge">免费</span>
          ) : (
            <span className="node-list-muted">—</span>
          )}
        </div>
      );

    case "billing_cycle": {
      const cycle = formatBillingCycle(node.billing_cycle);
      return (
        <div key={colId} className={clsx("node-list-cell", alignClass)}>
          {cycle ? (
            <span className="node-list-badge">{cycle}</span>
          ) : (
            <span className="node-list-muted">—</span>
          )}
        </div>
      );
    }

    case "currency":
      return (
        <div key={colId} className={clsx("node-list-cell tabular", alignClass)}>
          {node.currency?.trim() || "—"}
        </div>
      );

    case "auto_renewal":
      return (
        <div key={colId} className={clsx("node-list-cell", alignClass)}>
          {node.auto_renewal ? (
            <span className="node-list-badge is-ok">是</span>
          ) : (
            <span className="node-list-muted">否</span>
          )}
        </div>
      );

    case "created_at":
      return (
        <div key={colId} className={clsx("node-list-cell tabular", alignClass)}>
          {formatShortDate(node.created_at)}
        </div>
      );

    case "updated_at": {
      const reportedAt = node.updatedAt > 0 ? formatRelativeTime(node.updatedAt) : "";
      const editedAt = formatShortDate(node.updated_at);
      return (
        <div
          key={colId}
          className={clsx("node-list-cell tabular", alignClass)}
          title={editedAt !== "—" ? `资料更新于 ${editedAt}` : undefined}
        >
          {reportedAt || editedAt}
        </div>
      );
    }
  }
}

const NodeRow = memo(function NodeRow({
  uuid,
  columns,
}: {
  uuid: string;
  columns: readonly NodeFieldId[];
}) {
  const redrawKey = useCanvasRedrawKey();
  const model = useNodeCardModel(uuid, LIST_PING_BUCKETS);
  // 多任务时选中的任务序号。任务数变化(改绑定)后可能越界,取用处再夹一次。
  const [activePingIndex, setActivePingIndex] = useState(0);
  // 必须在骨架分支之前调用(hook 数量恒定):骨架期传 null 状态,不产生闪烁。
  const statusFlash = useNodeStatusFlash(
    model.node ? model.node.online : null,
    model.attention,
  );

  if (!model.node) {
    return (
      <div className="node-list-row skeleton-list-row" aria-busy>
        <span className="skeleton-block" style={{ width: 14, height: 14, borderRadius: 3 }} />
        <div className="skeleton-list-name">
          <span className="skeleton-block" style={{ width: "60%", height: 13 }} />
        </div>
        <div className="skeleton-list-metrics">
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} className="skeleton-block" style={{ width: 48, height: 11 }} />
          ))}
        </div>
      </div>
    );
  }

  const {
    node,
    traffic,
    pingSeries,
    hasHomepagePingBinding,
    expire,
    uptime,
    upRate,
    downRate,
    isOffline,
    osName,
    attention,
  } = model;
  const pingIndex = Math.min(activePingIndex, pingSeries.length - 1);
  const ping = pingSeries[pingIndex].ping;
  const detailLabels = nodeDetailLinkLabels(node.name, osName, {
    offline: isOffline,
    lastSeen: model.lastSeen,
  });
  // 未命中关注时保留原本的「查看详情」提示 —— 只有真的需要关注才占用 title。
  const attentionProps = attentionAttrs(attention);
  const usedPct = `${Math.round(clamp01(traffic.fraction) * 100)}%`;
  const statusLabel =
    node.online === true
      ? "在线"
      : node.online === false
        ? model.lastSeen
          ? `离线，最后在线 ${model.lastSeen}`
          : "离线"
        : "状态未知";
  const rowLabel = [
    node.name,
    `系统 ${formatOsLabel(osName, node.os)}`,
    `CPU ${pctText(node.cpuPct)}`,
    `内存 ${pctText(node.ramPct)}`,
    `磁盘 ${pctText(node.diskPct)}`,
    `负载 ${node.load1.toFixed(2)}`,
    `上行 ${upRate.value}${upRate.unit}`,
    `下行 ${downRate.value}${downRate.unit}`,
    `流量使用 ${usedPct}`,
    ...(hasHomepagePingBinding
      ? [`网络延迟 ${ping.lastValue == null ? "无样本" : `${Math.round(ping.lastValue)} 毫秒`}`]
      : []),
    statusLabel,
    `运行 ${uptime.value}${uptime.unit}`,
    `到期 ${expire.value}${expire.unit}`,
    "查看详情",
  ].join("，");

  return (
    <Link
      to={`/instance/${encodeURIComponent(uuid)}`}
      data-flip-id={uuid}
      // content-enter:骨架行换成真实行时 Link 首次挂载,淡入一次;实时刷新不重建。
      className={clsx(
        "node-list-row content-enter",
        isOffline && "is-offline",
        statusFlash.className,
      )}
      onAnimationEnd={statusFlash.onAnimationEnd}
      {...attentionProps}
      title={attentionProps.title ?? detailLabels.title}
      aria-label={rowLabel}
    >
      {columns.map((colId) =>
        renderDynamicCell(colId, model, pingIndex, setActivePingIndex, redrawKey),
      )}
    </Link>
  );
});

export function NodeListView({
  uuids,
  contentRevision,
}: {
  uuids: string[];
  contentRevision: unknown;
}) {
  // 列表档复用同一个 FLIP hook:行高一致、变换同为 translate,表头没有
  // data-flip-id 不参与追踪。
  const listRef = useRef<HTMLDivElement>(null);
  useLayoutTransition(listRef, uuids, undefined, contentRevision);

  const { columns } = useListColumns();
  const sort = useHomeSort();
  const { filter, requestFilterForField } = useNodeFilter();

  const listStyle = useMemo<DynamicListStyle>(() => {
    const defs = columns.map(getNodeFieldDefinition);
    const template = defs.map((d) => `minmax(${d.minWidth}px, ${d.fr}fr)`).join(" ");
    const totalMin =
      defs.reduce((sum, d) => sum + d.minWidth, 0) +
      Math.max(0, defs.length - 1) * 14 +
      36;
    return {
      "--node-list-grid-template": template,
      "--node-list-min-width": `${Math.max(640, totalMin)}px`,
    };
  }, [columns]);

  const filteredFieldSet = useMemo(
    () => new Set(filter.rules.map((r) => r.field)),
    [filter.rules],
  );

  return (
    <div className="node-list-scroll">
      <div className="node-list" ref={listRef} style={listStyle}>
        <div className="node-list-row node-list-head" role="row">
          {columns.map((colId) => {
            const def = getNodeFieldDefinition(colId);
            const isSorted = sort.field === colId;
            const hasRule = filteredFieldSet.has(colId);
            const alignClass =
              def.align === "center"
                ? "is-align-center"
                : def.align === "right"
                  ? "is-align-right"
                  : "is-align-left";
            return (
              <div
                key={colId}
                role="columnheader"
                aria-sort={
                  isSorted
                    ? sort.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                className={clsx(
                  "node-list-cell node-list-head-cell",
                  alignClass,
                  isSorted && "is-sorted",
                )}
              >
                <button
                  type="button"
                  className="node-list-head-sort-btn"
                  onClick={() => sort.cycleField(colId)}
                  title={`点击按「${def.label}」排序（${def.description}）`}
                >
                  <span className="node-list-head-label">{def.shortLabel}</span>
                  <span className="node-list-head-sort-indicator" aria-hidden>
                    {isSorted ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}
                  </span>
                </button>
                <button
                  type="button"
                  className={clsx("node-list-head-filter-btn", hasRule && "is-active")}
                  onClick={(e) => {
                    e.stopPropagation();
                    requestFilterForField(colId);
                  }}
                  title={`按「${def.label}」添加筛选条件`}
                  aria-label={`按${def.label}筛选`}
                >
                  <ListFilter size={11} />
                </button>
              </div>
            );
          })}
        </div>
        {uuids.map((uuid) => (
          <NodeRow key={uuid} uuid={uuid} columns={columns} />
        ))}
      </div>
    </div>
  );
}
