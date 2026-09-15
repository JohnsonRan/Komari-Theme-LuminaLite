import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NodeInfoSchema } from "@/types/komari";

const { getNodes, getNodesLatestStatus } = vi.hoisted(() => ({
  getNodes: vi.fn(),
  getNodesLatestStatus: vi.fn(),
}));
vi.mock("@/services/api", () => ({ getNodes, getNodesLatestStatus }));

let store: typeof import("@/services/wsStore");
let release: (() => void) | undefined;
let doc: EventTarget & { hidden: boolean };

async function settle() {
  await vi.dynamicImportSettled();
  await vi.advanceTimersByTimeAsync(0);
}

function report(overrides: Record<string, unknown> = {}) {
  return { online: true, cpu: 25, ram: 1024, ram_total: 4096,
    connections: 12, connections_udp: 2, time: new Date().toISOString(),
    gpu: 0, gpu_count: 1, gpu_detailed_info: [
      { name: "GPU", utilization: 0, memory_used: 0, memory_total: 1024, temperature: 40 },
    ], ping: { "7": { latest: 20, loss: 0 } }, ...overrides };
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  doc = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", globalThis);
  getNodes.mockReset().mockResolvedValue([NodeInfoSchema.parse({ uuid: "node-a" })]);
  getNodesLatestStatus.mockReset().mockImplementation(async () => ({ "node-a": report() }));
  store = await import("@/services/wsStore");
  store.setPingBindingResolver(() => ["7"]);
  release = store.retainStore();
  await settle();
});

afterEach(async () => {
  release?.();
  await vi.advanceTimersByTimeAsync(0);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("RPC2 realtime store", () => {
  it("hydrates GPU, ping and TCP state, polls, and marks missing/stale nodes offline", async () => {
    expect(store.getNodeMetricsSnapshot("node-a")).toMatchObject({
      online: true, cpuPct: 25, connectionsTcp: 10, connectionsUdp: 2,
      gpu: { count: 1, usage: 0, memoryTotal: 1024 },
      pingStats: { "7": { latest: 20, loss: 0 } },
    });
    expect(getNodesLatestStatus).toHaveBeenCalledWith({ signal: expect.any(AbortSignal), timeout: 6_000 });
    getNodesLatestStatus.mockResolvedValueOnce({ "node-a": report({ time: new Date(Date.now() - 61_000).toISOString() }) });
    await vi.advanceTimersByTimeAsync(2_000);
    await settle();
    expect(store.getNodeMetricsSnapshot("node-a")?.online).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    await settle();
    expect(store.getNodeMetricsSnapshot("node-a")?.online).toBe(true);
    getNodesLatestStatus.mockResolvedValueOnce({});
    await vi.advanceTimersByTimeAsync(2_000);
    await settle();
    expect(store.getNodeMetricsSnapshot("node-a")?.online).toBe(false);
  });

  it("reports query failures and clears the alert only after a successful response", async () => {
    getNodesLatestStatus.mockRejectedValueOnce(new Error("RPC unavailable"));
    await vi.advanceTimersByTimeAsync(2_000);
    await settle();
    expect(store.getStoreStatusSnapshot().failureStreak).toBe(1);
    await vi.advanceTimersByTimeAsync(2_000);
    await settle();
    expect(store.getStoreStatusSnapshot().failureStreak).toBe(0);
  });

  it("does not overlap requests and ignores cancelled responses while hidden", async () => {
    let resolve!: (value: unknown) => void;
    getNodesLatestStatus.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await vi.advanceTimersByTimeAsync(2_000);
    await settle();
    const count = getNodesLatestStatus.mock.calls.length;
    const signal = getNodesLatestStatus.mock.calls.at(-1)![0].signal as AbortSignal;
    await vi.advanceTimersByTimeAsync(4_000);
    expect(getNodesLatestStatus).toHaveBeenCalledTimes(count);

    doc.hidden = true;
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(signal.aborted).toBe(true);
    resolve({ "node-a": report({ cpu: 99 }) });
    await settle();
    expect(store.getNodeMetricsSnapshot("node-a")?.cpuPct).toBe(25);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(getNodesLatestStatus).toHaveBeenCalledTimes(count);

    doc.hidden = false;
    doc.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(getNodesLatestStatus).toHaveBeenCalledTimes(count + 1);
    expect(store.getStoreStatusSnapshot().failureStreak).toBe(0);
  });
});
