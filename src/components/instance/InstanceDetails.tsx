import { useEffect, type ReactNode } from "react";
import { clsx } from "clsx";
import { useNodeMeta, useNodeMetrics } from "@/hooks/useNode";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { formatByteRate, formatBytes, formatTrafficRate, formatUptimeDays } from "@/utils/format";
import { Flag } from "@/components/ui/Flag";
import { IpStackBadges } from "@/components/node/IpStackBadges";
import { InstancePanel } from "./InstancePanel";
import { AnimatedValue } from "@/components/ui/AnimatedValue";
import { MetricGroup, MetricValue } from "@/components/ui/MetricValue";

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
      ? formatTrafficRate(bytesPerSec)
      : formatByteRate(bytesPerSec);

  const netUp = formatNetRate(metrics.netUp);
  const netDown = formatNetRate(metrics.netDown);
  const ramUsed = splitDisplay(formatBytes(metrics.ramUsed));
  const ramTotal = splitDisplay(formatBytes(metrics.ramTotal));
  const diskUsed = splitDisplay(formatBytes(metrics.diskUsed));
  const diskTotal = splitDisplay(formatBytes(metrics.diskTotal));
  const trafficUp = splitDisplay(formatBytes(metrics.trafficUp));
  const trafficDown = splitDisplay(formatBytes(metrics.trafficDown));

  // 只呈现身份与累计量，不放百分比/进度条——占比交给下方负载图表，避免重复。
  const cpuLine = `${meta.cpu_name || "—"}${meta.cpu_cores > 0 ? ` ×${meta.cpu_cores}` : ""}`;
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
              <AnimatedValue text={uptime.value} />
              {uptime.unit && <span className="instance-bento-uptime-unit"> {uptime.unit}</span>}
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
              value={<CapacityPair used={ramUsed} total={ramTotal} />}
              primary
            />
            <SpecItem
              label="磁盘"
              value={<CapacityPair used={diskUsed} total={diskTotal} />}
              primary
            />
            <SpecItem
              label="Swap"
              value={
                metrics.swapTotal > 0
                  ? <CapacityPair
                      used={splitDisplay(formatBytes(metrics.swapUsed))}
                      total={splitDisplay(formatBytes(metrics.swapTotal))}
                    />
                  : "无"
              }
              primary
            />
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
              value={
                <span className="instance-network-rates">
                  <NetworkRate direction="↑" value={netUp.value} unit={netUp.unit} />
                  <span className="instance-network-separator" aria-hidden>·</span>
                  <NetworkRate direction="↓" value={netDown.value} unit={netDown.unit} />
                </span>
              }
            />
            <SpecItem
              label="总流量"
              value={
                <MetricValue
                  tokens={[
                    { text: "↑ " },
                    { text: trafficUp.value, animated: true },
                    { text: ` ${trafficUp.unit}` },
                    { text: " · ↓ " },
                    { text: trafficDown.value, animated: true },
                    { text: ` ${trafficDown.unit}` },
                  ]}
                />
              }
            />
            <SpecItem
              label="连接"
              value={
                <MetricValue
                  tokens={[
                    { text: "TCP " },
                    { text: String(metrics.connectionsTcp), animated: true },
                    { text: " · UDP " },
                    { text: String(metrics.connectionsUdp), animated: true },
                  ]}
                />
              }
            />
            <SpecItem
              label="负载 / 进程"
              value={
                <MetricValue
                  tokens={[
                    { text: metrics.load1.toFixed(2), animated: true },
                    { text: " / " },
                    { text: metrics.load5.toFixed(2), animated: true },
                    { text: " · " },
                    { text: String(metrics.process), animated: true },
                  ]}
                />
              }
            />
          </div>
        </section>
      </div>
    </InstancePanel>
  );
}

type DisplayPart = { value: string; unit: string };

function splitDisplay(label: string): DisplayPart {
  const separator = label.indexOf(" ");
  return separator < 0
    ? { value: label, unit: "" }
    : { value: label.slice(0, separator), unit: label.slice(separator + 1) };
}

function CapacityPair({ used, total }: { used: DisplayPart; total: DisplayPart }) {
  return (
    <MetricValue
      tokens={[
        { text: used.value, animated: true },
        { text: used.unit ? ` ${used.unit}` : "" },
        { text: " / " },
        { text: total.value, animated: true },
        { text: total.unit ? ` ${total.unit}` : "" },
      ]}
    />
  );
}

function NetworkRate({
  direction,
  value,
  unit,
}: {
  direction: "↑" | "↓";
  value: string;
  unit: string;
}) {
  return (
    <MetricGroup>
      <MetricValue
        tokens={[
          { text: `${direction} ` },
          { text: value, animated: true },
          { text: ` ${unit}` },
        ]}
      />
    </MetricGroup>
  );
}

function SpecItem({
  label,
  value,
  wide,
  primary,
}: {
  label: string;
  value: ReactNode;
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
