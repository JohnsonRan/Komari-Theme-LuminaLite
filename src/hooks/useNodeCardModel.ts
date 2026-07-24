import { useMemo, useRef } from "react";
import type { NodeInfo, NodeMetrics } from "@/types/komari";
import { useFakePingFallback } from "@/hooks/useFakePing";
import { useHourlyClock } from "@/hooks/useClock";
import { useNodeCardSnapshots } from "@/hooks/useNode";
import {
  EMPTY_PING,
  useNodePingOverviewList,
  usePingBuckets,
} from "@/hooks/usePingOverview";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { formatRenewalPrice } from "@/utils/billing";
import { getExpireTextColor } from "@/utils/expireStatus";
import {
  formatBytes,
  formatByteRate,
  formatExpireDays,
  formatRelativeTime,
  formatUptimeDays,
  joinDisplayParts,
  parseTags,
} from "@/utils/format";
import {
  latencyHeatColor,
  lossHeatColor,
  trafficUsageColor,
} from "@/utils/metricTone";
import { resolveTrafficUsage, trafficTypeLabel, type TrafficDisplay } from "@/utils/traffic";
import { resolveOsInfo } from "@/components/ui/OsLogo";
import { MAX_HOMEPAGE_PING_TASKS } from "@/utils/pingTasks";
import type { PingOverviewBucket, PingOverviewItem, PingRealtimeStats } from "@/types/komari";

export interface NodePingSeries {
  taskId?: number;
  /** 多任务时显示在卡片上的短标签；单任务时为空（沿用“延迟”标题）。 */
  label: string;
  ping: PingOverviewItem;
  buckets: PingOverviewBucket[];
  latencyColor: string;
  lossColor: string;
}

// 把某条 ping 序列所属任务的 WS 实时统计盖到 overview 数据上。
// 已绑定任务按 taskId 精确取；未绑定（模拟延迟 / 首页解析器尚未挂载）时退回扁平的
// ping* 字段——它是帧里第一个任务的展开视图，与改动前的行为一致。
function applyRealtimePing(
  item: PingOverviewItem,
  metrics: NodeMetrics | undefined,
): PingOverviewItem {
  if (!metrics) return item;
  const stats: PingRealtimeStats | undefined =
    item.taskId != null
      ? metrics.pingStats?.[String(item.taskId)]
      : {
          latest: metrics.pingLatest,
          loss: metrics.pingLoss,
          avg: metrics.pingAvg,
          min: metrics.pingMin,
          peak: metrics.pingMax,
        };
  if (!stats || (stats.latest == null && stats.loss == null)) return item;

  return {
    ...item,
    lastValue: stats.latest ?? item.lastValue,
    loss: stats.loss ?? item.loss,
    // 后端缓存的近 1 小时统计（avg/min/peak）：实时帧未下发时保留 overview 原值。
    avg: stats.avg ?? item.avg,
    min: stats.min ?? item.min,
    peak: stats.peak ?? item.peak,
  };
}

