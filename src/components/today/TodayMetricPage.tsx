import { Fragment, Suspense, lazy, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, RefreshCw } from "@/components/ui/icons";
import { Flag } from "@/components/ui/Flag";
import { Spinner } from "@/components/ui/Spinner";
import { AnimatedValue } from "@/components/ui/AnimatedValue";
import { useAuth } from "@/hooks/useAuth";
import { useMinuteClock } from "@/hooks/useClock";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useAllNodeMeta, useHomeNodeSummaries } from "@/hooks/useNode";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { useTodayTrafficStats } from "@/hooks/useTodayTrafficStats";
import { collectMatchingNodeUuids } from "@/utils/nodeIdentity";
import type { NodeInfo } from "@/types/komari";
import type { TodayConnectionSample, TodayTrafficSample, TodayTrafficStat } from "@/utils/trafficStats";
import type { TodaySeriesPoint } from "./TodaySeriesChart";

const TodaySeriesChart = lazy(() =>
  import("./TodaySeriesChart").then((module) => ({ default: module.TodaySeriesChart })),
);

const DAY_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  day: "numeric",
  weekday: "short",
});
const TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 一个节点在某一方向（上行/下行 或 TCP/UDP）上的当前值与今日峰值。 */
export interface DirectionStat {
  current: number;
  peak: number;
  peakAt: number | null;
}

export interface TodayMetricDetail {
  node: NodeInfo;
  hasSamples: boolean;
  /** 主列合计（今日流量 = 总字节；带宽/连接 = 当前合计）。 */
  primary: number;
  /** 主列下方的次说明（如 ↑ x · ↓ y）。没有则为 null。 */
  primarySub: string | null;
  up: DirectionStat;
  down: DirectionStat;
}

export interface TodayMetricConfig {
  /** 顶部汇总卡主标题（今日流量 / 今日带宽 / 今日连接）。 */
  summaryTitle: string;
  /** 表格主列的列名（今日流量 / 当前带宽 / 当前连接）。 */
  primaryColumnLabel: string;
  /** 无采样时的占位（无数据）。 */
  emptyLabel: string;
  /** 两个方向的列名与图表图例（上行/下行 或 TCP/UDP）。 */
  upLabel: string;
  downLabel: string;
  /** 数值格式化（字节 / 速率 / 计数）。 */
  formatPrimary: (value: number) => string;
  formatRate: (value: number) => string;
  /** 图表两条线颜色。 */
  colorA: string;
  colorB: string;
  chartAriaLabel: string;
  /** 把后端行数据映射成页面用的展示结构。summary 为该节点的实时快照（当前速率/连接）。 */
  buildDetail: (
    node: NodeInfo,
    stat: TodayTrafficStat | undefined,
    summary: { netUp: number; netDown: number; connectionsTcp: number; connectionsUdp: number } | undefined,
  ) => TodayMetricDetail;
  /** 取该节点的图表采样点。 */
  buildSamples: (
    uuid: string,
    samplesByUuid: Record<string, TodayTrafficSample[]>,
    connectionSamplesByUuid: Record<string, TodayConnectionSample[]>,
  ) => TodaySeriesPoint[];
}

function formatPeakTime(timeMs: number | null, value: number) {
  return timeMs != null && value > 0 ? TIME_FORMATTER.format(timeMs) : "—";
}

function PeakCell({ stat, format }: { stat: DirectionStat; format: (v: number) => string }) {
  return (
    <span className="traffic-peak-value">
      <strong><AnimatedValue text={format(stat.peak)} /></strong>
      <small>{formatPeakTime(stat.peakAt, stat.peak)}</small>
    </span>
  );
}

function DetailToggle({ expanded, controlsId, onClick }: { expanded: boolean; controlsId: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="traffic-detail-toggle"
      aria-expanded={expanded}
      aria-controls={controlsId}
      onClick={onClick}
    >
      详情
      <ChevronDown size={13} strokeWidth={2.2} aria-hidden />
    </button>
  );
}

