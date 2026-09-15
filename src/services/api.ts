import { z } from "zod";
import { ApiRequestError } from "@/services/apiError";
import { getRpc2Client } from "@/services/rpc2Client";
import {
  MeSchema,
  NodeInfoSchema,
  PublicConfigSchema,
  PingTaskSchema,
  type Me,
  type NodeInfo,
  type PublicConfig,
  type LoadRecordsResponse,
  type PingRecordsResponse,
  type PingTask,
  type PingTaskStats,
} from "@/types/komari";
import { fetchWithTimeout } from "@/utils/abort";
import {
  LOAD_LAST_AGGREGATION,
  LOAD_METRIC_KEYS,
  mergeLoadMetricSeries,
  type LoadMetricSeries,
} from "@/utils/loadMetrics";
import {
  mergePingMetricSeries,
  pingTasksFromMetricStats,
  reconcilePingMetricStats,
  PING_LATENCY_METRIC,
  PING_LOSS_METRIC,
  type PingMetricSeries,
} from "@/utils/pingMetrics";
import {
  fillMetricBoundaryGaps,
  getMetricBoundaryRepairRange,
  hasMetricBoundaryGap,
  type MetricBoundaryAggregation,
  type MetricBoundarySeries,
} from "@/utils/metricBoundaryRepair";
import {
  TODAY_TRAFFIC_AGGREGATION,
  TODAY_TRAFFIC_METRIC_KEYS,
  type TrafficMetricSeries,
} from "@/utils/trafficStats";

const ApiEnvelope = <T extends z.ZodTypeAny>(inner: T) =>
  z.object({
    status: z.string().optional(),
    message: z.string().optional(),
    data: inner,
  });

const MetricPointSchema = z
  .object({
    time: z.string(),
    value: z.number().nullable().default(null),
    count: z.number().default(0),
  })
  .passthrough();

const MetricSeriesSchema = z
  .object({
    metric_key: z.string(),
    entity_id: z.string().default(""),
    tags: z.record(z.string(), z.string()).optional(),
    tag: z.record(z.string(), z.string()).optional(),
    interval_seconds: z.number().default(0),
    // Go 的空切片可能序列化为 null；空序列不是接口失败。
    points: z.array(MetricPointSchema).nullish().transform((value) => value ?? []),
  })
  .passthrough();

const MetricQueryResponseSchema = z
  .object({
    start: z.string().optional(),
    end: z.string().optional(),
    series: z.array(MetricSeriesSchema).nullish().transform((value) => value ?? []),
  })
  .passthrough();

const PingMetricStatSchema = z
  .object({
    entity_id: z.string().default(""),
    task_id: z.union([z.string(), z.number()]),
    name: z.string().default(""),
    type: z.string().default("icmp"),
    interval: z.number().default(60),
    total: z.number().default(0),
    valid: z.number().default(0),
    loss: z.number().default(0),
    min: z.number().nullable().optional(),
    max: z.number().nullable().optional(),
    avg: z.number().nullable().optional(),
    latest: z.number().nullable().optional(),
    p50: z.number().nullable().optional(),
    p99: z.number().nullable().optional(),
    stddev: z.number().nullable().optional(),
    p99_p50_ratio: z.number().default(0),
  })
  .passthrough();

const PingMetricStatsResponseSchema = z
  .object({
    stats: z.array(PingMetricStatSchema).default([]),
  })
  .passthrough();

const OVERVIEW_METRIC_MAX_POINTS = 24;
const DETAIL_METRIC_MAX_POINTS = 500;
// 普通 HTTP GET(/api/nodes、/api/public)自身没有传输超时,
// 在这里统一兜底,half-open socket 能快速失败而不是无限挂住调用方。
const DEFAULT_API_TIMEOUT_MS = 12_000;

interface PingOverviewResponse {
  records: PingRecordsResponse["records"];
  tasks: PingTask[];
  rangeStartMs?: number;
  rangeEndMs?: number;
  intervalSeconds?: number;
  stats?: PingTaskStats[];
}

interface RequestRange {
  rangeStartMs: number;
  rangeEndMs: number;
}

interface ApiCallOptions {
  signal?: AbortSignal;
  timeout?: number;
}