export function useNodeCardModel(uuid: string, pingBucketCount?: number) {
  const { meta, metrics, trafficTrend } = useNodeCardSnapshots(uuid);
  const pingList = useNodePingOverviewList(uuid);
  const { showCardGroup, fakePingForUnbound, homepagePingBindings } = useThemeSettings();
  const now = useHourlyClock();
  const ping = useFakePingFallback(
    uuid,
    pingList[0] ?? EMPTY_PING,
    metrics?.online === true,
    fakePingForUnbound,
    homepagePingBindings,
  );
  // Hook 数量必须恒定，所以按上限逐位取序列(缺位用空 ping)，而不是按实际长度循环。
  const pingBuckets = usePingBuckets(ping, pingBucketCount);
  const extraBuckets1 = usePingBuckets(pingList[1] ?? EMPTY_PING, pingBucketCount);
  const extraBuckets2 = usePingBuckets(pingList[2] ?? EMPTY_PING, pingBucketCount);

  const metaModel = useMemo(() => {
    if (!meta) return null;
    const tags = parseTags(meta.tags);
    const group = showCardGroup ? meta.group : undefined;
    const subtitleParts = [group, meta.public_remark]
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part));
    const subtitleLabels = new Set(subtitleParts.map((part) => part.toLowerCase()));
    const compactFooterTags = tags.filter(
      (tag) => !subtitleLabels.has(tag.label.trim().toLowerCase()),
    );
    const fallbackFooterTags =
      tags.length > 0
        ? tags
        : group
          ? [{ label: group, color: "gray" }]
          : [];
    const osName = resolveOsInfo(meta.os).name;
    return {
      tags,
      footerTags: fallbackFooterTags,
      compactFooterTags,
      subtitle: joinDisplayParts(subtitleParts),
      systemInfo: joinDisplayParts([osName, meta.arch, meta.kernel_version]),
      expire: formatExpireDays(meta.expired_at, now),
      expireColor: getExpireTextColor(meta.expired_at, now),
      renewalPrice: formatRenewalPrice(meta),
      osName,
      loadBaseline: meta.cpu_cores > 0 ? meta.cpu_cores : 4,
    };
  }, [meta, now, showCardGroup]);

  // 首页可绑定多个 Ping 任务(“三网延迟”)。第一条永远是主任务(未绑定/模拟延迟时的兜底),
  // 所以长度恒 >= 1;多于一条时卡片才渲染任务切换标签。
  //
  // 每一条都合并各自任务的内嵌 ping 实时数据:延迟/丢包每 2s 跟随 latestStatus 刷新,
  // 历史柱状图仍由 overview(~60s)提供。后端 WS 帧按 taskId 下发全量 map,所以副任务
  // 与主任务是同一档实时性,不存在"只有第一个是实时的"。
  const pingSeries = useMemo<NodePingSeries[]>(() => {
    const entries = [
      { item: ping, buckets: pingBuckets },
      { item: pingList[1], buckets: extraBuckets1 },
      { item: pingList[2], buckets: extraBuckets2 },
    ].slice(0, MAX_HOMEPAGE_PING_TASKS);
    const multi = pingList.length > 1;

    return entries.flatMap(({ item, buckets }) => {
      if (!item) return [];
      const resolved = applyRealtimePing(item, metrics);
      return [
        {
          taskId: resolved.taskId,
          label: multi ? (resolved.taskName ?? `任务 #${resolved.taskId ?? "-"}`) : "",
          ping: resolved,
          buckets,
          latencyColor: latencyHeatColor(resolved.lastValue),
          lossColor: lossHeatColor(resolved.loss),
        },
      ];
    });
  }, [ping, pingList, metrics, pingBuckets, extraBuckets1, extraBuckets2]);

  const resolvedPing = pingSeries[0].ping;

  // ping 派生的颜色只在解析后的 ping 值变化时才变。
  const pingModel = useMemo(
    () => ({
      latencyColor: latencyHeatColor(resolvedPing.lastValue),
      lossColor: lossHeatColor(resolvedPing.loss),
      hasHomepagePingBinding: resolvedPing.isAssigned,
    }),
    [resolvedPing],
  );

  // 浅比较缓存：避免每 tick 创建新的 { ...meta, ...metrics } 对象引用，
  // 让子组件在值未变时跳过 re-render。
  type NodeCombined = NodeInfo & NodeMetrics;
  // 连 key 列表一起缓存：每 tick 只需为新对象取一次 Object.keys。
  const nodeCacheRef = useRef<{ node: NodeCombined; keys: string[] } | undefined>(undefined);

  return useMemo(() => {
    if (!meta || !metrics || !metaModel) {
      nodeCacheRef.current = undefined;
      return {
        node: undefined,
        trafficTrend,
        ping,
        pingBuckets,
        pingSeries,
      };
    }

    const { loadBaseline } = metaModel;

    // 流量配额：按节点的 traffic_limit_type（与后端一致）把累计上/下行算成“已用”，
    // 在这里一次性算出剩余和使用占比，让两种卡片布局共用这套计算。
    const trafficUsage = resolveTrafficUsage(
      meta.traffic_limit_type,
      metrics.trafficUp,
      metrics.trafficDown,
      meta.traffic_limit,
    );
    const trafficUsedLabel = formatBytes(trafficUsage.used);
    // 不限量时渲染成 ∞，让剩余值和“已用/上限”那行与限量情况保持一致
    //（“剩余 ∞” + “2.73 GB / ∞”）。
    const trafficLimitLabel = trafficUsage.unlimited ? "∞" : formatBytes(trafficUsage.limit);
    const trafficColor = trafficUsage.unlimited
      ? "var(--status-success)"
      : trafficUsageColor(trafficUsage.fraction);
    const traffic: TrafficDisplay = {
      fraction: trafficUsage.fraction,
      color: trafficColor,
      remainingLabel: trafficUsage.unlimited ? "∞" : formatBytes(trafficUsage.remaining),
      detail: `${trafficUsedLabel} / ${trafficLimitLabel}`,
      typeLabel: trafficTypeLabel(meta.traffic_limit_type),
    };

    // 浅比较：值未变则复用旧引用，避免子组件无谓 re-render。
    const candidate: NodeCombined = { ...meta, ...metrics };
    const nextKeys = Object.keys(candidate);
    const prev = nodeCacheRef.current;
    const same =
      prev !== undefined &&
      prev.keys.length === nextKeys.length &&
      nextKeys.every(
        (key) =>
          (prev.node as unknown as Record<string, unknown>)[key] ===
          (candidate as unknown as Record<string, unknown>)[key],
      );
    const node = same ? prev.node : candidate;
    nodeCacheRef.current = same ? prev : { node, keys: nextKeys };

    return {
      node,
      trafficTrend,
      ping: resolvedPing,
      pingBuckets,
      pingSeries,
      traffic,
      ...metaModel,
      ...pingModel,
      uptime: formatUptimeDays(metrics.uptime),
      loadFraction: Math.max(0, Math.min(1, metrics.load1 / loadBaseline)),
      upRate: formatByteRate(metrics.netUp),
      downRate: formatByteRate(metrics.netDown),
      isOnline: metrics.online === true,
      isOffline: metrics.online === false,
      lastSeen: metrics.online === false && metrics.updatedAt > 0
        ? formatRelativeTime(metrics.updatedAt)
        : null,
    };
  }, [
    meta,
    metrics,
    metaModel,
    pingModel,
    ping,
    resolvedPing,
    pingBuckets,
    pingSeries,
    trafficTrend,
  ]);
}