function SampleChart({ id, samples, config }: { id: string; samples: TodaySeriesPoint[]; config: TodayMetricConfig }) {
  return (
    <section id={id} className="traffic-detail-panel" aria-label="本日明细曲线">
      <header className="traffic-detail-head">
        <strong>本日{config.upLabel}/{config.downLabel}</strong>
        <span><AnimatedValue text={String(samples.length)} /> 个采样</span>
      </header>
      {samples.length === 0 ? (
        <div className="traffic-detail-empty">本日暂无采样</div>
      ) : (
        <Suspense
          fallback={
            <div className="traffic-chart-loading">
              <Spinner size={18} />
            </div>
          }
        >
          <TodaySeriesChart
            samples={samples}
            labelA={config.upLabel}
            labelB={config.downLabel}
            colorA={config.colorA}
            colorB={config.colorB}
            formatValue={config.formatRate}
            ariaLabel={config.chartAriaLabel}
          />
        </Suspense>
      )}
    </section>
  );
}

// 与 traffic-stats.css 里 .traffic-table-wrap / .traffic-card-list 的断点一致。
const TRAFFIC_MOBILE_QUERY = "(max-width: 720px)";

export function TodayMetricPage({ config }: { config: TodayMetricConfig }) {
  const [expandedUuid, setExpandedUuid] = useState<string | null>(null);
  // 只挂一种布局：避免桌面表 + 移动卡双 DOM 同时 buildSamples / reconcile。
  const isMobileLayout = useMediaQuery(TRAFFIC_MOBILE_QUERY);
  const now = useMinuteClock();
  const allNodes = useAllNodeMeta();
  const { data: me } = useAuth();
  const themeSettings = useThemeSettings();
  const hiddenUuids = useMemo(
    () => collectMatchingNodeUuids(allNodes, themeSettings.hiddenNodes),
    [allNodes, themeSettings.hiddenNodes],
  );
  const nodes = useMemo(
    () =>
      allNodes.filter(
        (node) => (me?.logged_in === true || !node.hidden) && !hiddenUuids.has(node.uuid),
      ),
    [allNodes, hiddenUuids, me?.logged_in],
  );
  const uuids = useMemo(() => nodes.map((node) => node.uuid), [nodes]);
  const query = useTodayTrafficStats(uuids, now);
  const summaries = useHomeNodeSummaries();
  const summaryByUuid = useMemo(
    () => new Map(summaries.map((s) => [s.uuid, s] as const)),
    [summaries],
  );

  const details = useMemo<TodayMetricDetail[]>(() => {
    const stats = new Map(query.data?.rows.map((row) => [row.uuid, row] as const));
    return nodes
      .map((node) => config.buildDetail(node, stats.get(node.uuid), summaryByUuid.get(node.uuid)))
      .sort(
        (left, right) =>
          Number(right.hasSamples) - Number(left.hasSamples) ||
          right.primary - left.primary ||
          left.node.weight - right.node.weight,
      );
  }, [nodes, query.data?.rows, summaryByUuid, config]);

  const sampled = details.filter((d) => d.hasSamples);
  const empty = details.filter((d) => !d.hasSamples);
  const updatedAt = query.data?.rangeEndMs ?? now;

  // 汇总：主值总量 + 双向峰值节点 + 当前实时带宽。
  const totals = useMemo(() => {
    const primary = sampled.reduce((sum, d) => sum + d.primary, 0);
    const currentUp = sampled.reduce((sum, d) => sum + d.up.current, 0);
    const currentDown = sampled.reduce((sum, d) => sum + d.down.current, 0);
    const peakUp = sampled.reduce<TodayMetricDetail | null>(
      (best, d) => (!best || d.up.peak > best.up.peak ? d : best),
      null,
    );
    const peakDown = sampled.reduce<TodayMetricDetail | null>(
      (best, d) => (!best || d.down.peak > best.down.peak ? d : best),
      null,
    );
    return { primary, currentUp, currentDown, peakUp, peakDown };
  }, [sampled]);

  const summarySub = (
    <>
      <span>
        <ArrowUp size={13} aria-hidden />
        <AnimatedValue text={config.formatRate(totals.peakUp?.up.peak ?? 0)} />
      </span>
      <span>
        <ArrowDown size={13} aria-hidden />
        <AnimatedValue text={config.formatRate(totals.peakDown?.down.peak ?? 0)} />
      </span>
    </>
  );

  return (
    <div className="traffic-page flex flex-col gap-4 py-2">
      <div className="flex items-center justify-between gap-3">
        <Link to="/" className="instance-page-back">
          <ChevronLeft size={14} />
          返回
        </Link>
        <button
          type="button"
          className={`cost-summary-action${query.isFetching ? " is-spinning" : ""}`}
          onClick={() => void query.refetch()}
          disabled={query.isFetching || nodes.length === 0}
          aria-busy={query.isFetching}
          aria-label="刷新"
          title="刷新"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {nodes.length === 0 ? (
        <div className="flex h-[40vh] flex-col items-center justify-center gap-2 text-[var(--text-tertiary)]">
          <span className="text-[15px]">暂无节点数据</span>
          <span className="text-[12px]">等待后端推送或前往管理后台添加</span>
        </div>
      ) : query.isPending ? (
        <div className="flex h-[40vh] items-center justify-center">
          <Spinner size={24} />
        </div>
      ) : query.isError ? (
        <section className="traffic-error" role="alert">
          <strong>无法读取统计</strong>
          <span>请检查网络或历史记录配置后重试。</span>
          <button type="button" onClick={() => void query.refetch()}>
            重新加载
          </button>
        </section>
      ) : (
        <>
          <section className="traffic-summary-grid" aria-label="汇总">
            <article className="traffic-summary-card">
              <div className="traffic-summary-head">
                <span className="assets-eyebrow">{config.summaryTitle}</span>
                <span>{DAY_FORMATTER.format(now)}</span>
              </div>
              <strong className="traffic-summary-total">
                {sampled.length > 0 ? config.formatPrimary(totals.primary) : "—"}
              </strong>
              <div className="traffic-summary-directions">{summarySub}</div>
            </article>

            <article className="traffic-summary-card">
              <div className="traffic-summary-head">
                <span className="assets-eyebrow">当前带宽</span>
                <span>实时</span>
              </div>
              <strong className="traffic-summary-total">
                {config.formatRate(totals.currentUp + totals.currentDown)}
              </strong>
              <div className="traffic-summary-directions">
                <span>
                  <ArrowUp size={13} aria-hidden />
                  {config.formatRate(totals.currentUp)}
                </span>
                <span>
                  <ArrowDown size={13} aria-hidden />
                  {config.formatRate(totals.currentDown)}
                </span>
              </div>
            </article>

            <article className="traffic-summary-card is-peak">
              <div className="traffic-summary-head">
                <span className="assets-eyebrow">今日采样峰值</span>
                <span>统计至 {TIME_FORMATTER.format(updatedAt)}</span>
              </div>
              <div className="traffic-summary-peak-list">
                <PeakRow label={config.upLabel} detail={totals.peakUp?.up ?? null} nodeName={totals.peakUp?.node.name} format={config.formatRate} icon="up" />
                <PeakRow label={config.downLabel} detail={totals.peakDown?.down ?? null} nodeName={totals.peakDown?.node.name} format={config.formatRate} icon="down" />
              </div>
            </article>
          </section>

          {/* assets-section-head 的样式是资产页旧皮肤留下的,现已无人定义 —— 这里用本页的
              traffic-section-head,否则三段文字没有 flex 容器,直接挤成一团。 */}
          <div className="traffic-section-head">
            <span className="traffic-section-title">节点明细</span>
            <span className="traffic-section-count">{details.length} 台</span>
            <span className="traffic-sample-note">峰值按历史采样计算</span>
          </div>

          {!isMobileLayout ? (
            <div className="assets-table-wrap traffic-table-wrap is-active">
              <table className="assets-table traffic-table">
                <thead>
                  <tr>
                    <th><span>节点</span></th>
                    <th data-numeric><span>{config.primaryColumnLabel}</span></th>
                    <th data-numeric><span>{config.upLabel}峰值</span></th>
                    <th data-numeric><span>{config.downLabel}峰值</span></th>
                    <th data-action><span>操作</span></th>
                  </tr>
                </thead>
                <tbody>
                  {sampled.map((detail) => {
                    const { node } = detail;
                    const expanded = expandedUuid === node.uuid;
                    const detailId = `today-detail-${node.uuid}`;
                    // 只为展开行构造曲线采样，避免 N 节点全表 buildSamples。
                    const samples = expanded
                      ? config.buildSamples(
                          node.uuid,
                          query.data?.samplesByUuid ?? {},
                          query.data?.connectionSamplesByUuid ?? {},
                        )
                      : null;
                    return (
                      <Fragment key={node.uuid}>
                        <tr>
                          <td>
                            <Link to={`/instance/${encodeURIComponent(node.uuid)}`} className="assets-node-link" title={node.name}>
                              <Flag region={node.region} size={12} />
                              <span>{node.name}</span>
                            </Link>
                          </td>
                          <td data-numeric data-strong>
                            <span className="traffic-volume-value">
                              <strong>{config.formatPrimary(detail.primary)}</strong>
                              {detail.primarySub && <small>{detail.primarySub}</small>}
                            </span>
                          </td>
                          <td data-numeric><PeakCell stat={detail.up} format={config.formatRate} /></td>
                          <td data-numeric><PeakCell stat={detail.down} format={config.formatRate} /></td>
                          <td data-action>
                            <DetailToggle expanded={expanded} controlsId={detailId} onClick={() => setExpandedUuid(expanded ? null : node.uuid)} />
                          </td>
                        </tr>
                        {expanded && samples && (
                          <tr className="traffic-detail-row">
                            <td colSpan={5}>
                              <SampleChart id={detailId} samples={samples} config={config} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {empty.length > 0 && (
                    <tr className="traffic-empty-row">
                      <td colSpan={5}>
                        <span className="traffic-empty-note">
                          {empty.length} 台节点{config.emptyLabel}：{empty.map((d) => d.node.name).join("、")}
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="assets-card-list traffic-card-list is-active">
              {sampled.map((detail) => {
                const { node } = detail;
                const expanded = expandedUuid === node.uuid;
                const detailId = `today-mobile-detail-${node.uuid}`;
                const samples = expanded
                  ? config.buildSamples(
                      node.uuid,
                      query.data?.samplesByUuid ?? {},
                      query.data?.connectionSamplesByUuid ?? {},
                    )
                  : null;
                return (
                  <article className="traffic-node-card" key={node.uuid}>
                    <header className="traffic-node-card-head">
                      <Link to={`/instance/${encodeURIComponent(node.uuid)}`} className="assets-node-link">
                        <Flag region={node.region} size={12} />
                        <span>{node.name}</span>
                      </Link>
                      <div className="traffic-node-card-actions">
                        <strong>{config.formatPrimary(detail.primary)}</strong>
                        <DetailToggle expanded={expanded} controlsId={detailId} onClick={() => setExpandedUuid(expanded ? null : node.uuid)} />
                      </div>
                    </header>
                    {detail.primarySub && (
                      <div className="traffic-node-card-directions">
                        <span>{detail.primarySub}</span>
                      </div>
                    )}
                    <dl className="traffic-node-card-peaks">
                      <div>
                        <dt>{config.upLabel}峰值</dt>
                        <dd><PeakCell stat={detail.up} format={config.formatRate} /></dd>
                      </div>
                      <div>
                        <dt>{config.downLabel}峰值</dt>
                        <dd><PeakCell stat={detail.down} format={config.formatRate} /></dd>
                      </div>
                    </dl>
                    {expanded && samples && <SampleChart id={detailId} samples={samples} config={config} />}
                  </article>
                );
              })}
              {empty.length > 0 && (
                <div className="traffic-empty-note traffic-empty-note--card">
                  {empty.length} 台节点{config.emptyLabel}：{empty.map((d) => d.node.name).join("、")}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PeakRow({
  label,
  detail,
  nodeName,
  format,
  icon,
}: {
  label: string;
  detail: DirectionStat | null;
  nodeName: string | undefined;
  format: (v: number) => string;
  icon: "up" | "down";
}) {
  const Icon = icon === "up" ? ArrowUp : ArrowDown;
  return (
    <div className="traffic-summary-peak-row">
      <span className="traffic-summary-peak-label">
        <Icon size={13} strokeWidth={2.4} aria-hidden />
        {label}
      </span>
      <span className="traffic-summary-peak-main">
        <strong>{detail && detail.peak > 0 ? format(detail.peak) : "—"}</strong>
        <small>{detail && detail.peak > 0 && nodeName ? `${nodeName} · ${formatPeakTime(detail.peakAt, detail.peak)}` : "暂无峰值"}</small>
      </span>
    </div>
  );
}