function createRequestRange(hours: number, now = Date.now()): RequestRange {
  const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 1;
  return {
    rangeStartMs: now - safeHours * 60 * 60 * 1000,
    rangeEndMs: now,
  };
}

function getMetricPayloadRange(
  payload: z.output<typeof MetricQueryResponseSchema>,
  fallback: RequestRange,
): RequestRange {
  const start = Date.parse(payload.start ?? "");
  const end = Date.parse(payload.end ?? "");
  return {
    rangeStartMs: Number.isFinite(start) ? start : fallback.rangeStartMs,
    rangeEndMs: Number.isFinite(end) ? end : fallback.rangeEndMs,
  };
}

async function apiGet<T>(
  path: string,
  schema: z.ZodType<T>,
  options?: { signal?: AbortSignal; timeout?: number },
): Promise<T> {
  const resp = await fetchWithTimeout(
    path,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
    options?.timeout ?? DEFAULT_API_TIMEOUT_MS,
    options?.signal,
  );
  if (!resp.ok) {
    throw new ApiRequestError(`Request ${path} failed: ${resp.status}`, resp.status, path);
  }
  const json = (await resp.json()) as unknown;
  const envelopeResult = ApiEnvelope(schema).safeParse(json);
  if (envelopeResult.success) return envelopeResult.data.data as T;
  const rawResult = schema.safeParse(json);
  if (rawResult.success) return rawResult.data;
  // 两种解析错误都抛出来:enveloped 接口看 envelope 错误,裸 array/object 接口看 raw
  // 错误,而这里无法判断接口本该返回哪种结构。
  throw new Error(
    `Schema mismatch on ${path}: envelope=${
      envelopeResult.error.issues[0]?.message ?? ""
    }; raw=${rawResult.error.issues[0]?.message ?? ""}`,
  );
}

async function rpcCall<T>(
  method: string,
  params: Record<string, unknown>,
  schema: z.ZodType<T>,
  options?: { timeout?: number; signal?: AbortSignal },
): Promise<T> {
  const payload = await getRpc2Client().call(method, params, options);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      `Schema mismatch on rpc:${method}: ${parsed.error.issues[0]?.message ?? ""}`,
    );
  }
  return parsed.data;
}

function derivePingTasks(records: PingRecordsResponse["records"]): PingTask[] {
  return Array.from(new Set(records.map((record) => record.task_id)))
    .sort((a, b) => a - b)
    .map((id) => ({
      id,
      interval: 60,
      name: `任务 #${id}`,
      loss: 0,
      clients: [],
      type: "icmp",
      target: "",
      weight: id,
    }));
}

let publicPingTasksCache: PingTask[] | null = null;
let publicPingTasksCachedAt = 0;
let publicPingTasksRequest: Promise<PingTask[]> | null = null;

async function queryMetricPayload(
  params: Record<string, unknown>,
  signal?: AbortSignal,
  timeout?: number,
): Promise<z.output<typeof MetricQueryResponseSchema>> {
  return await rpcCall(
    "public:queryMetrics",
    params,
    MetricQueryResponseSchema,
    { signal, timeout },
  ) as z.output<typeof MetricQueryResponseSchema>;
}

export function getPublicPingTasks() {
  if (publicPingTasksCache && Date.now() - publicPingTasksCachedAt < 60_000) {
    return Promise.resolve(publicPingTasksCache);
  }
  if (publicPingTasksRequest) return publicPingTasksRequest;

  publicPingTasksRequest = rpcCall(
    "public:getPublicPingTasks",
    {},
    z.array(PingTaskSchema),
  )
    .then((tasks) => {
      const parsed = tasks as PingTask[];
      publicPingTasksCache = parsed;
      publicPingTasksCachedAt = Date.now();
      return parsed;
    })
    .finally(() => {
      publicPingTasksRequest = null;
    });
  return publicPingTasksRequest;
}

function normalizePingMetricStats(
  payload: z.output<typeof PingMetricStatsResponseSchema>,
): PingTaskStats[] {
  const out: PingTaskStats[] = [];
  for (const item of payload.stats) {
    const taskId = Number.parseInt(String(item.task_id), 10);
    if (!Number.isFinite(taskId) || taskId <= 0 || !item.entity_id) continue;
    out.push({
      client: item.entity_id,
      taskId,
      name: item.name,
      type: item.type,
      interval: item.interval,
      total: item.total,
      valid: item.valid,
      loss: item.loss,
      min: item.min ?? null,
      max: item.max ?? null,
      avg: item.avg ?? null,
      latest: item.latest ?? null,
      p50: item.p50 ?? null,
      p99: item.p99 ?? null,
      stddev: item.stddev ?? null,
      p99P50Ratio: item.p99_p50_ratio,
    });
  }
  return out;
}

