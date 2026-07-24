import { describe, expect, it } from "vitest";
import {
  buildNodeHistory,
  formatReportedPercent,
  formatReportedRatio,
  type HistoryPoint,
} from "@/utils/nodeHistory";

const START = Date.parse("2026-07-24T00:00:00Z");
const END = Date.parse("2026-07-24T04:00:00Z");
const SLOTS = 4; // 每桶 1 小时

function point(hour: number, value: number | null): HistoryPoint {
  return {
    time: new Date(START + hour * 3_600_000).toISOString(),
    value,
    count: value == null ? 0 : 1,
  };
}

describe("buildNodeHistory", () => {
  it("marks slots with no returned point as not reported", () => {
    // 后端省略空桶（实测行为）：第 1、3 小时没有点，就是那两段没上报。
    const history = buildNodeHistory([point(0, 20), point(2, 40)], START, END, SLOTS);
    expect(history.slots.map((s) => s.reported)).toEqual([true, false, true, false]);
    expect(history.reportedRatio).toBe(0.5);
    expect(history.empty).toBe(false);
  });

  it("averages multiple points landing in the same slot", () => {
    const history = buildNodeHistory(
      [point(0, 10), { ...point(0, 30), time: new Date(START + 1_800_000).toISOString() }],
      START,
      END,
      SLOTS,
    );
    expect(history.slots[0].value).toBe(20);
  });

  it("treats a null-valued point as no data, not as a report", () => {
    // fill_empty 补的边界点就是 value: null —— 它不能算成「那段时间在上报」。
    const history = buildNodeHistory([point(0, null), point(1, 50)], START, END, SLOTS);
    expect(history.slots[0].reported).toBe(false);
    expect(history.slots[1].reported).toBe(true);
  });

  it("folds a point sitting exactly on the right edge into the last slot", () => {
    const history = buildNodeHistory([point(4, 70)], START, END, SLOTS);
    expect(history.slots[3]).toMatchObject({ reported: true, value: 70 });
  });

  it("drops points outside the range", () => {
    expect(buildNodeHistory([point(-2, 10), point(9, 10)], START, END, SLOTS).empty).toBe(true);
  });

  it("reports empty for a node that never sent anything", () => {
    const history = buildNodeHistory([], START, END, SLOTS);
    expect(history).toMatchObject({ empty: true, reportedRatio: 0 });
    expect(history.slots).toHaveLength(SLOTS);
  });
});

describe("formatReportedRatio", () => {
  it("composes the prefixed form from the bare percent", () => {
    // 大卡片自带「近 24 小时」标题，只取百分比部分；tooltip 用带前缀的完整说法。
    const history = buildNodeHistory([point(0, 10), point(1, 10)], START, END, SLOTS);
    expect(formatReportedPercent(history)).toBe("上报 50%");
    expect(formatReportedRatio(history)).toBe("近 24 小时上报 50%");
  });

  it("never rounds a gap up to 100%", () => {
    const slots = 200;
    const points = Array.from({ length: slots - 1 }, (_, i) =>
      point((i * (END - START)) / slots / 3_600_000, 10),
    );
    const history = buildNodeHistory(points, START, END, slots);
    expect(history.reportedRatio).toBeLessThan(1);
    expect(formatReportedRatio(history)).toBe("近 24 小时上报 99%");
  });

  it("says so plainly when nothing was reported", () => {
    expect(formatReportedRatio(buildNodeHistory([], START, END, SLOTS))).toBe("近 24 小时无上报");
  });
});
