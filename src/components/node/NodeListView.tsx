import { memo, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, CircleDollarSign } from "@/components/ui/icons";
import { clsx } from "clsx";
import { Flag } from "@/components/ui/Flag";
import { OsLogo } from "@/components/ui/OsLogo";
import { AnimatedValue } from "@/components/ui/AnimatedValue";
import { useNodeCardModel, type NodePingSeries } from "@/hooks/useNodeCardModel";
import { useLayoutTransition } from "@/hooks/useLayoutTransition";
import { useNodeStatusFlash } from "@/hooks/useNodeStatusFlash";
import { useCanvasRedrawKey } from "@/hooks/useMetricColors";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { HomeSortControlState } from "@/hooks/useHomeSort";
import { formatBytes } from "@/utils/format";
import { HOME_SORT_FIELD_LABELS, type HomeSortField } from "@/utils/homeSort";
import {
  LIST_COLUMN_MAP,
  LIST_NODE_COLUMN,
  listGridTemplate,
  type ListColumnId,
} from "@/utils/listColumns";
import { speedRateColor } from "@/utils/metricTone";
import { IpStackBadges } from "./IpStackBadges";
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

// 列表网络列的延迟柱数:比卡片(24)少,配窄列宽,柱子仍清晰可读。
const LIST_PING_BUCKETS = 12;
// 与 .node-list-row 的 gap / 左右 padding / .node-list 边框一致，用来算整表最小宽度。
const LIST_GAP = 12;
const LIST_CHROME = 14 * 2 + 2;

// 格内对齐方式：col-num 居中显示短值，col-text 左对齐、超长省略。
const COLUMN_CLASS: Record<ListColumnId, string> = {
  os: "col-os",
  cpu: "col-metric",
  memory: "col-metric",
  disk: "col-metric",
  load: "col-load",
  live: "col-live node-list-stack",
  traffic: "col-traffic",
  net: "col-net",
  life: "col-life node-list-stack",
  cpu_name: "col-text",
  cores: "col-num",
  arch: "col-text",
  virt: "col-text",
  kernel: "col-text",
  mem_total: "col-num",
  disk_total: "col-num",
  swap: "col-metric",
  process: "col-num",
  connections: "col-num",
  ip: "col-num col-ip",
  price: "col-text",
  group: "col-text",
};

