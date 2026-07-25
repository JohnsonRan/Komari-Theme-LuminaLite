import { CHART_PALETTE } from "@/components/instance/chartShared";
import { formatByteRateLabel, formatBytes } from "@/utils/format";
import type { NodeInfo } from "@/types/komari";
import type { TodayTrafficStat } from "@/utils/trafficStats";
import type { TodayMetricConfig, TodayMetricDetail } from "./TodayMetricPage";

function emptyDirection() {
  return { current: 0, peak: 0, peakAt: null };
}

function statOf(node: NodeInfo, stat: TodayTrafficStat | undefined): TodayTrafficStat {
  return (
    stat ?? {
      uuid: node.uuid,
      trafficUp: 0,
      trafficDown: 0,
      peakUp: 0,
      peakUpAt: null,
      peakDown: 0,
      peakDownAt: null,
      peakTcp: 0,
      peakTcpAt: null,
      peakUdp: 0,
      peakUdpAt: null,
      sampleCount: 0,
      hasSamples: false,
    }
  );
}

/** 今日流量：主值 = 今日上下行总量，方向峰值 = 速率峰值，曲线 = 速率。 */
export const trafficTodayConfig: TodayMetricConfig = {
  summaryTitle: "今日流量",
  primaryColumnLabel: "今日流量",
  emptyLabel: "今日暂无采样",
  upLabel: "上行",
  downLabel: "下行",
  formatPrimary: formatBytes,
  formatRate: formatByteRateLabel,
  colorA: CHART_PALETTE.cpu,
  colorB: CHART_PALETTE.success,
  chartAriaLabel: "本日网络上行与下行速率折线图",
  buildDetail: (node, stat, summary): TodayMetricDetail => {
    const s = statOf(node, stat);
    const total = s.trafficUp + s.trafficDown;
    const currentUp = summary?.netUp ?? 0;
    const currentDown = summary?.netDown ?? 0;
    return {
      node,
      hasSamples: s.hasSamples,
      primary: total,
      primarySub: `↑ ${formatBytes(s.trafficUp)} · ↓ ${formatBytes(s.trafficDown)}`,
      up: { current: currentUp, peak: s.peakUp, peakAt: s.peakUpAt },
      down: { current: currentDown, peak: s.peakDown, peakAt: s.peakDownAt },
    };
  },
  buildSamples: (uuid, samplesByUuid) =>
    (samplesByUuid[uuid] ?? []).map((s) => ({ timeMs: s.timeMs, a: s.up, b: s.down })),
};

/** 今日连接：主值 = 当前合计连接，方向峰值 = 连接峰值，曲线 = 连接数。 */
export const connectionsTodayConfig: TodayMetricConfig = {
  summaryTitle: "今日连接",
  primaryColumnLabel: "当前连接",
  emptyLabel: "今日暂无采样",
  upLabel: "TCP",
  downLabel: "UDP",
  formatPrimary: (v) => Math.round(v).toLocaleString(),
  formatRate: (v) => Math.round(v).toLocaleString(),
  colorA: CHART_PALETTE.cpu,
  colorB: CHART_PALETTE.warning,
  chartAriaLabel: "本日 TCP 与 UDP 连接数折线图",
  buildDetail: (node, stat, summary): TodayMetricDetail => {
    const s = statOf(node, stat);
    const tcp = summary?.connectionsTcp ?? 0;
    const udp = summary?.connectionsUdp ?? 0;
    return {
      node,
      hasSamples: s.hasSamples,
      primary: tcp + udp,
      primarySub: `TCP ${tcp.toLocaleString()} · UDP ${udp.toLocaleString()}`,
      up: { ...emptyDirection(), current: tcp, peak: s.peakTcp, peakAt: s.peakTcpAt },
      down: { ...emptyDirection(), current: udp, peak: s.peakUdp, peakAt: s.peakUdpAt },
    };
  },
  buildSamples: (uuid, _samplesByUuid, connectionSamplesByUuid) =>
    (connectionSamplesByUuid[uuid] ?? []).map((s) => ({ timeMs: s.timeMs, a: s.tcp, b: s.udp })),
};
