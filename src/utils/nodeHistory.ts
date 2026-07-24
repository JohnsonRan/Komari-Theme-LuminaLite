// 首页 24 小时历史的纯计算层：把 metric API 返回的稀疏点铺回等宽时间网格，
// 从中同时得出「上报连续性」和「趋势 sparkline」两样东西。
//
// 关键前提：**后端省略没有数据的桶**（实测 tz.ihtw.moe，fill_empty 也只补 1~2 个边界
// null 点，不补齐网格）。所以缺口不能靠 count === 0 判断，只能把返回点按时间戳落回
// 我们自己铺的网格，落不上的格子就是「那段时间探针没上报」。

export interface HistoryPoint {
  time: string;
  value: number | null;
  count: number;
}

export interface HistorySlot {
  /** 桶起点（ms）。 */
  startAt: number;
  /** 桶内均值；无数据为 null。 */
  value: number | null;
  /** 该桶有没有上报。 */
  reported: boolean;
}

export interface NodeHistory {
  slots: HistorySlot[];
  /** 有上报的桶占比 0..1，作为「最近 24 小时上报率」。 */
  reportedRatio: number;
  /** 是否整段都没有数据（节点长期离线 / 从未上报）。 */
  empty: boolean;
}

export const EMPTY_NODE_HISTORY: NodeHistory = {
  slots: [],
  reportedRatio: 0,
  empty: true,
};

/**
 * 把稀疏点铺回 `slotCount` 个等宽桶。
 *
 * 一个返回点可能落在网格的任意位置（后端桶宽由 max_points 决定，我们请求什么就得到什么，
 * 但仍按时间戳对齐而不是按下标，避免边界点错位一格）。同一格里有多个点时取均值。
 */
export function buildNodeHistory(
  points: HistoryPoint[],
  rangeStartMs: number,
  rangeEndMs: number,
  slotCount: number,
): NodeHistory {
  if (slotCount <= 0 || rangeEndMs <= rangeStartMs) return EMPTY_NODE_HISTORY;

  const slotMs = (rangeEndMs - rangeStartMs) / slotCount;
  const sums = new Array<number>(slotCount).fill(0);
  const counts = new Array<number>(slotCount).fill(0);

  for (const point of points) {
    // 后端返回的 value 为 null 表示该点没有有效读数（fill_empty 补的边界点就是这样），
    // 它不代表「上报了」，直接跳过。
    if (point.value == null || !Number.isFinite(point.value)) continue;
    const ts = Date.parse(point.time);
    if (!Number.isFinite(ts)) continue;
    let index = Math.floor((ts - rangeStartMs) / slotMs);
    if (index < 0 || index >= slotCount) {
      // 容忍恰好落在右边界上的点（后端的 end 与我们的 rangeEnd 会差几毫秒）。
      if (index === slotCount) index = slotCount - 1;
      else continue;
    }
    sums[index] += point.value;
    counts[index] += 1;
  }

  let reported = 0;
  const slots = Array.from({ length: slotCount }, (_, index) => {
    const hit = counts[index] > 0;
    if (hit) reported += 1;
    return {
      startAt: rangeStartMs + index * slotMs,
      value: hit ? sums[index] / counts[index] : null,
      reported: hit,
    };
  });

  return {
    slots,
    reportedRatio: reported / slotCount,
    empty: reported === 0,
  };
}

/**
 * 「上报 98%」这类短文案，给已经自带「近 24 小时」标题的位置用（大卡片）。
 * 整段无数据时给出明确说法而不是 0%。
 */
export function formatReportedPercent(history: NodeHistory): string {
  if (history.empty) return "无上报";
  const pct = history.reportedRatio * 100;
  // 99.x% 向下取整到 99，避免把「断过一格」显示成 100%。
  const shown = pct >= 100 ? "100" : Math.floor(pct).toString();
  return `上报 ${shown}%`;
}

/** 带时间范围前缀的完整说法，给没有标题的位置用（tooltip、小卡/迷你卡）。 */
export function formatReportedRatio(history: NodeHistory): string {
  return `近 24 小时${formatReportedPercent(history)}`;
}
