import { useEffect } from "react";
import { clsx } from "clsx";
import { useNodeMeta, useNodeMetrics } from "@/hooks/useNode";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { formatByteRateLabel, formatBytes, formatTrafficRateLabel, formatUptimeDays } from "@/utils/format";
import { Flag } from "@/components/ui/Flag";
import { IpStackBadges } from "@/components/node/IpStackBadges";
import { InstancePanel } from "./InstancePanel";

// Intl.DateTimeFormat 构造开销大，复用一个实例，别每次 metrics 更新都重建
const TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function InstanceDetails({
  uuid,
  onNodeReady,
}: {
  uuid: string;
  onNodeReady?: () => (() => void) | void;
}) {
  const meta = useNodeMeta(uuid);
  const metrics = useNodeMetrics(uuid);
  const themeSettings = useThemeSettings();
  const isReady = Boolean(meta && metrics);

  useEffect(() => {
    if (!isReady) return;
    return onNodeReady?.();
  }, [isReady, onNodeReady, uuid]);

  if (!meta || !metrics) return null;

  const isOnline = metrics.online;
  const uptime = formatUptimeDays(metrics.uptime);
  const lastUpdated =
    metrics.updatedAt > 0 ? TIME_FORMATTER.format(metrics.updatedAt) : "—";
  const networkUnit = themeSettings.detailNetworkUnit;
  // 单位族内自适应：mbs 按字节（B/s · KB/s · MB/s），mbps 按比特（Kbps · Mbps · Gbps）。
  const formatNetRate = (bytesPerSec: number) =>
    networkUnit === "mbps"
      ? formatTrafficRateLabel(bytesPerSec)
      : formatByteRateLabel(bytesPerSec);

  // 只呈现身份与累计量，不放百分比/进度条——占比交给下方负载图表，避免重复。
  const cpuLine = `${meta.cpu_name || "—"}${meta.cpu_cores > 0 ? ` ×${meta.cpu_cores}` : ""}`;
  const swapLine =
    metrics.swapTotal > 0
      ? `${formatBytes(metrics.swapUsed)} / ${formatBytes(metrics.swapTotal)}`
      : "无";
  const hasGpu = Boolean(meta.gpu_name && meta.gpu_name !== "None");

  return (
    <InstancePanel
      className="instance-details-panel"
      description={
        isOnline ? undefined : "节点当前离线，以下展示最近一次上报的缓存数据。"
      }
    >
      {/* Bento 散卡：相关性高的字段聚在一张卡里，卡与图表卡同一外壳语言。 */}
      <div className="instance-bento">
        {/* 状态卡：纯判断“健不健康、是哪台机器”。 */}
        <section className="instance-bento-card instance-bento-status">
          <span
            className={clsx(
              "instance-hero-status",
              isOnline ? "is-online" : "is-offline",
            )}
          >
            <span className="instance-hero-dot" aria-hidden />
            {isOnline ? "在线" : "离线"}
          </span>
          <div className="instance-bento-uptime">
            <span className="instance-bento-uptime-value">
              {uptime.unit ? `${uptime.value} ${uptime.unit}` : uptime.value}
            </span>
            <span className="instance-bento-uptime-label">运行时长</span>
          </div>
          {(meta.region || meta.ipv4 || meta.ipv6) && (
            <span className="instance-bento-identity">
              {meta.region && <Flag region={meta.region} size={14} />}
              <IpStackBadges ipv4={meta.ipv4} ipv6={meta.ipv6} />
            </span>
          )}
          <span className="instance-bento-updated">
            {isOnline ? "最近更新" : "最后上报"} {lastUpdated}
          </span>
        </section>

        {/* 硬件卡：资源规格，卡内唯一放大的一组。 */}
        <section className="instance-bento-card instance-bento-hardware">
          <div className="instance-bento-grid">
            <SpecItem label="CPU" value={cpuLine} primary />
            <SpecItem
              label="内存"
              value={`${formatBytes(metrics.ramUsed)} / ${formatBytes(metrics.ramTotal)}`}
              primary
            />
            <SpecItem
              label="磁盘"
              value={`${formatBytes(metrics.diskUsed)} / ${formatBytes(metrics.diskTotal)}`}
              primary
            />
            <SpecItem label="Swap" value={swapLine} primary />
            {hasGpu && <SpecItem label="显卡" value={meta.gpu_name} wide />}
          </div>
        </section>

        {/* 系统卡：纯身份信息。 */}
        <section className="instance-bento-card instance-bento-system">
          <div className="instance-bento-rows">
            <InfoRow label="操作系统" value={meta.os || "—"} />
            <InfoRow label="内核" value={meta.kernel_version || "—"} />
            <InfoRow label="架构" value={meta.arch || "—"} />
            <InfoRow label="虚拟化" value={meta.virtualization || "—"} />
          </div>
        </section>

        {/* 网络卡横贯整行：实时速率 + 累计量。 */}
        <section className="instance-bento-card instance-bento-network">
          <div className="instance-bento-grid">
            <SpecItem
              label="实时网络"
              value={`↑ ${formatNetRate(metrics.netUp)} · ↓ ${formatNetRate(metrics.netDown)}`}
            />
            <SpecItem
              label="总流量"
              value={`↑ ${formatBytes(metrics.trafficUp)} · ↓ ${formatBytes(metrics.trafficDown)}`}
            />
            <SpecItem
              label="连接"
              value={`TCP ${metrics.connectionsTcp} · UDP ${metrics.connectionsUdp}`}
            />
            <SpecItem
              label="负载 / 进程"
              value={`${metrics.load1.toFixed(2)} / ${metrics.load5.toFixed(2)} · ${metrics.process}`}
            />
          </div>
        </section>
      </div>
    </InstancePanel>
  );
}

function SpecItem({
  label,
  value,
  wide,
  primary,
}: {
  label: string;
  value: string;
  wide?: boolean;
  // primary：硬件卡内放大，作为全信息区视觉落点，与其余次要信息拉开层级。
  primary?: boolean;
}) {
  return (
    <div className={clsx("instance-spec-item", wide && "is-wide", primary && "is-primary")}>
      <span className="instance-spec-label">{label}</span>
      <span className="instance-spec-value">{value}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="instance-info-item">
      <span className="instance-info-label">{label}</span>
      <div className="instance-info-value">{value}</div>
    </div>
  );
}
