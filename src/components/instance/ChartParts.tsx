import { useEffect, useRef } from "react";
import type { ChartTooltipState } from "./chartShared";

export function ChartTooltip({
  tooltip,
  bindElement,
}: {
  tooltip: ChartTooltipState;
  /** 与 buildChartTooltipHooks 返回的 bindElement 对接，用于光标位移直写 transform。 */
  bindElement?: (node: HTMLElement | null) => void;
}) {
  const nodeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!bindElement) return;
    bindElement(nodeRef.current);
    return () => bindElement(null);
  }, [bindElement, tooltip.show]);

  if (!tooltip.show) return null;
  return (
    <div
      ref={nodeRef}
      aria-hidden="true"
      className="instance-chart-tooltip"
      style={{
        transform: `translate3d(${tooltip.left}px, ${tooltip.top}px, 0)`,
      }}
    >
      <div className="instance-chart-tooltip-time">{tooltip.time}</div>
      {tooltip.rows.map((row) => (
        <div key={`${row.label}-${row.color}`} className="instance-chart-tooltip-row">
          <span
            aria-hidden="true"
            className="instance-chart-tooltip-dot"
            style={{ background: row.color }}
          />
          <span>{row.label}</span>
          <strong>{row.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function SwitchToggle({
  label,
  active,
  onToggle,
  title,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      className="instance-toggle-button instance-switch-button"
      data-active={active ? "true" : "false"}
      onClick={onToggle}
      aria-pressed={active}
      title={title}
    >
      <span className="instance-switch-copy">{label}</span>
      <span className="instance-switch-track" aria-hidden>
        <span className="instance-switch-thumb" />
      </span>
      <span className="instance-switch-state">{active ? "开启" : "关闭"}</span>
    </button>
  );
}
