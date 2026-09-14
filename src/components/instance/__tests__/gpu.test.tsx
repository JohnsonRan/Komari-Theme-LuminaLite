import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InstanceDetails } from "../InstanceDetails";
import { LoadChart, pointFromNode, pointFromRecord } from "../LoadChart";
import { LoadRecordSchema, NodeInfoSchema, type LoadRecord, type NodeMetrics } from "@/types/komari";
import { RecentStatusRecordSchema } from "@/services/api";
import { mergeLoadMetricSeries } from "@/utils/loadMetrics";

vi.mock("uplot-react", () => ({ default: () => null }));
vi.mock("@/hooks/useNode", () => ({ useNodeMeta: () => state.meta, useNodeMetrics: () => state.node }));
vi.mock("@/hooks/useRecords", () => ({ useLoadRecords: () => ({ data: { records: state.records }, refetch: vi.fn() }) }));
vi.mock("@/hooks/useRecentStatus", () => ({ useRecentStatus: () => ({ data: state.recentRecords }) }));
vi.mock("@/hooks/useThemeSettings", () => ({ useThemeSettings: () => ({ isReady: true, enableAdminButton: state.adminButton, detailNetworkUnit: "mbs" }) }));
vi.mock("@/hooks/usePreferences", () => ({ usePreferences: () => ({ resolvedAppearance: "light" }) }));

const time = "2026-09-14T12:00:00Z";
const state = {
  meta: NodeInfoSchema.parse({ uuid: "node-1", gpu_name: "GPU" }),
  records: [LoadRecordSchema.parse({ time, gpu: 0 })] as LoadRecord[],
  recentRecords: [] as ReturnType<typeof RecentStatusRecordSchema.parse>[],
  adminButton: true,
  node: {
    online: true, cpuPct: 0, ramUsed: 0, ramTotal: 0, ramPct: 0,
    swapUsed: 0, swapTotal: 0, diskUsed: 0, diskTotal: 0, diskPct: 0,
    netUp: 0, netDown: 0, trafficUp: 0, trafficDown: 0, uptime: 0,
    load1: 0, load5: 0, load15: 0, process: 0, connectionsTcp: 0, connectionsUdp: 0,
    updatedAt: Date.parse(time), pingStats: null,
    gpuPct: 0, gpuMemUsed: 0, gpuMemTotal: 0, gpuTemp: 0,
  } as NodeMetrics,
};

beforeEach(() => {
  state.meta.gpu_name = "GPU";
  state.node.gpu = undefined;
  state.records = [LoadRecordSchema.parse({ time, gpu: 0 })];
  state.recentRecords = [];
  state.adminButton = true;
});

