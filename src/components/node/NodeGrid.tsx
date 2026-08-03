import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatedValue } from "@/components/ui/AnimatedValue";
import { Flag } from "@/components/ui/Flag";
import { useAuth } from "@/hooks/useAuth";
import {
  useAllNodeMeta,
  useHomeNodeStructures,
  useHomeNodeSummaries,
  useNodeStoreStatus,
} from "@/hooks/useNode";
import type { HomeNodeStructure, HomeNodeSummary } from "@/services/wsStore";
import { useHomepagePingOverview } from "@/hooks/usePingOverview";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { useViewMode } from "@/hooks/useViewMode";
import {
  formatBytes,
  formatByteRate,
  formatByteRateLabel,
} from "@/utils/format";
import { collectMatchingNodeUuids } from "@/utils/nodeIdentity";
import { speedRateColor } from "@/utils/metricTone";
import {
  getHomeGroupLabel,
  getHomeGroupOptions,
  getHomeRegionOptions,
  HOME_ALL_GROUP,
  HOME_ALL_REGION,
  sortHomeGroupOptions,
  type HomeRegionOption,
} from "@/utils/homeNodes";
import { getDisplayRegionCode } from "@/utils/geo";
import { useHomeSort } from "@/hooks/useHomeSort";
import { useHomeNodeOrder } from "@/hooks/useHomeNodeOrder";
import { useLayoutTransition } from "@/hooks/useLayoutTransition";
import { AttentionProvider, useNodeAttention } from "@/hooks/useNodeAttention";
import { useHourlyClock } from "@/hooks/useClock";
import { preloadTodayTrafficStats } from "@/hooks/useTodayTrafficStats";
import { useVersion } from "@/hooks/useVersion";
import { HomeSortControl } from "./HomeSortControl";
import { CompactNodeCard } from "./CompactNodeCard";
import { MiniNodeCard } from "./MiniNodeCard";
import { NodeCard } from "./NodeCard";
import { NodeListView } from "./NodeListView";
import type { NodeViewMode } from "@/utils/themeSettings";

// 卡片视图网格密度；列表档由独立组件布局。
const GRID_LAYOUT: Record<NodeViewMode, { className: string; minColumnWidth: number }> = {
  large: { className: "grid gap-4 xl:gap-5", minColumnWidth: 360 },
  compact: { className: "grid gap-3 xl:gap-4", minColumnWidth: 340 },
  mini: { className: "grid gap-3 xl:gap-3.5", minColumnWidth: 260 },
  // 占位以满足 Record 穷尽。
  list: { className: "", minColumnWidth: 0 },
};

type MiniGridStyle = CSSProperties & { "--mini-card-min-width": string };

// 标准 UUID 不含逗号，可安全拼成稳定签名。
const UUID_KEY_SEPARATOR = ",";

/** 结构态补齐 live 字段为 0：仅用于 default/name 排序与离线沉底，绝不喂给总览/异常判定。 */
function structureAsSortable(node: HomeNodeStructure): HomeNodeSummary {
  return {
    ...node,
    trafficUp: 0,
    trafficDown: 0,
    netUp: 0,
    netDown: 0,
    connectionsTcp: 0,
    connectionsUdp: 0,
    cpuPct: 0,
    ramPct: 0,
    diskPct: 0,
    pingLoss: null,
  };
}

interface HomeOverview {
  totalNodes: number;
  onlineNodes: number;
  offlineNodes: number;
  trafficUp: number;
  trafficDown: number;
  netUp: number;
  netDown: number;
  connectionsTcp: number;
  connectionsUdp: number;
}

function formatCompactBytes(value: number): string {
  const [amount, unit = "B"] = formatBytes(value).split(" ");
  return `${amount}${unit[0]}`;
}

interface TopNodeEntry {
  uuid: string;
  name: string;
  value: number;
}

interface OverviewTopMetric {
  // 累计流量是历史量，离线节点同样计入；实时指标只看在线节点。
  onlineOnly: boolean;
  valueOf: (node: HomeNodeSummary) => number;
  format: (value: number) => string;
}

