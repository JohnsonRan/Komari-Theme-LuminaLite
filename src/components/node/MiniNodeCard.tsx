import { memo, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  CircleDollarSign,
  Clock3,
  Cpu,
  Gauge,
  HardDrive,
  MemoryStick,
  Unplug,
} from "lucide-react";
import { clsx } from "clsx";
import { Flag } from "@/components/ui/Flag";
import { OsLogo } from "@/components/ui/OsLogo";
import { IpStackBadges } from "./IpStackBadges";
import { PingTaskTabs } from "./PingTaskTabs";
import { NodeHistoryStrip } from "./NodeHistoryStrip";
import { attentionAttrs } from "@/utils/nodeAttention";
import { useNodeCardModel, type NodePingSeries } from "@/hooks/useNodeCardModel";
import { usePreferences } from "@/hooks/usePreferences";
import { useCanvasRedrawKey } from "@/hooks/useMetricColors";
import { latencyHeatColor, lossHeatColor, speedRateColor } from "@/utils/metricTone";
import {
  clamp01,
  compactPercentText,
  joinTagTitle,
  nodeDetailLinkLabels,
  pingEmptyLabels,
} from "./nodeCardShared";
import { formatPingHourStatsTitle } from "./pingBucketText";
import { formatBytes, type ByteRateDisplay } from "@/utils/format";
import type { NodeInfo, NodeMetrics, PingOverviewItem, PingOverviewBucket } from "@/types/komari";
import type { NodeHistory } from "@/utils/nodeHistory";

// 迷你卡固定为巡检布局，不跟随紧凑卡的可选指标开关；数据仍走共享模型。
const HEALTH_BAR_COUNT = 24;

type MiniNode = NodeInfo & NodeMetrics;
type MiniTag = { label: string; color: string };

function MiniHeader({ node, osName }: { node: MiniNode; osName: string }) {
  const detailLabels = nodeDetailLinkLabels(node.name, osName);
  const detailHref = `/instance/${encodeURIComponent(node.uuid)}`;
  return (
    <header className="mini-node-header">
      <Flag region={node.region} size={14} />
      <Link to={detailHref} className="mini-node-title" title={node.name}>
        {node.name}
      </Link>
      <Link
        to={detailHref}
        className="mini-node-os"
        title={detailLabels.title}
        aria-label={detailLabels.ariaLabel}
      >
        <OsLogo value={node.os} size={14} />
      </Link>
    </header>
  );
}

