import { useCallback, useMemo } from "react";
import { CanvasStrip, fillRoundedRect, safeCanvasColor } from "./CanvasStrip";
import { getBarGeometry, getBarSlot } from "./nodeCardShared";
import { latencyHeatColor } from "@/utils/metricTone";
import type { PingOverviewBucket } from "@/types/komari";

interface LatencyBarsProps {
  buckets: PingOverviewBucket[];
  max: number;
  redrawKey?: string;
  height?: number;
  onHoverIndex?: (index: number | null) => void;
}

export function LatencyBars({ buckets, max, redrawKey, height = 16, onHoverIndex }: LatencyBarsProps) {
  const bars = useMemo(
    () => {
      // CSS 色变化时需要重新解析预计算的 canvas 色值。
      void redrawKey;
      return buckets.map((bucket) => ({
        value: bucket.value ?? 0,
        has: bucket.value != null,
        index: bucket.index,
        tone: safeCanvasColor(latencyHeatColor(bucket.value)),
      }));
    },
    [buckets, redrawKey],
  );

  const getHoverIndex = useCallback(
    (offsetX: number, width: number) => {
      const slot = getBarSlot(offsetX, width, bars.length);
      return slot == null ? null : bars[slot]?.index ?? null;
    },
    [bars],
  );

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const inactiveColor = safeCanvasColor("var(--progress-bg)");
      const { gap, barWidth } = getBarGeometry(width, bars.length);
      const safeMax = max > 0 ? max : 1;

      bars.forEach(({ value, has, tone }, index) => {
        const barHeight = height * (has ? Math.max(0.2, Math.min(1, value / safeMax)) : 0.25);
        const x = index * (barWidth + gap);
        const y = height - barHeight;

        ctx.globalAlpha = has ? 0.92 : 0.55;
        ctx.fillStyle = has ? tone : inactiveColor;
        fillRoundedRect(ctx, x, y, barWidth, barHeight, 2);
      });

      ctx.globalAlpha = 1;
    },
    [bars, max],
  );

  return (
    <CanvasStrip
      className="health-bar-row"
      height={height}
      redrawKey={redrawKey}
      getHoverIndex={getHoverIndex}
      onHoverIndex={onHoverIndex}
      draw={draw}
    />
  );
}