const OVERVIEW_TOP_METRICS = {
  bandwidth: {
    onlineOnly: true,
    valueOf: (node) => node.netUp + node.netDown,
    format: formatByteRateLabel,
  },
  traffic: {
    onlineOnly: false,
    valueOf: (node) => node.trafficUp + node.trafficDown,
    format: formatBytes,
  },
  connections: {
    onlineOnly: true,
    valueOf: (node) => node.connectionsTcp + node.connectionsUdp,
    format: (value) => value.toLocaleString(),
  },
} as const satisfies Record<string, OverviewTopMetric>;

type OverviewTopMetricKey = keyof typeof OVERVIEW_TOP_METRICS;

// 单次遍历维护前三名，省掉整表 sort；只在悬停时调用。
function pickTopNodes(
  nodes: HomeNodeSummary[],
  nameByUuid: Map<string, string>,
  metric: OverviewTopMetric,
): TopNodeEntry[] {
  const top: TopNodeEntry[] = [];
  for (const node of nodes) {
    if (metric.onlineOnly && node.online !== true) continue;
    const value = metric.valueOf(node);
    if (top.length >= 3 && value <= top[2].value) continue;
    const at = top.findIndex((entry) => value > entry.value);
    top.splice(at === -1 ? top.length : at, 0, {
      uuid: node.uuid,
      name: nameByUuid.get(node.uuid) || node.uuid.slice(0, 8),
      value,
    });
    if (top.length > 3) top.pop();
  }
  return top;
}

type TopShareStyle = CSSProperties & { "--top-share": string };

// 名次由行序表达，无需再画一列 1/2/3；每行铺一条占比底纹（相对第一名），
// 让「第一名是碾压还是接近」一眼可见——这才是悬停这张卡想问的问题。
function OverviewTopTooltip({ metric, rows }: { metric: OverviewTopMetricKey; rows: TopNodeEntry[] }) {
  if (rows.length === 0) return null;
  const { format } = OVERVIEW_TOP_METRICS[metric];
  const peak = rows[0].value;
  return (
    <div className="overview-card-tooltip">
      <div className="overview-card-tooltip-title">TOP 3 节点</div>
      {rows.map((node) => {
        // 全为 0（如整批节点空闲）时不画底纹，避免三行都是空槽。
        const share = peak > 0 ? Math.max(4, (node.value / peak) * 100) : 0;
        const style: TopShareStyle = { "--top-share": `${share}%` };
        return (
          <div key={node.uuid} className="overview-card-tooltip-row">
            <span className="overview-card-tooltip-track" style={style}>
              <span className="overview-card-tooltip-name">{node.name}</span>
            </span>
            <strong className="overview-card-tooltip-value tabular">{format(node.value)}</strong>
          </div>
        );
      })}
    </div>
  );
}