type ListGaugeStyle = CSSProperties & {
  "--list-gauge-color": string;
  "--list-gauge-fill": string;
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

const NodeRow = memo(function NodeRow({
  uuid,
  columns,
}: {
  uuid: string;
  columns: readonly ListColumnId[];
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
    footerTags,
    expire,
    expireColor,
    uptime,
    renewalPrice,
    loadFraction,
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
  const osLabel = formatOsLabel(osName, node.os);
  const statusLabel =
    node.online === true
      ? "在线"
      : node.online === false
        ? model.lastSeen
          ? `离线，最后在线 ${model.lastSeen}`
          : "离线"
        : "状态未知";
  const swapPct = node.swapTotal > 0 ? (node.swapUsed / node.swapTotal) * 100 : null;
  const textOrDash = (value: string | null | undefined) => value?.trim() || "—";
  const countOrDash = (value: number) => (value > 0 ? String(value) : "—");
  const bytesOrDash = (value: number) => (value > 0 ? formatBytes(value) : "—");
  const plain = (value: string) => (
    <span className="node-list-text tabular" title={value === "—" ? undefined : value}>
      {value}
    </span>
  );

  // 每列：读屏标签片段 + 格内容；行 aria-label 只读出当前显示的列。
  const renderColumn = (id: ListColumnId): { label: string | null; content: ReactNode; title?: string } => {
    switch (id) {
      case "os":
        return {
          label: `系统 ${osLabel}`,
          content: (
            <>
              <OsLogo value={node.os} size={16} />
              <span className="node-list-os-name" title={node.os || osName}>
                {osLabel}
              </span>
            </>
          ),
        };
      case "cpu":
        return {
          label: `CPU ${pctText(node.cpuPct)}`,
          content: <ListGauge value={pctText(node.cpuPct)} fraction={node.cpuPct / 100} paint="var(--progress-cpu)" />,
        };
      case "memory":
        return {
          label: `内存 ${pctText(node.ramPct)}`,
          content: <ListGauge value={pctText(node.ramPct)} fraction={node.ramPct / 100} paint="var(--progress-memory)" />,
        };
      case "disk":
        return {
          label: `磁盘 ${pctText(node.diskPct)}`,
          content: <ListGauge value={pctText(node.diskPct)} fraction={node.diskPct / 100} paint="var(--progress-disk)" />,
        };
      case "load":
        return {
          label: `负载 ${node.load1.toFixed(2)}`,
          content: (
            <ListGauge value={node.load1.toFixed(2)} unit="" fraction={loadFraction} paint="var(--progress-load)" />
          ),
        };
      case "live":
        return {
          label: `上行 ${upRate.value}${upRate.unit}，下行 ${downRate.value}${downRate.unit}`,
          content: (
            <>
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
            </>
          ),
        };
      case "traffic":
        return {
          label: `流量使用 ${usedPct}`,
          title: `剩余 ${traffic.remainingLabel} · ${traffic.detail}`,
          content: (
            <>
              <div className="node-list-traffic-rows">
                <StackLine icon={<ArrowUp size={11} strokeWidth={2.1} />} value={formatBytes(node.trafficUp)} />
                <StackLine icon={<ArrowDown size={11} strokeWidth={2.1} />} value={formatBytes(node.trafficDown)} />
              </div>
              <span className="node-list-traffic-quota" style={{ color: traffic.color }}>
                {usedPct}
              </span>
            </>
          ),
        };
      case "net":
        return {
          label: hasHomepagePingBinding
            ? `网络延迟 ${ping.lastValue == null ? "无样本" : `${Math.round(ping.lastValue)} 毫秒`}`
            : null,
          content: hasHomepagePingBinding && (
            <ListLatency
              pingSeries={pingSeries}
              activeIndex={pingIndex}
              onSelect={setActivePingIndex}
              redrawKey={redrawKey}
            />
          ),
        };
      case "life":
        return {
          label: `运行 ${uptime.value}${uptime.unit}，到期 ${expire.value}${expire.unit}`,
          content: (
            <>
              <StackLine value={uptime.value} unit={uptime.unit} color="var(--progress-cpu)" />
              <StackLine value={expire.value} unit={expire.unit} color={expireColor} />
            </>
          ),
        };
      case "cpu_name":
        return { label: `CPU 型号 ${textOrDash(node.cpu_name)}`, content: plain(textOrDash(node.cpu_name)) };
      case "cores":
        return { label: `核心 ${countOrDash(node.cpu_cores)}`, content: plain(countOrDash(node.cpu_cores)) };
      case "arch":
        return { label: `架构 ${textOrDash(node.arch)}`, content: plain(textOrDash(node.arch)) };
      case "virt":
        return { label: `虚拟化 ${textOrDash(node.virtualization)}`, content: plain(textOrDash(node.virtualization)) };
      case "kernel":
        return { label: `内核 ${textOrDash(node.kernel_version)}`, content: plain(textOrDash(node.kernel_version)) };
      case "mem_total":
        return { label: `内存容量 ${bytesOrDash(node.mem_total)}`, content: plain(bytesOrDash(node.mem_total)) };
      case "disk_total":
        return { label: `磁盘容量 ${bytesOrDash(node.disk_total)}`, content: plain(bytesOrDash(node.disk_total)) };
      case "swap":
        return swapPct == null
          ? { label: "Swap 未启用", content: plain("—") }
          : {
              label: `Swap ${pctText(swapPct)}`,
              title: `${formatBytes(node.swapUsed)} / ${formatBytes(node.swapTotal)}`,
              content: <ListGauge value={pctText(swapPct)} fraction={swapPct / 100} paint="var(--progress-swap)" />,
            };
      case "process":
        return { label: `进程 ${countOrDash(node.process)}`, content: plain(countOrDash(node.process)) };
      case "connections":
        return {
          label: `TCP 连接 ${node.connectionsTcp}，UDP 连接 ${node.connectionsUdp}`,
          content: plain(`${node.connectionsTcp} / ${node.connectionsUdp}`),
        };
      case "ip":
        return {
          label: node.ipv4 && node.ipv6 ? "双栈" : node.ipv4 ? "IPv4" : node.ipv6 ? "IPv6" : null,
          content: node.ipv4 || node.ipv6 ? <IpStackBadges ipv4={node.ipv4} ipv6={node.ipv6} /> : plain("—"),
        };
      case "price":
        return { label: renewalPrice ? `价格 ${renewalPrice}` : null, content: plain(renewalPrice ?? "—") };
      case "group":
        return { label: `分组 ${textOrDash(node.group)}`, content: plain(textOrDash(node.group)) };
    }
  };

  const cells = columns.map((id) => ({ id, ...renderColumn(id) }));
  const rowLabel = [
    node.name,
    ...cells.flatMap((cell) => (cell.label ? [cell.label] : [])),
    statusLabel,
    "查看详情",
  ].join("，");

  return (
    <Link
      to={`/instance/${encodeURIComponent(uuid)}`}
      data-flip-id={uuid}
      // content-enter:骨架行换成真实行时 Link 首次挂载,淡入一次;实时刷新不重建。
      className={clsx("node-list-row content-enter", isOffline && "is-offline", statusFlash.className)}
      onAnimationEnd={statusFlash.onAnimationEnd}
      {...attentionProps}
      title={attentionProps.title ?? detailLabels.title}
      aria-label={rowLabel}
    >
      <div className="node-list-cell node-list-node">
        <AttentionReasons attention={attention} />
        <div className="node-list-node-text">
          <div className="node-list-node-head">
            <Flag region={node.region} size={14} />
            <span className="node-list-name" title={node.name}>
              {node.name}
            </span>
          </div>
          {(renewalPrice || footerTags.length > 0) && (
            <div className="node-list-chips" title={footerTags.length > 0 ? joinTagTitle(footerTags) : undefined}>
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

      {cells.map((cell) => (
        <div key={cell.id} className={clsx("node-list-cell", COLUMN_CLASS[cell.id])} title={cell.title}>
          {cell.content}
        </div>
      ))}
    </Link>
  );
});

// 表头：可排序的列渲染成按钮；排序未开放时只是列标签(行本身的 aria-label 已读出数据)。
function HeadCell({
  className,
  label,
  field,
  sort,
}: {
  className: string;
  label: string;
  field?: HomeSortField;
  sort: HomeSortControlState | null;
}) {
  if (!sort || !field) {
    return (
      <div className={clsx("node-list-cell", className)} aria-hidden>
        {label}
      </div>
    );
  }
  const active = sort.field === field;
  const Arrow = sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <div className={clsx("node-list-cell", className)}>
      <button
        type="button"
        className="node-list-sort"
        data-active={active ? "true" : "false"}
        aria-label={`按${HOME_SORT_FIELD_LABELS[field]}排序${active ? `，当前${sort.direction === "asc" ? "升序" : "降序"}` : ""}`}
        onClick={() => sort.select(field)}
      >
        {label}
        {active && <Arrow size={11} strokeWidth={2.4} aria-hidden />}
      </button>
    </div>
  );
}

export function NodeListView({
  uuids,
  contentRevision,
  columns,
  sort,
}: {
  uuids: string[];
  contentRevision: unknown;
  columns: readonly ListColumnId[];
  /** null = 站长未开放访客排序，表头不可点。 */
  sort: HomeSortControlState | null;
}) {
  // 桌面变窄时按优先级隐藏 网络 → 负载(访客没选的列本来就不在)。
  const hideNet = useMediaQuery("(max-width: 1180px)");
  const hideLoad = useMediaQuery("(max-width: 1000px)");
  const visibleColumns = useMemo(
    () => columns.filter((id) => !(hideNet && id === "net") && !(hideLoad && id === "load")),
    [columns, hideNet, hideLoad],
  );
  const layoutStyle = useMemo(() => {
    const tracks = [LIST_NODE_COLUMN, ...visibleColumns.map((id) => LIST_COLUMN_MAP.get(id)!)];
    const minWidth =
      tracks.reduce((sum, track) => sum + track.min, 0) + LIST_GAP * (tracks.length - 1) + LIST_CHROME;
    return { "--node-list-columns": listGridTemplate(tracks), minWidth } as CSSProperties;
  }, [visibleColumns]);
  // 列表档复用同一个 FLIP hook:行高一致、变换同为 translate,表头没有
  // data-flip-id 不参与追踪。
  const listRef = useRef<HTMLDivElement>(null);
  useLayoutTransition(listRef, uuids, undefined, contentRevision);
  return (
    <div className="node-list-scroll">
      <div className="node-list" ref={listRef} style={layoutStyle}>
        <div className="node-list-row node-list-head">
          <HeadCell className="node-list-node" label={LIST_NODE_COLUMN.label} field={LIST_NODE_COLUMN.sort} sort={sort} />
          {visibleColumns.map((id) => {
            const column = LIST_COLUMN_MAP.get(id)!;
            return (
              <HeadCell key={id} className={COLUMN_CLASS[id]} label={column.label} field={column.sort} sort={sort} />
            );
          })}
        </div>
        {uuids.map((uuid) => (
          <NodeRow key={uuid} uuid={uuid} columns={visibleColumns} />
        ))}
      </div>
    </div>
  );
}
