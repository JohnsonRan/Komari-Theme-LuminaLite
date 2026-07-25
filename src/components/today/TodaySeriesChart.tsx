import { useMemo, useRef, useState } from "react";
import UplotReact from "uplot-react";
import type uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { ChartTooltip } from "@/components/instance/ChartParts";
import {
  buildChartTooltipHooks,
  createTimeAxisFormatter,
  getAxisColors,
  useResponsiveChartSize,
  type ChartTooltipState,
} from "@/components/instance/chartShared";
import { usePreferences } from "@/hooks/usePreferences";

export interface TodaySeriesPoint {
  timeMs: number;
  a: number;
  b: number;
}

interface TodaySeriesChartProps {
  samples: TodaySeriesPoint[];
  labelA: string;
  labelB: string;
  colorA: string;
  colorB: string;
  formatValue: (value: number) => string;
  ariaLabel: string;
}

/** 今日双序列折线图（流量/带宽/连接共用）。与 TrafficRateChart 同一套坐标与 tooltip 约定。 */
export function TodaySeriesChart({
  samples,
  labelA,
  labelB,
  colorA,
  colorB,
  formatValue,
  ariaLabel,
}: TodaySeriesChartProps) {
  const { resolvedAppearance } = usePreferences();
  const { w, ref: chartSizeRef } = useResponsiveChartSize("grid");
  const height = w < 560 ? 182 : 220;
  const data = useMemo<uPlot.AlignedData>(() => {
    const ordered = [...samples].sort((left, right) => left.timeMs - right.timeMs);
    return [
      ordered.map((sample) => sample.timeMs / 1000),
      ordered.map((sample) => sample.a),
      ordered.map((sample) => sample.b),
    ] as uPlot.AlignedData;
  }, [samples]);
  const dataRef = useRef<uPlot.AlignedData>(data);
  dataRef.current = data;
  const [tooltip, setTooltip] = useState<ChartTooltipState>({
    show: false,
    left: 0,
    top: 0,
    rows: [],
    time: "",
  });
  const tooltipHooks = useMemo(
    () =>
      buildChartTooltipHooks({
        dataRef,
        rangeHours: 24,
        estimatedWidth: 184,
        setTooltip,
        buildRows: (index) => [
          { label: labelA, value: formatValue(Number(dataRef.current[1]?.[index] ?? 0)), color: colorA },
          { label: labelB, value: formatValue(Number(dataRef.current[2]?.[index] ?? 0)), color: colorB },
        ],
      }),
    [colorA, colorB, formatValue, labelA, labelB],
  );
  const options = useMemo<uPlot.Options>(() => {
    const isDark = resolvedAppearance === "dark";
    const { grid, text } = getAxisColors(isDark);
    return {
      width: w,
      height,
      padding: [8, w < 560 ? 18 : 28, 8, w < 560 ? 4 : 6],
      cursor: { drag: { x: false, y: false } },
      legend: { show: false },
      scales: { x: { time: true }, y: { auto: true } },
      axes: [
        {
          stroke: text,
          grid: { stroke: grid, width: 1 },
          ticks: { stroke: grid },
          size: 36,
          values: createTimeAxisFormatter(24),
        },
        {
          stroke: text,
          grid: { stroke: grid, width: 1 },
          ticks: { stroke: grid },
          size: w < 560 ? 70 : 82,
          values: (_self, splits) => splits.map((v) => (Number.isFinite(v) && v > 0 ? formatValue(v) : "")),
        },
      ],
      series: [
        { label: "时间" },
        { label: labelA, stroke: colorA, fill: `${colorA}12`, width: 1.8, points: { show: false } },
        { label: labelB, stroke: colorB, width: 1.8, points: { show: false } },
      ],
      hooks: {
        init: [
          (plot) => {
            plot.root.setAttribute("role", "img");
            plot.root.setAttribute("aria-label", ariaLabel);
          },
          tooltipHooks.onInit,
        ],
        destroy: [tooltipHooks.onDestroy],
        setCursor: [tooltipHooks.onSetCursor],
      },
    };
  }, [ariaLabel, colorA, colorB, formatValue, height, labelA, labelB, resolvedAppearance, tooltipHooks, w]);

  return (
    <div className="traffic-rate-chart">
      <div className="traffic-rate-chart-legend" aria-hidden>
        <span><i style={{ background: colorA }} />{labelA}</span>
        <span><i style={{ background: colorB }} />{labelB}</span>
      </div>
      <div ref={chartSizeRef} className="traffic-rate-chart-canvas">
        <UplotReact options={options} data={data} />
        <ChartTooltip tooltip={tooltip} />
      </div>
    </div>
  );
}