describe("GPU chart availability", () => {
  it("retains missing versus zero through historical and recent-status schemas", () => {
    for (const schema of [LoadRecordSchema, RecentStatusRecordSchema]) {
      const missing = schema.parse({ time });
      expect(pointFromRecord(missing, 1, 0, 0, 0)).toMatchObject({ gpu: null, gpuMem: null, gpuMemBytes: null, gpuTemp: null });
      const idle = schema.parse({ time, gpu: 0, gpu_memory_used: 0, gpu_memory_total: 1024, gpu_temperature: 0 });
      expect(pointFromRecord(idle, 1, 0, 0, 0)).toMatchObject({ gpu: 0, gpuMem: 0, gpuMemBytes: 0, gpuTemp: 0 });
    }
  });

  it("does not synthesize GPU metrics for CPU-only history buckets", () => {
    const records = mergeLoadMetricSeries([
      { metricKey: "cpu.usage", client: "node-1", points: [{ time, value: 10, count: 1 }] },
    ]);
    expect(records[0].gpu).toBeUndefined();
    expect(records[0].gpu_memory_used).toBeUndefined();
    const idle = mergeLoadMetricSeries([
      { metricKey: "gpu.usage", client: "node-1", points: [{ time, value: 0, count: 1 }] },
    ]);
    expect(idle[0].gpu).toBe(0);
  });

  it("uses real report availability instead of default scalar zeros for realtime curves", () => {
    expect(pointFromNode(state.node)).toMatchObject({ gpu: null, gpuMem: null, gpuTemp: null });
    state.node.gpu = { count: 1, usage: 0 };
    expect(pointFromNode(state.node)).toMatchObject({ gpu: 0, gpuMem: null, gpuMemBytes: null, gpuTemp: null });
  });

  it("shows recorded idle utilization without requiring a model name, memory or temperature", () => {
    state.meta.gpu_name = "";
    state.records = mergeLoadMetricSeries([
      { metricKey: "gpu.usage", client: "node-1", points: [{ time, value: 0, count: 1 }] },
    ]);
    const html = renderToStaticMarkup(<LoadChart uuid="node-1" hours={1} />);
    expect(html).toContain("GPU 使用率");
    expect(html).toContain("0.00%");
    expect(html).not.toContain("GPU 显存");
    expect(html).not.toContain("GPU 温度");
  });

  it("does not treat a static GPU model as evidence for legacy or recent placeholder zeros", () => {
    state.meta.gpu_name = "AMD Radeon (TM) Graphics × 2, Microsoft Basic Render Driver";
    expect(renderToStaticMarkup(<LoadChart uuid="node-1" hours={1} />)).not.toContain("GPU 使用率");
    state.records = [];
    state.recentRecords = [RecentStatusRecordSchema.parse({ time, gpu: 0 })];
    expect(renderToStaticMarkup(<LoadChart uuid="node-1" hours={1} />)).not.toContain("GPU 使用率");
  });

  it("keeps idle charts when a live utilization report confirms zero", () => {
    state.node.gpu = { count: 1, usage: 0 };
    expect(renderToStaticMarkup(<LoadChart uuid="node-1" hours={0} />)).toContain("GPU 使用率");
  });

  it("keeps legacy GPU data supported by nonzero usage or reported memory", () => {
    state.records = [LoadRecordSchema.parse({ time, gpu: 20 })];
    expect(renderToStaticMarkup(<LoadChart uuid="node-1" hours={1} />)).toContain("GPU 使用率");
    state.records = [LoadRecordSchema.parse({ time, gpu: 0, gpu_memory_total: 1024, gpu_memory_used: 0 })];
    expect(renderToStaticMarkup(<LoadChart uuid="node-1" hours={1} />)).toContain("GPU 使用率");
  });

  it("hides missing reports and zero placeholders from nodes without a GPU", () => {
    state.records = [LoadRecordSchema.parse({ time })];
    expect(renderToStaticMarkup(<LoadChart uuid="node-1" hours={1} />)).not.toContain("GPU 使用率");
    state.records = [LoadRecordSchema.parse({ time, gpu: 0 })];
    state.meta.gpu_name = "None";
    expect(renderToStaticMarkup(<LoadChart uuid="node-1" hours={1} />)).not.toContain("GPU 使用率");
  });
});

