import { describe, expect, it } from "vitest";
import { mergeLoadMetricSeries, type LoadMetricSeries } from "@/utils/loadMetrics";

function series(
  metricKey: string,
  time: string,
  value: number | null,
  count = 1,
): LoadMetricSeries {
  return {
    metricKey,
    client: "node-a",
    points: [{ time, value, count }],
  };
}

describe("mergeLoadMetricSeries", () => {
  it("combines metric-store series into chronological legacy load records", () => {
    const later = "2026-07-13T02:15:00Z";
    const earlier = "2026-07-13T02:00:00Z";
    const records = mergeLoadMetricSeries([
      series("cpu.usage", later, 42),
      series("memory.used", earlier, 512),
      series("memory.total", earlier, 1024),
      series("net.total.down", earlier, 2048),
      series("cpu.usage", earlier, 25),
    ]);

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      client: "node-a",
      time: earlier,
      cpu: 25,
      ram: 512,
      ram_total: 1024,
      net_total_down: 2048,
    });
    expect(records[1]).toMatchObject({ time: later, cpu: 42 });
  });

  it("ignores empty rollup buckets and unknown metrics", () => {
    expect(
      mergeLoadMetricSeries([
        series("cpu.usage", "2026-07-13T02:00:00Z", null, 0),
        series("unknown.metric", "2026-07-13T02:00:00Z", 10),
      ]),
    ).toEqual([]);
  });
});