type MetricPayloadSeries = z.output<typeof MetricSeriesSchema>;

function rawMetricPoints(item: MetricPayloadSeries) {
  return item.points.map((point) => ({
    ...point,
    count: point.value == null ? 0 : 1,
  }));
}

async function repairMetricBoundary<T extends MetricBoundarySeries>(
  aggregateSeries: T[],
  metricPayload: z.output<typeof MetricQueryResponseSchema>,
  requestRange: RequestRange,
  rawParams: Record<string, unknown>,
  mapRawSeries: (item: MetricPayloadSeries, intervalSeconds: number) => T,
  aggregationByMetric: Partial<Record<string, MetricBoundaryAggregation>> = {},
  signal?: AbortSignal,
  timeout?: number,
) {
  const payloadRange = getMetricPayloadRange(metricPayload, requestRange);
  const repairRange = getMetricBoundaryRepairRange(
    payloadRange.rangeStartMs,
    payloadRange.rangeEndMs,
  );
  if (!repairRange || !hasMetricBoundaryGap(aggregateSeries, repairRange)) {
    return aggregateSeries;
  }

  try {
    const rawPayload = await queryMetricPayload(
      {
        ...rawParams,
        start: new Date(repairRange.startMs).toISOString(),
        end: new Date(repairRange.endMs).toISOString(),
        downsample: false,
        fill_empty: false,
      },
      signal,
      timeout,
    );
    const fallbackInterval = Math.max(
      0,
      ...aggregateSeries.map((item) => item.intervalSeconds ?? 0),
    );
    const rawSeries = rawPayload.series.map((item) =>
      mapRawSeries(item, fallbackInterval),
    );
    return fillMetricBoundaryGaps(
      aggregateSeries,
      rawSeries,
      aggregationByMetric,
    ).series;
  } catch (error) {
    if (signal?.aborted) throw error;
    return aggregateSeries;
  }
}

async function getLoadMetricData(
  uuid: string,
  hours: number,
  options?: ApiCallOptions,
): Promise<LoadRecordsResponse> {
  const requestRange = createRequestRange(hours);
  const metricPayload = await queryMetricPayload(
    {
      hours,
      entity_ids: [uuid],
      metric_keys: LOAD_METRIC_KEYS,
      max_points: DETAIL_METRIC_MAX_POINTS,
      aggregation: "avg",
      aggregation_by_metric: LOAD_LAST_AGGREGATION,
      fill_empty: false,
    },
    options?.signal,
    options?.timeout,
  );
  const series: LoadMetricSeries[] = metricPayload.series.map((item) => ({
    metricKey: item.metric_key,
    client: item.entity_id,
    intervalSeconds: item.interval_seconds,
    tags: item.tags ?? item.tag,
    points: item.points,
  }));
  const records = mergeLoadMetricSeries(series);
  const intervalSeconds = Math.max(
    0,
    ...metricPayload.series.map((item) => item.interval_seconds),
  );
  return {
    count: records.length,
    records,
    ...getMetricPayloadRange(metricPayload, requestRange),
    intervalSeconds: intervalSeconds > 0 ? intervalSeconds : undefined,
  };
}

