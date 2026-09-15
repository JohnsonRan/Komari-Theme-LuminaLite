import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpcCallMock } = vi.hoisted(() => ({ rpcCallMock: vi.fn() }));

vi.mock("@/services/rpc2Client", () => ({
  getRpc2Client: () => ({ call: rpcCallMock }),
}));

import { getLoadRecords, getNodesLatestStatus, getPingOverview, getPingRecords } from "@/services/api";

const START = "2026-07-15T03:00:00Z";
const END = "2026-07-15T04:00:00Z";
const TAGS = { task_id: "7" };

function metricSeries(
  metricKey: string,
  points: Array<{ time: string; value: number | null; count?: number }>,
) {
  return {
    metric_key: metricKey,
    entity_id: "node-a",
    tags: TAGS,
    interval_seconds: 60,
    points,
  };
}

function aggregatePayload(hasGap: boolean) {
  const latency = hasGap
    ? [
        { time: "2026-07-15T03:43:00Z", value: 20, count: 1 },
        { time: "2026-07-15T03:44:00Z", value: null, count: 0 },
        { time: "2026-07-15T03:45:00Z", value: 30, count: 1 },
      ]
    : [
        { time: "2026-07-15T03:43:00Z", value: 20, count: 1 },
        { time: "2026-07-15T03:44:00Z", value: 25, count: 1 },
        { time: "2026-07-15T03:45:00Z", value: 30, count: 1 },
      ];
  const loss = latency.map((point) => ({
    ...point,
    value: point.count === 0 ? null : 0,
  }));
  return {
    start: START,
    end: END,
    series: [
      metricSeries("ping.latency_ms", latency),
      metricSeries("ping.loss", loss),
    ],
  };
}