// 价格保底 chip 排最前；标签放不下时整枚隐藏，完整列表保留在 tooltip。
function MiniChips({
  tags,
  renewalPrice,
  ipv4,
  ipv6,
}: {
  tags: MiniTag[];
  renewalPrice: string | null;
  ipv4?: string | null;
  ipv6?: string | null;
}) {
  if (!renewalPrice && tags.length === 0 && !ipv4 && !ipv6) return null;
  const tagTitle = joinTagTitle(tags);
  return (
    <div className="mini-node-chip-row">
      {renewalPrice && (
        <span className="mini-node-price-tag" title={`续费价格 ${renewalPrice}`}>
          <CircleDollarSign size={11} strokeWidth={2.2} />
          {renewalPrice}
        </span>
      )}
      <IpStackBadges ipv4={ipv4} ipv6={ipv6} />
      {tags.length > 0 && (
        <div className="mini-node-tag-lane" title={tagTitle}>
          {tags.map((tag, index) => (
            <span key={`${tag.label}-${index}`} className="mini-node-tag" data-tag={tag.color}>
              {tag.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

type MiniMetricStyle = CSSProperties & {
  "--mini-metric-fill": string;
  "--mini-metric-color": string;
};

function MiniMetricBar({
  icon,
  label,
  valueText,
  unit,
  fraction,
  paint,
}: {
  icon: ReactNode;
  label: string;
  valueText: string;
  unit?: string;
  fraction: number;
  paint: string;
}) {
  const clamped = clamp01(fraction);
  const fullValue = `${valueText}${unit ?? ""}`;
  const style: MiniMetricStyle = {
    "--mini-metric-fill": `${clamped * 100}%`,
    "--mini-metric-color": paint,
  };

  return (
    <div className="metric-item mini-metric-item">
      <div className="mini-metric-head">
        <span className="mini-metric-label">
          {icon}
          {label}
        </span>
        <span className="mini-metric-value tabular" title={`${label} ${fullValue}`}>
          <strong>{valueText}</strong>
          {unit && <small>{unit}</small>}
        </span>
      </div>
      <span className="mini-metric-track" style={style} aria-hidden />
    </div>
  );
}

function MiniVitals({
  node,
  loadFraction,
}: {
  node: MiniNode;
  loadFraction: number;
}) {
  return (
    <div className="mini-node-vitals">
      <MiniMetricBar
        icon={<Cpu size={12} strokeWidth={2} />}
        label="CPU"
        valueText={compactPercentText(node.cpuPct)}
        unit="%"
        fraction={node.cpuPct / 100}
        paint="var(--progress-cpu)"
      />
      <MiniMetricBar
        icon={<MemoryStick size={12} strokeWidth={2} />}
        label="内存"
        valueText={compactPercentText(node.ramPct)}
        unit="%"
        fraction={node.ramPct / 100}
        paint="var(--progress-memory)"
      />
      <MiniMetricBar
        icon={<HardDrive size={12} strokeWidth={2} />}
        label="磁盘"
        valueText={compactPercentText(node.diskPct)}
        unit="%"
        fraction={node.diskPct / 100}
        paint="var(--progress-disk)"
      />
      <MiniMetricBar
        icon={<Gauge size={12} strokeWidth={2} />}
        label="负载"
        valueText={node.load1.toFixed(2)}
        fraction={loadFraction}
        paint="var(--progress-load)"
      />
    </div>
  );
}

function MiniFlowRow({
  icon,
  value,
  unit,
  color,
  title,
}: {
  icon: ReactNode;
  value: string;
  unit?: string;
  color?: string;
  title: string;
}) {
  return (
    <span
      className="mini-node-flow-row"
      style={color ? { color } : undefined}
      title={title}
      aria-label={`${title} ${value}${unit ?? ""}`}
    >
      <span className="mini-node-flow-arrow">{icon}</span>
      <strong className="tabular">
        {value}
        {unit && <small>{unit}</small>}
      </strong>
    </span>
  );
}

// 左栏集中显示实时速率，右栏集中显示累计流量；每栏均按上行、下行排列。
function MiniFlow({
  node,
  upRate,
  downRate,
}: {
  node: MiniNode;
  upRate: ByteRateDisplay;
  downRate: ByteRateDisplay;
}) {
  return (
    <div className="mini-node-flow">
      <div className="mini-node-flow-group" aria-label="实时网速">
        <MiniFlowRow
          icon={<ArrowUp size={12} strokeWidth={2.4} />}
          value={upRate.value}
          unit={upRate.unit}
          color={speedRateColor(upRate.unit)}
          title="实时上行"
        />
        <MiniFlowRow
          icon={<ArrowDown size={12} strokeWidth={2.4} />}
          value={downRate.value}
          unit={downRate.unit}
          color={speedRateColor(downRate.unit)}
          title="实时下行"
        />
      </div>
      <div className="mini-node-flow-group" aria-label="累计流量">
        <MiniFlowRow
          icon={<ArrowUp size={12} strokeWidth={2.2} />}
          value={formatBytes(node.trafficUp)}
          title="累计上行"
        />
        <MiniFlowRow
          icon={<ArrowDown size={12} strokeWidth={2.2} />}
          value={formatBytes(node.trafficDown)}
          title="累计下行"
        />
      </div>
    </div>
  );
}

function MiniHealthBars({
  buckets,
  kind,
  max,
}: {
  buckets: PingOverviewBucket[];
  kind: "latency" | "loss";
  max?: number;
}) {
  const width = Math.max(1, buckets.length * 4 - 1);
  const safeMax = max && max > 0 ? max : 1;

  return (
    <svg
      className="mini-health-bars"
      viewBox={`0 0 ${width} 16`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {buckets.map((bucket, index) => {
        const latency = bucket.value;
        const hasLatency = latency != null && Number.isFinite(latency) && latency >= 0;
        const loss = bucket.loss;
        const hasLoss = loss != null && Number.isFinite(loss) && bucket.total > 0;
        const active = kind === "latency" ? hasLatency : hasLoss;
        const barHeight =
          kind === "latency"
            ? 16 * (hasLatency ? Math.max(0.2, Math.min(1, latency / safeMax)) : 0.25)
            : 16 * 0.84;
        const tone =
          kind === "latency"
            ? hasLatency
              ? latencyHeatColor(latency)
              : "var(--progress-bg)"
            : hasLoss
              ? lossHeatColor(loss)
              : "var(--progress-bg)";

        return (
          <rect
            key={bucket.index}
            x={index * 4}
            y={16 - barHeight}
            width="3"
            height={barHeight}
            rx="1.25"
            fill={tone}
            opacity={active ? 0.94 : 0.48}
          />
        );
      })}
    </svg>
  );
}

// 延迟/丢包必显；mini 使用无监听的内联 SVG，避免每张卡创建 Canvas 与观察器。
const MiniHealth = memo(function MiniHealth({
  ping,
  pingBuckets,
  pingSeries,
  activePingIndex,
  onSelectPing,
  latencyColor,
  lossColor,
  hasHomepagePingBinding,
  history,
  redrawKey,
}: {
  ping: PingOverviewItem;
  pingBuckets: PingOverviewBucket[];
  pingSeries: NodePingSeries[];
  activePingIndex: number;
  onSelectPing: (index: number) => void;
  latencyColor: string;
  lossColor: string;
  hasHomepagePingBinding: boolean;
  history: NodeHistory;
  redrawKey: string;
}) {
  const { text: emptyText } = pingEmptyLabels(hasHomepagePingBinding);
  const hourStatsTitle = formatPingHourStatsTitle(ping);
  return (
    // 整组吸底，见 CompactNodeCard 里同名 tail 容器的说明。
    <div className="mini-node-tail">
      {pingSeries.length > 1 && (
        <div className="mini-node-ping-tabs">
          <PingTaskTabs
            series={pingSeries}
            activeIndex={activePingIndex}
            onSelect={onSelectPing}
            size="small"
          />
        </div>
      )}
      <div className="mini-node-health">
        <div className="mini-node-health-item">
          <div className="mini-node-health-head">
            <span className="mini-node-health-label">
              <Clock3 size={12} strokeWidth={2} />
              延迟
            </span>
            <strong
              className="mini-node-health-value tabular"
              style={{ color: latencyColor }}
              title={hourStatsTitle ?? undefined}
            >
              {ping.lastValue != null ? (
                <>
                  {Math.round(ping.lastValue)}
                  <small>ms</small>
                </>
              ) : (
                <span className="mini-node-health-empty">{emptyText}</span>
              )}
            </strong>
          </div>
          <MiniHealthBars kind="latency" max={ping.max} buckets={pingBuckets} />
        </div>
        <div className="mini-node-health-item">
          <div className="mini-node-health-head">
            <span className="mini-node-health-label">
              <Unplug size={12} strokeWidth={2} />
              丢包
            </span>
            <strong className="mini-node-health-value tabular" style={{ color: lossColor }}>
              {ping.loss != null ? (
                <>
                  {ping.loss.toFixed(1)}
                  <small>%</small>
                </>
              ) : (
                <span className="mini-node-health-empty">{emptyText}</span>
              )}
            </strong>
          </div>
          <MiniHealthBars kind="loss" buckets={pingBuckets} />
        </div>
      </div>
      {/* 迷你卡同样只画条，上报率在 tooltip 里。 */}
      <NodeHistoryStrip history={history} redrawKey={redrawKey} height={12} />
    </div>
  );
});

export const MiniNodeCard = memo(function MiniNodeCard({ uuid }: { uuid: string }) {
  const { resolvedAppearance } = usePreferences();
  const redrawKey = useCanvasRedrawKey();
  const model = useNodeCardModel(uuid, HEALTH_BAR_COUNT);
  // 多任务时选中的任务序号。任务数变化(改绑定)后可能越界,取用处再夹一次。
  const [activePingIndex, setActivePingIndex] = useState(0);

  if (!model.node) {
    return (
      <article className="mini-node-card skeleton-mini" aria-busy>
        <div className="skeleton-mini-header">
          <span className="skeleton-block" style={{ width: 14, height: 14, borderRadius: 3 }} />
          <span className="skeleton-block" style={{ width: "55%", height: 14 }} />
          <span className="skeleton-block" style={{ width: 14, height: 14, borderRadius: 3 }} />
        </div>
        <div className="skeleton-mini-chips">
          <span className="skeleton-block" style={{ width: 48, height: 20, borderRadius: 7 }} />
          <span className="skeleton-block" style={{ width: 36, height: 20, borderRadius: 7 }} />
        </div>
        <div className="skeleton-mini-vitals">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton-mini-gauge">
              <span className="skeleton-block" style={{ width: "70%", height: 10 }} />
              <span className="skeleton-block" style={{ width: "100%", height: 6, borderRadius: 3 }} />
            </div>
          ))}
        </div>
        <div className="skeleton-mini-flow">
          <span className="skeleton-block" style={{ width: "40%", height: 11 }} />
          <span className="skeleton-block" style={{ width: "40%", height: 11 }} />
        </div>
        <div className="skeleton-mini-health">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="skeleton-mini-health-item">
              <span className="skeleton-block" style={{ width: "60%", height: 10 }} />
              <span className="skeleton-block" style={{ width: "100%", height: 12, borderRadius: 3 }} />
            </div>
          ))}
        </div>
      </article>
    );
  }

  const {
    node,
    pingSeries,
    footerTags,
    renewalPrice,
    loadFraction,
    upRate,
    downRate,
    hasHomepagePingBinding,
    isOffline,
    osName,
    attention,
    history,
  } = model;
  const pingIndex = Math.min(activePingIndex, pingSeries.length - 1);
  const { ping, buckets: pingBuckets, latencyColor, lossColor } = pingSeries[pingIndex];

  return (
    <article
      className={clsx("mini-node-card", isOffline && "is-offline")}
      data-appearance={resolvedAppearance}
      {...attentionAttrs(attention)}
    >
      <MiniHeader node={node} osName={osName} />
      <MiniChips tags={footerTags} renewalPrice={renewalPrice} ipv4={node.ipv4} ipv6={node.ipv6} />
      <MiniVitals node={node} loadFraction={loadFraction} />
      <MiniFlow node={node} upRate={upRate} downRate={downRate} />
      <MiniHealth
        ping={ping}
        pingBuckets={pingBuckets}
        pingSeries={pingSeries}
        activePingIndex={pingIndex}
        onSelectPing={setActivePingIndex}
        latencyColor={latencyColor}
        lossColor={lossColor}
        hasHomepagePingBinding={hasHomepagePingBinding}
        history={history}
        redrawKey={redrawKey}
      />
    </article>
  );
});