async function getPingMetricData({
  hours,
  entityIds,
  taskId,
  maxPoints,
  includeStats = false,
  repairBoundary = false,
  signal,
  timeout,
}: {
  hours: number;
  entityIds?: string[];
  taskId?: number;
  maxPoints: number;
  includeStats?: boolean;
  repairBoundary?: boolean;
  signal?: AbortSignal;
  timeout?: number;
}): Promise<PingRecordsResponse> {
  const requestRange = createRequestRange(hours);
  const commonParams = {
    hours,
    ...(entityIds?.length ? { entity_ids: entityIds } : {}),
    ...(taskId != null ? { task_id: taskId } : {}),
    max_points: maxPoints,
  };

  const statsRequest = includeStats
    ? rpcCall(
        "public:getPingMetricStats",
        commonParams,
        PingMetricStatsResponseSchema,
        { signal, timeout },
      )
        .then((payload) => payload as z.output<typeof PingMetricStatsResponseSchema>)
        .catch((error: unknown) => {
          if (signal?.aborted) throw error;
          return null;
        })
    : Promise.resolve(null);
  const [metricPayload, statsPayload, publicTasks] = await Promise.all([
    queryMetricPayload(
      {
        ...commonParams,
        metric_keys: [PING_LATENCY_METRIC, PING_LOSS_METRIC],
        ...(taskId != null ? { tags: { task_id: String(taskId) } } : {}),
        aggregation: "avg",
        fill_empty: false,
      },
      signal,
      timeout,
    ),
    statsRequest,
    getPublicPingTasks().catch(() => null),
  ]);
  let series: PingMetricSeries[] = metricPayload.series.map((item) => ({
    metricKey: item.metric_key,
    client: item.entity_id,
    tags: item.tags ?? item.tag ?? {},
    intervalSeconds: item.interval_seconds,
    points: item.points,
  }));
  if (repairBoundary && entityIds?.length) {
    series = await repairMetricBoundary(
      series,
      metricPayload,
      requestRange,
      {
        entity_ids: entityIds,
        metric_keys: [PING_LATENCY_METRIC, PING_LOSS_METRIC],
        ...(taskId != null ? { tags: { task_id: String(taskId) } } : {}),
      },
      (item, intervalSeconds) => ({
        metricKey: item.metric_key,
        client: item.entity_id,
        tags: item.tags ?? item.tag ?? {},
        intervalSeconds,
        points: rawMetricPoints(item),
      }),
      {},
      signal,
      timeout,
    );
  }
  const records = mergePingMetricSeries(series);
  const stats = reconcilePingMetricStats(
    statsPayload ? normalizePingMetricStats(statsPayload) : [],
    records,
  );
  const intervalSeconds = Math.max(
    0,
    ...metricPayload.series.map((item) => item.interval_seconds),
  );
  const observedTaskIds = new Set([
    ...records.map((record) => record.task_id),
    ...stats.map((stat) => stat.taskId),
  ]);
  const statByTask = new Map(stats.map((stat) => [stat.taskId, stat] as const));
  const tasks = publicTasks
    ?.filter((task) => observedTaskIds.has(task.id))
    .map((task) => ({
      ...task,
      loss: statByTask.get(task.id)?.loss ?? task.loss,
    }));
  const statsTasks = pingTasksFromMetricStats(stats);
  return {
    count: records.length,
    records,
    ...getMetricPayloadRange(metricPayload, requestRange),
    intervalSeconds: intervalSeconds > 0 ? intervalSeconds : undefined,
    tasks:
      tasks && tasks.length > 0
        ? tasks
        : statsTasks.length > 0
          ? statsTasks
          : derivePingTasks(records),
    stats,
  };
}

export async function getMe(options?: ApiCallOptions): Promise<Me> {
  // 必须 cast:zod `.passthrough()` schema 经 apiGet 推断出的是 input 类型(默认字段
  // 变可选),这里要重新收窄回来。
  return (await apiGet("/api/me", MeSchema, options)) as Me;
}

export async function getPublic(options?: ApiCallOptions): Promise<PublicConfig> {
  return (await apiGet("/api/public", PublicConfigSchema, options)) as PublicConfig;
}

export async function getNodes(options?: ApiCallOptions): Promise<NodeInfo[]> {
  // 走 common:getNodes（RPC2）：它按 SendIpAddrToGuest 设置下发 ipv4/ipv6（管理员全量 /
  // 访客打码），所以前端能显示 V4/V6；/api/nodes 则永远抹掉 IP，拿不到。
  try {
    const map = await rpcCall(
      "common:getNodes",
      {},
      z.record(z.string(), NodeInfoSchema),
      options,
    );
    return Object.values(map) as NodeInfo[];
  } catch (error) {
    if (options?.signal?.aborted) throw error;
    // RPC 不可用时使用仍受支持的 HTTP 接口（拿不到 IP，但节点列表照常加载）。
    return (await apiGet("/api/nodes", z.array(NodeInfoSchema), options)) as NodeInfo[];
  }
}

