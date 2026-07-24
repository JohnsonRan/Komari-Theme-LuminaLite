import { memo, type CSSProperties } from "react";
import { clsx } from "clsx";
import type { NodePingSeries } from "@/hooks/useNodeCardModel";

// 丢包低于这个百分比时按 toFixed(1) 会显示成 "0.0%" —— 用红色写一个 0.0 只会让人以为
// 是渲染 bug,所以这条以下只留底部色条,不追加数值。
const LOSS_TEXT_THRESHOLD = 0.05;

function lossBarColor(loss: number | null | undefined, lossColor: string) {
  // 无样本用轨道色,读作"没数据"而不是"丢包未知"(lossHeatColor 对 null 给的是正文三级色,
  // 压到 2px 高时会和"轻微丢包"的暖色难以区分)。
  return loss == null || !Number.isFinite(loss) || loss < 0
    ? "var(--progress-bg)"
    : lossColor;
}

// 节点绑定了多个首页 Ping 任务时(最多 3 个,典型场景是三网延迟)渲染的任务标签行。
// 三个任务的当前延迟同时可见,点击某个标签把下方的延迟/丢包柱状图切换到该任务。
//
// 丢包率不占固定宽度:每个标签底部常驻一条 2px 丢包热力色条(绿=无丢包,黄/红=有丢包),
// 只有真的在丢包时才追加具体百分比 —— 丢包 99% 的时间是 0.0%,给它固定的版面预算并不划算,
// 但"哪条线路在丢"必须一眼看见。
//
// 只在 pingSeries.length > 1 时渲染:单任务卡片的视觉与改动前完全一致。
export const PingTaskTabs = memo(function PingTaskTabs({
  series,
  activeIndex,
  onSelect,
  size = "regular",
}: {
  series: NodePingSeries[];
  activeIndex: number;
  onSelect: (index: number) => void;
  size?: "regular" | "small";
}) {
  if (series.length < 2) return null;

  return (
    <div className="ping-task-tabs" data-size={size} role="tablist" aria-label="延迟任务">
      {series.map((entry, index) => {
        const active = index === activeIndex;
        const { lastValue, loss } = entry.ping;
        const valueText = lastValue != null ? Math.round(lastValue).toString() : "--";
        const hasLoss = loss != null && Number.isFinite(loss) && loss >= LOSS_TEXT_THRESHOLD;
        const lossText =
          loss == null || !Number.isFinite(loss) || loss < 0 ? "无数据" : `${loss.toFixed(1)}%`;
        return (
          <button
            key={entry.taskId ?? index}
            type="button"
            role="tab"
            aria-selected={active}
            className={clsx("ping-task-tab", active && "is-active")}
            style={
              {
                "--ping-task-loss": lossBarColor(loss, entry.lossColor),
              } as CSSProperties
            }
            title={`${entry.label} · 延迟 ${
              lastValue != null ? `${valueText} ms` : "无样本"
            } · 丢包 ${lossText}`}
            onClick={(event) => {
              // 列表视图里整行是一个 <Link>,不拦截会连带跳转到详情页。
              event.preventDefault();
              event.stopPropagation();
              onSelect(index);
            }}
          >
            <span className="ping-task-tab-label">{entry.label}</span>
            <span
              className="ping-task-tab-value tabular"
              style={{ color: lastValue != null ? entry.latencyColor : undefined }}
            >
              {valueText}
              <small>ms</small>
            </span>
            {hasLoss && (
              <span
                className="ping-task-tab-loss tabular"
                style={{ color: entry.lossColor }}
              >
                {loss.toFixed(1)}
                <small>%</small>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});