describe("GPU details and management entry", () => {
  it("labels live charts and hardware from the sampled GPU instead of the static inventory", () => {
    // 真实响应形状：静态枚举带 ×2 和 AMD，但详细上报仅包含一张 RTX 5080。
    state.meta.gpu_name = "NVIDIA GeForce RTX 5080 × 2, AMD Radeon(TM) Graphics";
    state.node.gpu = { count: 1, usage: 93, memoryUsed: 12028215296, memoryTotal: 17094934528, temperature: 62,
      devices: [{ name: "NVIDIA GeForce RTX 5080", usage: 93, memoryUsed: 12028215296, memoryTotal: 17094934528, temperature: 62 }] };
    state.records = [LoadRecordSchema.parse({ time, gpu: 93, gpu_memory_used: 12028215296, gpu_memory_total: 17094934528, gpu_temperature: 62 })];
    const details = renderToStaticMarkup(<InstanceDetails uuid="node-1" />);
    expect(details).toContain("监控显卡");
    expect(details).toContain("GPU 设备 · 1");
    for (const html of [details, renderToStaticMarkup(<LoadChart uuid="node-1" hours={0} />)]) {
      expect(html).toContain("NVIDIA GeForce RTX 5080");
      expect(html).not.toContain("AMD Radeon");
      expect(html).not.toContain("× 2");
    }
  });

  it("does not assign current device identities to historical aggregate samples", () => {
    state.meta.gpu_name = "NVIDIA GeForce RTX 5080 × 2, AMD Radeon(TM) Graphics";
    state.node.gpu = { count: 1, usage: 20, devices: [{ name: "NVIDIA GeForce RTX 5080", usage: 20 }] };
    state.records = [LoadRecordSchema.parse({ time, gpu: 20 })];
    const html = renderToStaticMarkup(<LoadChart uuid="node-1" hours={1} />);
    expect(html).toContain("历史采集设备汇总");
    expect(html).not.toContain("NVIDIA GeForce");
    expect(html).not.toContain("AMD Radeon");
  });

  it("preserves two reported devices even when they have the same model name", () => {
    state.node.gpu = { count: 2, usage: 0, devices: [
      { name: "NVIDIA GeForce RTX 5080", usage: 0 },
      { name: "NVIDIA GeForce RTX 5080", usage: 0 },
    ] };
    const details = renderToStaticMarkup(<InstanceDetails uuid="node-1" />);
    expect(details).toContain("GPU 设备 · 2");
    expect(details.match(/NVIDIA GeForce RTX 5080/g)).toHaveLength(2);
    expect(renderToStaticMarkup(<LoadChart uuid="node-1" hours={0} />)).toContain("2 张 GPU 汇总");
  });

  it("explicitly labels inventory-only information when no GPU report is available", () => {
    state.meta.gpu_name = "Integrated GPU";
    const html = renderToStaticMarkup(<InstanceDetails uuid="node-1" />);
    expect(html).toContain("系统识别显卡");
    expect(html).toContain("Integrated GPU");
    expect(html).not.toContain("监控显卡");
  });

  it("does not guess a reported device model from static inventory when its name is unavailable", () => {
    state.meta.gpu_name = "Unrelated static GPU";
    state.node.gpu = { count: 1, usage: 0 };
    for (const html of [renderToStaticMarkup(<InstanceDetails uuid="node-1" />), renderToStaticMarkup(<LoadChart uuid="node-1" hours={0} />)]) {
      expect(html).toContain("1 张 GPU");
      expect(html).not.toContain("Unrelated static GPU");
    }
  });

  it("renders separate devices, valid zeros and unknown values with escaped model names", () => {
    state.node.gpu = { count: 2, devices: [
      { name: "GPU <A>", usage: 0, memoryUsed: 0, memoryTotal: 1024, temperature: 0 },
      { name: "GPU B", usage: 42 },
    ] };
    const html = renderToStaticMarkup(<InstanceDetails uuid="node-1" />);
    expect(html).toContain("GPU 设备 · 2");
    expect(html).toContain("GPU &lt;A&gt;");
    expect(html).toContain("GPU B");
    expect(html).toContain("0.00%");
    expect(html).toContain("0.0°C");
    expect(html).toContain("— / —");
    expect(html).not.toContain("/terminal?");
  });

  it("only renders management navigation for admins with the admin button enabled", () => {
    const html = renderToStaticMarkup(<InstanceDetails uuid="node /?&" isAdmin />);
    expect(html).toContain('href="/terminal?uuid=node+%2F%3F%26"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(renderToStaticMarkup(<InstanceDetails uuid="node-1" isAdmin={false} />)).not.toContain("/terminal?");
    state.adminButton = false;
    expect(renderToStaticMarkup(<InstanceDetails uuid="node-1" isAdmin />)).not.toContain("/terminal?");
  });
});