function formatCompactCount(value: number): string {
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}k`;
  return value.toLocaleString();
}

function TrafficBarsIcon({ size = 19 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
    >
      <rect x="2" y="10" width="4" height="8" rx="1.2" fill="currentColor" />
      <rect x="8" y="5.5" width="4" height="12.5" rx="1.2" fill="currentColor" />
      <rect x="14" y="2" width="4" height="16" rx="1.2" fill="currentColor" />
    </svg>
  );
}

// 站点铭牌由 CSS 放进 AppShell 顶部留白，不占概览卡内容流。
function HomeBrand({ siteName }: { siteName: string }) {
  const { data: version } = useVersion();
  return (
    <header className="home-brand" aria-label="站点名称">
      <h1 className="home-brand-title" title={siteName}>
        {siteName}
      </h1>
      {version?.version && (
        <span className="home-brand-version" title={`Komari ${version.version} (${version.hash.slice(0, 7)})`}>
          v{version.version}
        </span>
      )}
    </header>
  );
}

/** 总览卡独立订 live：父级 NodeGrid 在 default 排序时不必每 2s 跟着网速抖动重渲染。 */
function HomeOverviewLive({
  dense,
  onWarmTraffic,
  nameByUuid,
  visibleUuidSet,
}: {
  dense: boolean;
  onWarmTraffic: () => void;
  nameByUuid: Map<string, string>;
  visibleUuidSet: Set<string>;
}) {
  const nodes = useHomeNodeSummaries(true);
  const visibleNodes = useMemo(
    () => nodes.filter((node) => visibleUuidSet.has(node.uuid)),
    [nodes, visibleUuidSet],
  );
  const overview = useMemo<HomeOverview>(() => {
    let onlineNodes = 0;
    let offlineNodes = 0;
    let trafficUp = 0;
    let trafficDown = 0;
    let netUp = 0;
    let netDown = 0;
    let connectionsTcp = 0;
    let connectionsUdp = 0;
    for (const node of visibleNodes) {
      if (node.online === true) onlineNodes += 1;
      else if (node.online === false) offlineNodes += 1;
      trafficUp += node.trafficUp;
      trafficDown += node.trafficDown;
      if (node.online === true) {
        netUp += node.netUp;
        netDown += node.netDown;
        connectionsTcp += node.connectionsTcp;
        connectionsUdp += node.connectionsUdp;
      }
    }
    return {
      totalNodes: visibleNodes.length,
      onlineNodes,
      offlineNodes,
      trafficUp,
      trafficDown,
      netUp,
      netDown,
      connectionsTcp,
      connectionsUdp,
    };
  }, [visibleNodes]);

  return (
    <HomeOverviewCards
      overview={overview}
      dense={dense}
      onWarmTraffic={onWarmTraffic}
      nodes={visibleNodes}
      nameByUuid={nameByUuid}
    />
  );
}

function HomeOverviewCards({
  overview,
  dense,
  onWarmTraffic,
  nodes,
  nameByUuid,
}: {
  overview: HomeOverview;
  dense: boolean;
  onWarmTraffic: () => void;
  nodes: HomeNodeSummary[];
  nameByUuid: Map<string, string>;
}) {
  const [trafficValue, trafficUnit] = formatBytes(
    overview.trafficUp + overview.trafficDown,
  ).split(" ");
  const rate = formatByteRate(overview.netUp + overview.netDown);
  const onlinePct =
    overview.totalNodes > 0 ? (overview.onlineNodes / overview.totalNodes) * 100 : 0;
  const offlinePct =
    overview.totalNodes > 0 ? (overview.offlineNodes / overview.totalNodes) * 100 : 0;
  const connectionsTotal = overview.connectionsTcp + overview.connectionsUdp;
  const trafficDetailLabel = `↑ ${formatBytes(overview.trafficUp)} · ↓ ${formatBytes(overview.trafficDown)}`;
  const trafficCompactLabel = `↑${formatCompactBytes(overview.trafficUp)} ↓${formatCompactBytes(overview.trafficDown)}`;
  const bandwidthDetailLabel = `↑ ${formatByteRateLabel(overview.netUp)} · ↓ ${formatByteRateLabel(overview.netDown)}`;
  const bandwidthCompactLabel = `↑${formatCompactBytes(overview.netUp)} ↓${formatCompactBytes(overview.netDown)}`;
  const connectionsDetailLabel = `TCP ${overview.connectionsTcp.toLocaleString()} · UDP ${overview.connectionsUdp.toLocaleString()}`;
  const connectionsCompactLabel = `TCP ${formatCompactCount(overview.connectionsTcp)} UDP ${formatCompactCount(overview.connectionsUdp)}`;

  // TOP 3 只在悬停那张卡片时才算：nodes 每个 WS tick 都会换引用，
  // 无条件计算三份榜单等于每 2s 白跑三趟全表。
  const [hoveredCard, setHoveredCard] = useState<OverviewTopMetricKey | null>(null);
  const topNodes = useMemo(
    () => (hoveredCard ? pickTopNodes(nodes, nameByUuid, OVERVIEW_TOP_METRICS[hoveredCard]) : []),
    [hoveredCard, nodes, nameByUuid],
  );

  return (
    <section className={`home-overview${dense ? " is-dense" : ""}`} aria-label="首页总览">
      <article className="overview-card" data-metric="online">
        <span className="overview-card-label">在线节点</span>
        <div className="overview-card-main">
          <p className="overview-card-value">
            <AnimatedValue text={String(overview.onlineNodes)} />
            <span className="overview-card-unit">/ {overview.totalNodes}</span>
          </p>
        </div>
        {overview.totalNodes >= 5 && overview.totalNodes <= 10 ? (
          // 节点数 5–10 时改用块状:每台一格,在线格在左、离线格在右、未知格居中,
          // 与条状的「左绿右红」完全同步。颜色复用同一组 token,避免该红却绿。
          <div className="overview-blocks" role="presentation">
            {Array.from({ length: overview.totalNodes }, (_, i) => {
              const cls =
                i < overview.onlineNodes
                  ? "overview-block is-online"
                  : i >= overview.totalNodes - overview.offlineNodes
                    ? "overview-block is-offline"
                    : "overview-block";
              return <span key={i} className={cls} />;
            })}
          </div>
        ) : (
          <div className="overview-bar" role="presentation">
            <span className="overview-bar-online" style={{ width: `${onlinePct}%` }} />
            <span className="overview-bar-offline" style={{ width: `${offlinePct}%` }} />
          </div>
        )}
      </article>

      <article
        className="overview-card"
        data-metric="bandwidth"
        onPointerEnter={() => setHoveredCard("bandwidth")}
        onPointerLeave={() => setHoveredCard(null)}
      >
        <div className="overview-card-head">
          <span className="overview-card-label">实时带宽</span>
        </div>
        <div className="overview-card-main">
          <p
            className="overview-card-value"
            style={{ color: speedRateColor(rate.unit) }}
          >
            <AnimatedValue text={rate.value} />
            <span className="overview-card-unit">{rate.unit}</span>
          </p>
        </div>
        <div className="overview-card-footer">
          <p className="overview-card-sub" title={bandwidthDetailLabel}>
            <span className="overview-card-sub-full">{bandwidthDetailLabel}</span>
            <span className="overview-card-sub-compact">{bandwidthCompactLabel}</span>
          </p>
        </div>
        {hoveredCard === "bandwidth" && <OverviewTopTooltip metric="bandwidth" rows={topNodes} />}
      </article>

      <article
        className="overview-card"
        data-metric="traffic"
        onPointerEnter={() => setHoveredCard("traffic")}
        onPointerLeave={() => setHoveredCard(null)}
      >
        <div className="overview-card-head">
          <span className="overview-card-label">累计流量</span>
          <Link
            to="/traffic"
            className="overview-card-action"
            aria-label="打开今日流量统计页"
            title="今日流量统计"
            onPointerEnter={onWarmTraffic}
            onFocus={onWarmTraffic}
          >
            <TrafficBarsIcon />
          </Link>
        </div>
        <div className="overview-card-main">
          <p className="overview-card-value">
            <AnimatedValue text={trafficValue} />
            <span className="overview-card-unit">{trafficUnit}</span>
          </p>
        </div>
        <div className="overview-card-footer">
          <p className="overview-card-sub" title={trafficDetailLabel}>
            <span className="overview-card-sub-full">{trafficDetailLabel}</span>
            <span className="overview-card-sub-compact">{trafficCompactLabel}</span>
          </p>
        </div>
        {hoveredCard === "traffic" && <OverviewTopTooltip metric="traffic" rows={topNodes} />}
      </article>

      <article
        className="overview-card"
        data-metric="connections"
        onPointerEnter={() => setHoveredCard("connections")}
        onPointerLeave={() => setHoveredCard(null)}
      >
        <div className="overview-card-head">
          <span className="overview-card-label">实时连接</span>
          <Link
            to="/connections"
            className="overview-card-action"
            aria-label="打开今日连接统计页"
            title="今日连接统计"
            onPointerEnter={onWarmTraffic}
            onFocus={onWarmTraffic}
          >
            <TrafficBarsIcon />
          </Link>
        </div>
        <div className="overview-card-main">
          <p className="overview-card-value">
            <AnimatedValue text={connectionsTotal.toLocaleString()} />
          </p>
        </div>
        <div className="overview-card-footer">
          <p className="overview-card-sub" title={connectionsDetailLabel}>
            <span className="overview-card-sub-full">{connectionsDetailLabel}</span>
            <span className="overview-card-sub-compact">{connectionsCompactLabel}</span>
          </p>
        </div>
        {hoveredCard === "connections" && <OverviewTopTooltip metric="connections" rows={topNodes} />}
      </article>
    </section>
  );
}

function GroupTabs({
  groups,
  selectedGroup,
  onSelectGroup,
}: {
  groups: string[];
  selectedGroup: string;
  onSelectGroup: (group: string) => void;
}) {
  return (
    <div className="home-group-tabs" role="group" aria-label="节点分组">
      <button
        type="button"
        aria-pressed={selectedGroup === HOME_ALL_GROUP}
        data-active={selectedGroup === HOME_ALL_GROUP ? "true" : "false"}
        onClick={() => onSelectGroup(HOME_ALL_GROUP)}
      >
        全部
      </button>
      {groups.map((group) => (
        <button
          key={group}
          type="button"
          aria-pressed={selectedGroup === group}
          data-active={selectedGroup === group ? "true" : "false"}
          onClick={() => onSelectGroup(group)}
          title={group}
        >
          {group}
        </button>
      ))}
    </div>
  );
}

// 地区筛选栏:按国旗聚合节点,点击某地区只看该地区;再点一次(或点已选中项)回到全部。
// 与分组栏是两条独立筛选,可叠加(先分组、后地区)。
function RegionTabs({
  regions,
  selectedRegion,
  onSelectRegion,
}: {
  regions: HomeRegionOption[];
  selectedRegion: string;
  onSelectRegion: (region: string) => void;
}) {
  return (
    <section className="home-region-bar" aria-label="地区筛选">
      <div className="home-region-chips" role="group">
        {regions.map(({ code, count }) => {
          const active = selectedRegion === code;
          return (
            <button
              key={code}
              type="button"
              className="home-region-chip"
              data-active={active ? "true" : "false"}
              aria-pressed={active}
              onClick={() => onSelectRegion(active ? HOME_ALL_REGION : code)}
              title={code}
            >
              <Flag region={code} size={14} />
              <span className="home-region-chip-code">{code}</span>
              <span className="home-region-chip-count">{count}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function NodeGrid() {
  const queryClient = useQueryClient();
  // 结构态：分组/地区/权重/在线。网速抖动不推这里。
  const structures = useHomeNodeStructures();
  const allMeta = useAllNodeMeta();
  const {
    hydrated: storeHydrated,
    nodeInfoError,
    failureStreak,
  } = useNodeStoreStatus();
  // 与悬浮控件一致：连续失败 ≥2 视为整站实时通道异常，不是单节点离线。
  const showSiteSyncBanner = failureStreak >= 2;
  const { data: me } = useAuth();
  const { data: publicConfig } = usePublicConfig();
  const siteName = publicConfig?.sitename?.trim() || "节点概览";
  const themeSettings = useThemeSettings();
  // 到期天数按天变化，用小时钟即可；CPU/内存等每帧数据由 sortedNodes 的引用变化驱动重算。
  const attentionClock = useHourlyClock();
  const { mode } = useViewMode();
  const sort = useHomeSort();
  // enableHomeSort 控制访客能否改排序;关闭时无视 session 覆盖、直接用管理员默认序(默认仍是 weight)。
  const sortEnabled = themeSettings.isReady && themeSettings.enableHomeSort;
  const sortField = sortEnabled ? sort.field : themeSettings.homeSortField;
  const sortDirection = sortEnabled ? sort.direction : themeSettings.homeSortDirection;
  const [selectedGroup, setSelectedGroup] = useState(HOME_ALL_GROUP);
  const [selectedRegion, setSelectedRegion] = useState(HOME_ALL_REGION);
  useHomepagePingOverview();

  const attentionEnabled = themeSettings.isReady && themeSettings.enableAttentionSort;
  // 实时排序 / 异常置顶需要 live 字段；总览拆到 HomeOverviewLive 自己订。
  const needsLiveOrder =
    sortField === "speed" || sortField === "traffic" || attentionEnabled;
  const liveNodes = useHomeNodeSummaries(needsLiveOrder);

  // 摘要不含名称，先从完整 meta 解析主题隐藏列表，再统一过滤各类数据。
  const hiddenUuids = useMemo(
    () => collectMatchingNodeUuids(allMeta, themeSettings.hiddenNodes),
    [allMeta, themeSettings.hiddenNodes],
  );
  const visibleStructures = useMemo(
    () =>
      structures.filter(
        (node) => (me?.logged_in === true || !node.hidden) && !hiddenUuids.has(node.uuid),
      ),
    [me?.logged_in, structures, hiddenUuids],
  );
  const visibleUuidSet = useMemo(
    () => new Set(visibleStructures.map((node) => node.uuid)),
    [visibleStructures],
  );
  // 资产统计与卡片使用同一可见性规则，避免泄露隐藏节点信息。
  const visibleMeta = useMemo(
    () =>
      allMeta.filter(
        (node) => (me?.logged_in === true || !node.hidden) && !hiddenUuids.has(node.uuid),
      ),
    [allMeta, me?.logged_in, hiddenUuids],
  );
  const trafficUuids = useMemo(
    () => visibleMeta.map((node) => node.uuid),
    [visibleMeta],
  );
  const warmTrafficPage = useCallback(() => {
    void preloadTodayTrafficStats(queryClient, trafficUuids, Date.now());
  }, [queryClient, trafficUuids]);
  // 「名称」排序需要展示名(摘要无 name),从 meta 注入。
  const nameByUuid = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of visibleMeta) map.set(node.uuid, node.name?.trim() || node.uuid);
    return map;
  }, [visibleMeta]);
  const showHomeOverview = themeSettings.isReady && themeSettings.showHomeOverview;
  const hasNodes = visibleMeta.length > 0;

  useEffect(() => {
    if (!showHomeOverview || !hasNodes) return;

    // 今日页体积很小，首页稳定后尽早预取数据，让点击入口时直接命中查询缓存。
    const handle = window.setTimeout(warmTrafficPage, 250);
    return () => window.clearTimeout(handle);
  }, [hasNodes, showHomeOverview, warmTrafficPage]);

  const groupOptions = useMemo(
    () =>
      sortHomeGroupOptions(
        getHomeGroupOptions(visibleStructures),
        themeSettings.isReady ? themeSettings.homeGroupOrder : [],
      ),
    [visibleStructures, themeSettings.homeGroupOrder, themeSettings.isReady],
  );
  const groupFilteredStructures = useMemo(
    () =>
      selectedGroup === HOME_ALL_GROUP
        ? visibleStructures
        : visibleStructures.filter((node) => getHomeGroupLabel(node.group) === selectedGroup),
    [visibleStructures, selectedGroup],
  );
  // 地区选项在分组筛选之后统计,让国旗计数反映当前分组内的分布。
  const regionOptions = useMemo(
    () => getHomeRegionOptions(groupFilteredStructures),
    [groupFilteredStructures],
  );
  const filteredStructures = useMemo(
    () =>
      selectedRegion === HOME_ALL_REGION
        ? groupFilteredStructures
        : groupFilteredStructures.filter(
            (node) => getDisplayRegionCode(node.region) === selectedRegion,
          ),
    [groupFilteredStructures, selectedRegion],
  );

  // 排序输入：default/name 走结构态；speed/traffic/attention 才拼 live。
  const sortSourceNodes = useMemo(() => {
    if (!needsLiveOrder) {
      return filteredStructures.map(structureAsSortable);
    }
    const allowed = new Set(filteredStructures.map((node) => node.uuid));
    return liveNodes.filter((node) => allowed.has(node.uuid));
  }, [needsLiveOrder, filteredStructures, liveNodes]);

  // 排序在分组筛选之后。离线永远沉底(写死,见 homeSort);实时网速走防抖(键平滑+滞回+5s 重排)。
  const sortedNodes = useHomeNodeOrder({
    nodes: sortSourceNodes,
    field: sortField,
    direction: sortDirection,
    nameByUuid,
  });

  const attentionByUuid = useNodeAttention(
    sortedNodes,
    allMeta,
    themeSettings.attentionThresholds,
    attentionEnabled,
    attentionClock,
  );

  // 异常置顶是排序之上的一层稳定分区：先按站长选的维度排好，再把命中的整体提前，
  // 组内保持原有相对顺序。速度滞回、离线沉底等既有行为都原样保留 —— 离线不算异常，
  // 所以这一层不会把沉底的离线节点又捞回前面（见 nodeAttention 的 AttentionLevel）。
  const orderedNodes = useMemo(() => {
    if (attentionByUuid.size === 0) return sortedNodes;
    const flagged: HomeNodeSummary[] = [];
    const rest: HomeNodeSummary[] = [];
    for (const node of sortedNodes) {
      if (attentionByUuid.has(node.uuid)) flagged.push(node);
      else rest.push(node);
    }
    return [...flagged, ...rest];
  }, [sortedNodes, attentionByUuid]);

  useEffect(() => {
    if (selectedGroup !== HOME_ALL_GROUP && !groupOptions.includes(selectedGroup)) {
      setSelectedGroup(HOME_ALL_GROUP);
    }
  }, [groupOptions, selectedGroup]);

  // 选中的地区在当前分组里不存在了(切换分组/节点变化)就回到全部。
  useEffect(() => {
    if (
      selectedRegion !== HOME_ALL_REGION &&
      !regionOptions.some((option) => option.code === selectedRegion)
    ) {
      setSelectedRegion(HOME_ALL_REGION);
    }
  }, [regionOptions, selectedRegion]);

  // 地区栏被配置关闭(热更新)时,清掉可能残留的地区筛选,否则会留下一个不可见的过滤条件。
  useEffect(() => {
    if (!themeSettings.showRegionBar && selectedRegion !== HOME_ALL_REGION) {
      setSelectedRegion(HOME_ALL_REGION);
    }
  }, [themeSettings.showRegionBar, selectedRegion]);

  useEffect(() => {
    if (!themeSettings.showGroupTabs && selectedGroup !== HOME_ALL_GROUP) {
      setSelectedGroup(HOME_ALL_GROUP);
    }
  }, [themeSettings.showGroupTabs, selectedGroup]);

  // 卡片列表只随 UUID 集合/顺序变化；卡片内部各自订阅实时数据。
  const uuidsKey = useMemo(
    () => orderedNodes.map((node) => node.uuid).join(UUID_KEY_SEPARATOR),
    [orderedNodes],
  );
  const orderedUuids = useMemo(
    () => (uuidsKey ? uuidsKey.split(UUID_KEY_SEPARATOR) : []),
    [uuidsKey],
  );
  // 列表档由下方 NodeListView 渲染,这里不必构造卡片元素。
  const cards = useMemo(
    () =>
      mode === "list"
        ? null
        : orderedUuids.map((uuid) => (
            <div key={uuid} className="min-w-0" data-flip-id={uuid}>
              {mode === "mini" ? (
                <MiniNodeCard uuid={uuid} />
              ) : mode === "compact" ? (
                <CompactNodeCard uuid={uuid} />
              ) : (
                <NodeCard uuid={uuid} />
              )}
            </div>
          )),
    [orderedUuids, mode],
  );
  const showGroupTabs =
    themeSettings.isReady && themeSettings.showGroupTabs && groupOptions.length > 0;
  const showHomeSort = sortEnabled && visibleStructures.length > 1;
  // 地区栏:只有一个地区时筛选无意义,>1 才显示。
  const showRegionBar =
    themeSettings.isReady && themeSettings.showRegionBar && regionOptions.length > 1;
  // 分组标签栏与卡片网格共用列定义，让标签栏左缘对齐首卡。
  const isMini = mode === "mini";
  const isList = mode === "list";
  const { className: gridClassName, minColumnWidth } = GRID_LAYOUT[mode];
  const gridWrapClassName = isMini ? `${gridClassName} node-grid-mini` : gridClassName;
  const gridStyle = isList
    ? undefined
    : isMini
      ? ({ "--mini-card-min-width": `${minColumnWidth}px` } as MiniGridStyle)
      : { gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${minColumnWidth}px), 1fr))` };
  // 迷你与列表档的控件栏借用小卡列宽，避免跟随密集内容列而被压窄。
  const borrowControlsGrid = isMini || isList;
  const controlsWrapClassName = borrowControlsGrid
    ? "grid gap-3 home-controls-bar mb-4"
    : `${gridWrapClassName} home-controls-bar mb-4`;
  const controlsStyle = borrowControlsGrid
    ? { gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, 340px), 1fr))` }
    : gridStyle;

  // FLIP 重排:排序/筛选/卡片视图切换时,留下来的卡片滑到新位置;
  // 进出场与挂载/卸载(列表档互换)不播。
  const gridRef = useRef<HTMLDivElement>(null);
  useLayoutTransition(gridRef, orderedUuids, mode);

  if (!themeSettings.isReady || !storeHydrated) {
    if (!nodeInfoError) return null;
    return (
      <div
        className="home-empty-state"
        role="alert"
        aria-live="assertive"
      >
        <span className="home-empty-state-title">无法读取节点列表</span>
        <span className="home-empty-state-desc">
          这是整站配置同步失败，不是某一台机器离线。正在自动重试后端接口。
        </span>
      </div>
    );
  }

  // 首页概览卡在「空节点」与正常两个分支里完全一致，提取一次复用。
  const homeHeader = (
    <>
      <HomeBrand siteName={siteName} />
      {showSiteSyncBanner && (
        <div className="home-sync-banner" role="status" aria-live="polite">
          <strong>整站实时通道异常</strong>
          <span>当前展示最近缓存；卡片标红/降饱和仍表示单节点离线，两者含义不同。</span>
        </div>
      )}
      {showHomeOverview && (
        <HomeOverviewLive
          dense={mode === "mini" || mode === "list"}
          onWarmTraffic={warmTrafficPage}
          nameByUuid={nameByUuid}
          visibleUuidSet={visibleUuidSet}
        />
      )}
    </>
  );

  if (visibleStructures.length === 0) {
    return (
      <>
        {homeHeader}
        <div className="home-empty-state" role="status" aria-live="polite">
          <span className="home-empty-state-title">尚未连接到任何节点</span>
          <span className="home-empty-state-desc">
            后端尚未登记可展示的机器。若你刚添加节点，请稍候推送；管理员也可前往后台检查。
          </span>
        </div>
      </>
    );
  }

  return (
    // 卡片从 context 读各自的判定结果，避免每张卡再算一遍（见 useNodeAttention）。
    <AttentionProvider value={attentionByUuid}>
      {homeHeader}
      {(showGroupTabs || showHomeSort) && (
        // 分组标签落首列、排序钉在末列右侧；窄屏时两者保持在同一控件栏内。
        <div className={controlsWrapClassName} style={controlsStyle}>
          {showGroupTabs && (
            <GroupTabs
              groups={groupOptions}
              selectedGroup={selectedGroup}
              onSelectGroup={setSelectedGroup}
            />
          )}
          {showHomeSort && <HomeSortControl state={sort} />}
        </div>
      )}
      {showRegionBar && (
        <RegionTabs
          regions={regionOptions}
          selectedRegion={selectedRegion}
          onSelectRegion={setSelectedRegion}
        />
      )}
      {isList ? (
        <NodeListView uuids={orderedUuids} />
      ) : (
        <div ref={gridRef} className={gridWrapClassName} style={gridStyle}>
          {cards}
        </div>
      )}
    </AttentionProvider>
  );
}