export async function getLoadRecords(
  uuid: string,
  hours = 6,
  options?: ApiCallOptions,
): Promise<LoadRecordsResponse> {
  return getLoadMetricData(uuid, hours, options);
}

export interface TodayTrafficMetricResponse {
  series: TrafficMetricSeries[];
  rangeStartMs: number;
  rangeEndMs: number;
  intervalSeconds?: number;
}

/**
 * 查询浏览器本地“今天”的流量增量与上下行采样峰值。服务端按 5 分钟左右聚合，
 * 流量使用 sum、速率使用 max；前端随后再汇总到每台节点，避免拉取全天原始点。
 */
export async function getTodayTrafficMetrics(
  entityIds: string[],
  startMs: number,
  endMs: number,
  options?: ApiCallOptions,
): Promise<TodayTrafficMetricResponse> {
  if (entityIds.length === 0) {
    return { series: [], rangeStartMs: startMs, rangeEndMs: endMs };
  }

  const fiveMinutesMs = 5 * 60 * 1000;
  const maxPoints = Math.max(1, Math.ceil((endMs - startMs) / fiveMinutesMs));
  const requestRange = { rangeStartMs: startMs, rangeEndMs: endMs };
  const metricPayload = await queryMetricPayload(
    {
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      entity_ids: entityIds,
      metric_keys: TODAY_TRAFFIC_METRIC_KEYS,
      max_points: maxPoints,
      aggregation_by_metric: TODAY_TRAFFIC_AGGREGATION,
      fill_empty: false,
    },
    options?.signal,
    options?.timeout,
  );
  let series: TrafficMetricSeries[] = metricPayload.series.map((item) => ({
    metricKey: item.metric_key,
    client: item.entity_id,
    intervalSeconds: item.interval_seconds,
    points: item.points,
  }));
  series = await repairMetricBoundary(
    series,
    metricPayload,
    requestRange,
    {
      entity_ids: entityIds,
      metric_keys: TODAY_TRAFFIC_METRIC_KEYS,
    },
    (item, intervalSeconds) => ({
      metricKey: item.metric_key,
      client: item.entity_id,
      intervalSeconds,
      points: rawMetricPoints(item),
    }),
    TODAY_TRAFFIC_AGGREGATION,
    options?.signal,
    options?.timeout,
  );
  const intervalSeconds = Math.max(0, ...series.map((item) => item.intervalSeconds ?? 0));
  return {
    series,
    ...getMetricPayloadRange(metricPayload, requestRange),
    intervalSeconds: intervalSeconds > 0 ? intervalSeconds : undefined,
  };
}

export async function getPingRecords(
  uuid: string,
  hours = 6,
  options?: ApiCallOptions,
): Promise<PingRecordsResponse> {
  return getPingMetricData({
    hours,
    entityIds: [uuid],
    maxPoints: DETAIL_METRIC_MAX_POINTS,
    ...options,
  });
}

export async function getPingMetricStats(
  uuid: string,
  hours = 6,
  options?: ApiCallOptions,
): Promise<PingTaskStats[]> {
  const payload = await rpcCall(
    "public:getPingMetricStats",
    {
      hours,
      entity_ids: [uuid],
      max_points: DETAIL_METRIC_MAX_POINTS,
    },
    PingMetricStatsResponseSchema,
    options,
  );
  return normalizePingMetricStats(
    payload as z.output<typeof PingMetricStatsResponseSchema>,
  );
}

// 首页 24 小时历史。只查一个指标：cpu.usage 既是趋势要画的曲线，也是「探针有没有上报」
// 的判据（后端省略空桶，缺格即缺样），一条请求同时喂 sparkline 和上报连续性条。
// 多加一个指标就多一份同等大小的载荷，先不为 sparkline 的第二条线付这个钱。
const HOME_HISTORY_METRIC = "cpu.usage";

export interface HomeHistoryResponse {
  rangeStartMs: number;
  rangeEndMs: number;
  /** entity_id → 该节点在区间内的原始点（稀疏，缺口即未上报）。 */
  pointsByUuid: Map<string, Array<{ time: string; value: number | null; count: number }>>;
}

/**
 * 首页全站一次查询：不传 entity_ids，后端返回全部节点。
 * `maxPoints` 是上限而非精确值 —— 后端会吸附到标准间隔（实测 24h 请求 500 点得到
 * 300 秒 × 288 点，请求 720 点得到 120 秒 × 720 点），调用方按分辨率与载荷取舍。
 */
