import type { CSSProperties, ReactNode } from "react";
import { clamp01 } from "./nodeCardShared";

interface MetricBarProps {
  icon: ReactNode;
  label: string;
  valueText: string;
  unit?: string;
  detailText?: string;
  fraction: number; // 0..1
  paint: string; // 填充色 (CSS color)
}

type MetricTrackStyle = CSSProperties & {
  "--metric-track-color": string;
  "--metric-track-fill": string;
};

/**
 * 大卡指标条：CSS 分段轨代替 canvas。
 * 视觉对齐小卡 CompactGauge（18 段 + hard-stop 填充），避免每卡再挂 4 块 canvas。
 */
export function MetricBar({
  icon,
  label,
  valueText,
  unit,
  detailText,
  fraction,
  paint,
}: MetricBarProps) {
  const style: MetricTrackStyle = {
    "--metric-track-color": paint,
    "--metric-track-fill": `${clamp01(fraction) * 100}%`,
  };

  return (
    <div className="metric-item">
      <div className="flex justify-between items-center gap-3 min-w-0">
        <div className="flex items-center gap-1.5 text-[var(--text-secondary)] flex-shrink-0">
          <span>{icon}</span>
          <span className="text-[11px] font-medium tracking-[0.02em]">{label}</span>
        </div>
        <div className="tabular text-[13px] text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis max-w-full text-right">
          <span className="font-semibold">{valueText}</span>
          {unit && (
            <span className="ml-[1px] text-[11px] text-[var(--text-tertiary)]">{unit}</span>
          )}
        </div>
      </div>
      <div
        className="metric-detail"
        title={detailText}
        data-empty={detailText ? "false" : "true"}
      >
        {detailText ?? "\u00A0"}
      </div>
      <div className="metric-track" style={style} aria-hidden />
    </div>
  );
}