function installRpcResponses({ hasGap, rawFails = false }: { hasGap: boolean; rawFails?: boolean }) {
  rpcCallMock.mockImplementation((method: string, params: Record<string, unknown>) => {
    if (method === "public:getPingMetricStats") {
      return Promise.resolve({
        stats: [
          {
            entity_id: "node-a",
            task_id: 7,
            name: "广州探测",
            interval: 60,
            total: hasGap ? 2 : 3,
            valid: hasGap ? 2 : 3,
            loss: 0,
            avg: 25,
            latest: 30,
          },
        ],
      });
    }
    if (method === "public:getPublicPingTasks") {
      return Promise.resolve([
        {
          id: 7,
          interval: 60,
          name: "广州探测",
          clients: ["node-a"],
        },
      ]);
    }
    if (method === "public:queryMetrics" && params.downsample === false) {
      if (rawFails) return Promise.reject(new Error("raw query failed"));
      return Promise.resolve({
        start: "2026-07-15T03:40:00Z",
        end: "2026-07-15T03:46:00Z",
        series: [
          metricSeries("ping.latency_ms", [
            { time: "2026-07-15T03:44:15Z", value: 50 },
          ]),
          metricSeries("ping.loss", [
            { time: "2026-07-15T03:44:15Z", value: 0 },
          ]),
        ],
      });
    }
    if (method === "public:queryMetrics") {
      return Promise.resolve(aggregatePayload(hasGap));
    }
    return Promise.reject(new Error(`Unexpected RPC method: ${method}`));
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("current Komari API contract", () => {
  beforeEach(() => rpcCallMock.mockReset());

  it.each(["load", "ping", "overview"])("propagates %s metric errors without legacy requests", async (kind) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const error = new Error("Method not found: public:queryMetrics");
    rpcCallMock.mockRejectedValue(error);
    const request = () => kind === "load" ? getLoadRecords("node-a", 1)
      : kind === "ping" ? getPingRecords("node-a", 1)
        : getPingOverview(1, 7, { entityIds: ["node-a"] });
    await expect(request()).rejects.toBe(error);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rpcCallMock.mock.calls.every(([method]) => String(method).startsWith("public:"))).toBe(true);

    // 不永久缓存方法缺失；后端恢复/升级后允许正常查询。
    rpcCallMock.mockResolvedValue({ series: [] });
    await expect(request()).resolves.toMatchObject({ records: [] });
  });

  it("reads validated latest status through RPC2 and preserves GPU/ping fields", async () => {
    const data = { "node-a": { online: true, cpu: 12, gpu_count: 1,
      gpu_average_usage: 0, gpu_detailed_info: [{ name: "GPU", utilization: 0 }],
      ping: { "7": { latest: 20, loss: 0 } } } };
    rpcCallMock.mockResolvedValue(data);
    const options = { signal: new AbortController().signal, timeout: 6_000 };
    expect(await getNodesLatestStatus(options)).toEqual(data);
    expect(rpcCallMock).toHaveBeenCalledWith("common:getNodesLatestStatus", {}, options);

    rpcCallMock.mockResolvedValue({ "node-a": { online: "true" } });
    await expect(getNodesLatestStatus()).rejects.toThrow("Schema mismatch");
  });
});

describe("metric boundary repair in the API adapter", () => {
  beforeEach(() => {
    rpcCallMock.mockReset();
  });

  it("does not request raw data when the aggregate boundary is continuous", async () => {
    installRpcResponses({ hasGap: false });
    const result = await getPingOverview(1, 7, { entityIds: ["node-a"] });

    expect(result.records).toHaveLength(3);
    const metricCalls = rpcCallMock.mock.calls.filter(
      ([method]) => method === "public:queryMetrics",
    );
    expect(metricCalls).toHaveLength(1);
  });

  it("requests only the bounded raw window and fills the empty bucket", async () => {
    installRpcResponses({ hasGap: true });
    const result = await getPingOverview(1, 7, { entityIds: ["node-a"] });

    expect(result.records).toHaveLength(3);
    expect(result.records.find((record) => record.time === "2026-07-15T03:44:00Z"))
      .toMatchObject({ value: 50, count: 1, loss: 0 });
    expect(result.stats?.[0]).toMatchObject({ total: 3, valid: 3, loss: 0 });

    const metricCalls = rpcCallMock.mock.calls.filter(
      ([method]) => method === "public:queryMetrics",
    );
    expect(metricCalls).toHaveLength(2);
    expect(metricCalls[1][1]).toMatchObject({
      entity_ids: ["node-a"],
      tags: TAGS,
      downsample: false,
      start: "2026-07-15T03:40:00.000Z",
      end: "2026-07-15T03:46:00.000Z",
    });
  });

  it("keeps the aggregate result when the optional raw repair fails", async () => {
    installRpcResponses({ hasGap: true, rawFails: true });
    const result = await getPingOverview(1, 7, { entityIds: ["node-a"] });

    expect(result.records).toHaveLength(2);
    expect(result.records.map((record) => record.time)).not.toContain(
      "2026-07-15T03:44:00Z",
    );
  });

  it("does not run stats or boundary repair on the ping detail path", async () => {
    installRpcResponses({ hasGap: true });

    const result = await getPingRecords("node-a", 24);

    expect(result.records).toHaveLength(2);
    const metricCalls = rpcCallMock.mock.calls.filter(
      ([method]) => method === "public:queryMetrics",
    );
    expect(metricCalls).toHaveLength(1);
    expect(metricCalls[0][1]).toMatchObject({
      entity_ids: ["node-a"],
      fill_empty: false,
    });
    expect(rpcCallMock).not.toHaveBeenCalledWith(
      "public:getPingMetricStats",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("treats null metric points as no samples without falling back to placeholder records", async () => {
    // 真实 1.5.0-fix1 响应：CPU 有样本，未采集的 GPU 序列 points 为 null。
    rpcCallMock.mockImplementation((method: string) => Promise.resolve(method === "public:queryMetrics"
      ? { series: [
          metricSeries("cpu.usage", [{ time: START, value: 10, count: 1 }]),
          { ...metricSeries("gpu.usage", []), points: null },
        ] }
      : { count: 1, records: [{ time: START, cpu: 10, gpu: 0 }] }));

    const result = await getLoadRecords("node-a", 1);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].cpu).toBe(10);
    expect(result.records[0].gpu).toBeUndefined();
    expect(rpcCallMock).toHaveBeenCalledTimes(1);
  });

  it("accepts a null metric series list as an empty query", async () => {
    rpcCallMock.mockResolvedValue({ series: null, count: 0, records: [] });
    expect((await getLoadRecords("node-a", 1)).records).toEqual([]);
    expect(rpcCallMock).toHaveBeenCalledTimes(1);
  });

  it("forwards timeout and cancellation to metric queries", async () => {
    rpcCallMock.mockResolvedValue({ series: [] });
    const options = { signal: new AbortController().signal, timeout: 8_000 };

    await getLoadRecords("node-a", 24, options);
    await getPingRecords("node-a", 24, options);

    const calls = rpcCallMock.mock.calls.filter(([method]) => method === "public:queryMetrics");
    expect(calls).toHaveLength(2);
    for (const [, params, callOptions] of calls) {
      expect(params).toMatchObject({ entity_ids: ["node-a"], hours: 24 });
      expect(callOptions).toEqual(options);
    }
  });
});