export async function getHomeHistory(
  hours: number,
  maxPoints: number,
  options?: { signal?: AbortSignal },
): Promise<HomeHistoryResponse> {
  const requestRange = createRequestRange(hours);
  const payload = await queryMetricPayload(
    {
      hours,
      metric_keys: [HOME_HISTORY_METRIC],
      max_points: maxPoints,
      aggregation: "avg",
      fill_empty: false,
    },
    options?.signal,
  );

  // 只查一个 metric_key，所以每个 entity 至多一条 series，直接设入即可（无需合并/复制）。
  const pointsByUuid = new Map<string, Array<{ time: string; value: number | null; count: number }>>();
  for (const series of payload.series) {
    if (series.metric_key !== HOME_HISTORY_METRIC || !series.entity_id) continue;
    pointsByUuid.set(series.entity_id, series.points);
  }

  const range = getMetricPayloadRange(payload, requestRange);
  return {
    rangeStartMs: range.rangeStartMs,
    rangeEndMs: range.rangeEndMs,
    pointsByUuid,
  };
}

export async function getPingOverview(
  hours = 1,
  taskId?: number,
  options?: { signal?: AbortSignal; entityIds?: string[] },
): Promise<PingOverviewResponse> {
  return getPingMetricData({
    hours,
    entityIds: options?.entityIds,
    taskId,
    maxPoints: OVERVIEW_METRIC_MAX_POINTS,
    includeStats: true,
    repairBoundary: true,
    signal: options?.signal,
  });
}

// ─── 版本号 ───────────────────────────────────────────────────────────────────

export interface KomariVersion {
  version: string;
  hash: string;
}

export async function getVersion(
  options?: { signal?: AbortSignal },
): Promise<KomariVersion> {
  const result = await rpcCall(
    "common:getVersion",
    {},
    z.object({
      version: z.string().default(""),
      hash: z.string().default(""),
    }),
    options,
  );
  return { version: result.version ?? "", hash: result.hash ?? "" };
}

// ─── 访客事件上报 ─────────────────────────────────────────────────────────────

export function recordVisitorEvent(event: {
  event: string;
  path?: string;
  route?: string;
  target?: string;
  detail?: Record<string, unknown>;
}): void {
  // fire-and-forget：不阻塞 UI，失败静默。
  void rpcCall("public:recordVisitorEvent", event as unknown as Record<string, unknown>, z.unknown()).catch(
    () => undefined,
  );
}

// ─── 节点实时状态与近期缓冲 ───────────────────────────────────────────────────

export function getNodesLatestStatus(options?: ApiCallOptions) {
  return rpcCall(
    "common:getNodesLatestStatus",
    {},
    z.record(z.string(), z.object({ online: z.boolean() }).passthrough()),
    options,
  );
}

export const RecentStatusRecordSchema = z
  .object({
    cpu: z.number().default(0),
    gpu: z.number().optional(),
    gpu_memory_used: z.number().optional(),
    gpu_memory_total: z.number().optional(),
    gpu_temperature: z.number().optional(),
    ram: z.number().default(0),
    ram_total: z.number().default(0),
    swap: z.number().default(0),
    swap_total: z.number().default(0),
    disk: z.number().default(0),
    disk_total: z.number().default(0),
    net_in: z.number().default(0),
    net_out: z.number().default(0),
    load: z.number().default(0),
    process: z.number().default(0),
    connections: z.number().default(0),
    connections_udp: z.number().default(0),
    time: z.union([z.string(), z.number()]),
  })
  .passthrough();

export type RecentStatusRecord = z.infer<typeof RecentStatusRecordSchema>;

export async function getNodeRecentStatus(
  uuid: string,
  options?: { signal?: AbortSignal },
): Promise<RecentStatusRecord[]> {
  const payload = await rpcCall(
    "common:getNodeRecentStatus",
    { uuid },
    z.unknown(),
    options,
  );
  // 后端可能返回数组或 { records: [...] } 包装。
  const raw: unknown[] = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).records)
      ? (payload as Record<string, unknown>).records as unknown[]
      : [];
  const out: RecentStatusRecord[] = [];
  for (const item of raw) {
    const parsed = RecentStatusRecordSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
