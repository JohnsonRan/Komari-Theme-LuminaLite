import { memo, useCallback, useMemo } from "react";
import { CanvasStrip, safeCanvasColor } from "./CanvasStrip";
import { formatReportedRatio, type NodeHistory } from "@/utils/nodeHistory";
import { cpuHeatColor } from "@/utils/metricTone";

// 24 小时条：一格 15 分钟，共 96 格。
//
// 同一条同时表达两件事，因为它们本来就是同一份数据的两面：
//   · 格子的**高度**是那 15 分钟的平均 CPU —— 趋势（sparkline 想给的东西）
//   · 格子**在不在** 是那 15 分钟有没有上报 —— 可用性（缺口即探针失联）
// 拆成两条会占双倍高度，而卡片高度刚统一过；合成一条后缺口是"塌下去的空档"，
// 比一条独立的绿红条更容易和上方的曲线对上。
//
// 注意它测的是「探针有没有上报」，不是严格的 uptime：探针进程挂了和机器真的宕机
// 在这里是一个样子。文案统一用「上报」而不是「在线」，别让它看起来比实际更权威。

// 用绝对像素而不是条高百分比：迷你卡只有 12px 高，按比例算出来的两个下限会双双落到
// 同一个像素上，"没数据"和"很闲"就分不开了。
const GAP_HEIGHT_PX = 1;
const REPORTED_MIN_HEIGHT_PX = 3;
export const NodeHistoryStrip = memo(function NodeHistoryStrip({
  history,
  redrawKey,
  height = 22,
}: {
  history: NodeHistory;
  redrawKey?: string;
  height?: number;
}) {
  const { slots } = history;

  // 颜色在 draw 之外预解析。cpuHeatColor + safeCanvasColor 每次要走 hsl 字符串构造、
  // 正则解析、hslToRgb 一整套；放在 draw 里就是 96 格 × 每次重绘，而重绘不只在数据变化时
  // 触发，滚动导致的可见性翻转也会（见 CanvasStrip 的 visible 依赖）。
  // 与 LatencyBars 的做法一致：draw 里只留几何。
  const bars = useMemo(
    () => {
      // CSS 变量随主题/配色变化，redrawKey 变了就得重新解析。
      void redrawKey;
      return slots.map((slot) => ({
        reported: slot.reported,
        value: slot.value ?? 0,
        tone: slot.reported ? safeCanvasColor(cpuHeatColor(slot.value)) : "",
      }));
    },
    [slots, redrawKey],
  );

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, canvasHeight: number) => {
      const gapColor = safeCanvasColor("var(--progress-bg)");
      const slotWidth = width / bars.length;
      // 格子间不留缝：96 格已经很密，留缝会让整条看起来像虚线。
      const barWidth = Math.max(1, slotWidth);

      bars.forEach((bar, index) => {
        const x = index * slotWidth;
        if (!bar.reported) {
          // 未上报：贴底一道 1px 暗线，读作"这段时间是空的"，而不是"值为 0"。
          // 必须比下面上报格的最小高度更矮 —— 否则"没数据"看起来反而比"在跑但很闲"更高。
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = gapColor;
          ctx.fillRect(x, canvasHeight - GAP_HEIGHT_PX, barWidth, GAP_HEIGHT_PX);
          return;
        }
        // 上报格的下限保证"有数据"始终看得见，且明显高于缺口那道线。
        const barHeight = Math.max(
          REPORTED_MIN_HEIGHT_PX,
          canvasHeight * Math.min(1, bar.value / 100),
        );
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = bar.tone;
        ctx.fillRect(x, canvasHeight - barHeight, barWidth, barHeight);
      });

      ctx.globalAlpha = 1;
    },
    [bars],
  );

  if (slots.length === 0) return null;

  return (
    <div className="node-history-strip" title={`${formatReportedRatio(history)}（CPU，每格 15 分钟）`}>
      <CanvasStrip
        className="node-history-canvas"
        height={height}
        redrawKey={redrawKey}
        draw={draw}
      />
    </div>
  );
});
