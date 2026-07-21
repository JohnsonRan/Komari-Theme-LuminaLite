import { describe, expect, it } from "vitest";
import {
  buildPingBuckets,
  buildPingOverviewItems,
} from "@/hooks/usePingOverview";

const MINUTE_MS = 60_000;
const NOW = Date.UTC(2026, 6, 17, 11, 2);
const WINDOW_START = NOW - 60 * MINUTE_MS;

function aggregateSamples(intervalMinutes: number) {
  const alignedStart = Date.UTC(2026, 6, 17, 10, 0);
  const count = Math.ceil((NOW - alignedStart) / (intervalMinutes * MINUTE_MS));
  return Array.from({ length: count }, (_, index) => ({
    time: alignedStart + index * intervalMinutes * MINUTE_MS,
    value: 40 + index,
    count: intervalMinutes,
    loss: 0,
  }));
}

describe("homepage ping metric interval adaptation", () => {
  it("propagates the metric API interval into the homepage item", () => {
    const items = buildPingOverviewItems(
      7,
      [
        {
          task_id: 7,
          time: "2026-07-17T10:00:00Z",
          value: 42,
          client: "node-a",
          count: 5,
          loss: 0,
        },
      ],
      [],
      300,
    );

    expect(items.get("node-a")?.metricIntervalMs).toBe(5 * MINUTE_MS);
  });

  it("projects 1.2.7 five-minute aggregates across twenty-four continuous buckets", () => {
    const buckets = buildPingBuckets(
      {
        metricIntervalMs: 5 * MINUTE_MS,
        samples: aggregateSamples(5),
      },
      24,
      NOW,
    );

    expect(buckets).toHaveLength(24);
    expect(buckets.every((bucket) => bucket.total > 0 && bucket.value != null)).toBe(true);
    expect(buckets[0]?.startAt).toBe(WINDOW_START);
    expect(buckets[23]?.endAt).toBe(NOW);
  });

  it("removes the compact-card two-on one-off artifact without hiding a real gap", () => {
    const samples = aggregateSamples(5).filter(
      (sample) => sample.time !== Date.UTC(2026, 6, 17, 10, 30),
    );
    const buckets = buildPingBuckets(
      { metricIntervalMs: 5 * MINUTE_MS, samples },
      18,
      NOW,
    );

    expect(buckets).toHaveLength(18);
    expect(buckets.filter((bucket) => bucket.total === 0)).toHaveLength(2);
  });

  it("keeps 1.2.6 two-minute aggregates at the existing 24-bucket density", () => {
    const buckets = buildPingBuckets(
      {
        metricIntervalMs: 2 * MINUTE_MS,
        samples: Array.from({ length: 31 }, (_, index) => ({
          time: WINDOW_START + index * 2 * MINUTE_MS,
          value: 30,
          count: 2,
          loss: 0,
        })),
      },
      24,
      NOW,
    );

    expect(buckets).toHaveLength(24);
    expect(buckets.every((bucket) => bucket.total > 0)).toBe(true);
  });

  it("preserves the legacy fixed bucket count when interval metadata is absent", () => {
    const buckets = buildPingBuckets(
      {
        samples: [{ time: NOW - MINUTE_MS, value: 25 }],
      },
      18,
      NOW,
    );

    expect(buckets).toHaveLength(18);
    expect(buckets.filter((bucket) => bucket.total > 0)).toHaveLength(1);
  });
});
