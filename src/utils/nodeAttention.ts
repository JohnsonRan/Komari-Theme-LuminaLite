// 节点「需要关注」的判定。首页据此把出问题的节点顶到前面，并在卡片上标出原因。
//
// 判定只依赖首页本来就有的数据(实时指标 + 节点元信息 + ping 概览),不额外请求。

export type AttentionLevel = "critical" | "warning" | "none";

export interface AttentionThresholds {
  /** CPU 使用率上限 (%)。 */
  cpuPct: number;
  /** 内存使用率上限 (%)。 */
  memoryPct: number;
  /** 磁盘使用率上限 (%)。 */
  diskPct: number;
  /** 丢包率上限 (%)。 */
  lossPct: number;
  /** 剩余流量下限 (%)，低于它算异常。 */
  trafficRemainPct: number;
  /** 距到期天数下限，少于它算异常。 */
  expireDays: number;
}

export const DEFAULT_ATTENTION_THRESHOLDS: AttentionThresholds = {
  cpuPct: 90,
  memoryPct: 90,
  diskPct: 90,
  lossPct: 5,
  trafficRemainPct: 10,
  expireDays: 7,
};

export interface AttentionInput {
  online: boolean | null;
  cpuPct: number;
  ramPct: number;
  diskPct: number;
  /** ping 丢包率 (%)，未绑定任务或无样本时为 null。 */
  loss: number | null;
  /** 已用流量占配额的比例 0..1；不限量时为 null。 */
  trafficFraction: number | null;
  /** 距到期天数；无到期日时为 null。 */
  expireDays: number | null;
}

/** 命中的判据。滞回按它比对，与展示文案解耦。 */
export type AttentionKey =
  | "offline"
  | "cpu"
  | "memory"
  | "disk"
  | "loss"
  | "traffic"
  | "expire";

export interface AttentionResult {
  level: AttentionLevel;
  /** 命中了哪些判据，顺序与 reasons 一一对应。 */
  hits: AttentionKey[];
  /** 命中的原因文案，用于卡片上的标记与 tooltip。 */
  reasons: string[];
}

export const NO_ATTENTION: AttentionResult = { level: "none", hits: [], reasons: [] };

/** 两个结果是否等价。用来在内容未变时复用旧引用，避免下游 memo 每帧失效。 */
export function equalAttention(a: AttentionResult, b: AttentionResult): boolean {
  if (a === b) return true;
  if (a.level !== b.level || a.reasons.length !== b.reasons.length) return false;
  return a.reasons.every((reason, index) => reason === b.reasons[index]);
}

// 已进入警告的指标要回落到「阈值 - 缓冲」才解除。没有这个缓冲，一个在 90% 上下抖动的
// CPU 会让节点每秒钟在置顶区进出一次 —— 首页的排序抖动比它想提示的问题更烦人。
// 与实时网速排序的进出滞回门(HOME_SPEED_ENTER_BPS / EXIT_BPS)是同一个思路。
const PERCENT_HYSTERESIS = 3;
const LOSS_HYSTERESIS = 1;

/**
 * 值是否越过阈值。`over` 判上限（CPU 等越高越糟），`under` 判下限（剩余流量越低越糟）。
 * 已命中时阈值向宽松方向让出 `hysteresis`，这样退出比进入难，指标在阈值附近抖动不会翻来覆去。
 */
function crossed(
  value: number,
  threshold: number,
  direction: "over" | "under",
  wasHit: boolean,
  hysteresis: number,
) {
  if (!Number.isFinite(value) || threshold <= 0) return false;
  const slack = wasHit ? hysteresis : 0;
  return direction === "over" ? value >= threshold - slack : value <= threshold + slack;
}

/**
 * `previous` 传上一次的结果以启用滞回；不传则按裸阈值判定（纯函数测试、首次求值用）。
 *
 * 离线是 critical —— 它是确定的故障；阈值命中是 warning —— 可能只是负载高峰。
 * 两者分级是为了让"挂了"永远排在"忙"前面。
 */
export function evaluateNodeAttention(
  input: AttentionInput,
  thresholds: AttentionThresholds,
  previous?: AttentionResult,
): AttentionResult {
  if (input.online === false) {
    return { level: "critical", hits: ["offline"], reasons: ["离线"] };
  }

  // 滞回按 hits 里的 key 判断，不再靠前缀匹配 reasons 的展示文案 —— 那样改一次文案就会
  // 悄悄让该指标失去滞回，而失效是看不见的。
  const wasHit = (key: AttentionKey) => previous?.hits.includes(key) ?? false;
  const hits: AttentionKey[] = [];
  const reasons: string[] = [];
  const hit = (key: AttentionKey, reason: string) => {
    hits.push(key);
    reasons.push(reason);
  };

  if (crossed(input.cpuPct, thresholds.cpuPct, "over", wasHit("cpu"), PERCENT_HYSTERESIS)) {
    hit("cpu", `CPU ${Math.round(input.cpuPct)}%`);
  }
  if (crossed(input.ramPct, thresholds.memoryPct, "over", wasHit("memory"), PERCENT_HYSTERESIS)) {
    hit("memory", `内存 ${Math.round(input.ramPct)}%`);
  }
  if (crossed(input.diskPct, thresholds.diskPct, "over", wasHit("disk"), PERCENT_HYSTERESIS)) {
    hit("disk", `磁盘 ${Math.round(input.diskPct)}%`);
  }
  if (
    input.loss != null &&
    crossed(input.loss, thresholds.lossPct, "over", wasHit("loss"), LOSS_HYSTERESIS)
  ) {
    hit("loss", `丢包 ${input.loss.toFixed(1)}%`);
  }
  if (input.trafficFraction != null) {
    const remainPct = (1 - input.trafficFraction) * 100;
    if (
      crossed(remainPct, thresholds.trafficRemainPct, "under", wasHit("traffic"), PERCENT_HYSTERESIS)
    ) {
      hit("traffic", `剩余流量 ${Math.max(0, remainPct).toFixed(0)}%`);
    }
  }
  if (
    input.expireDays != null &&
    // 到期天数是整数、按天变化，不需要滞回。
    thresholds.expireDays > 0 &&
    input.expireDays <= thresholds.expireDays
  ) {
    hit("expire", input.expireDays <= 0 ? "已到期" : `${input.expireDays} 天后到期`);
  }

  return hits.length > 0 ? { level: "warning", hits, reasons } : NO_ATTENTION;
}

/** 卡片/列表行上的「需要关注」标记属性。四种视图共用，避免各写一份前缀与连接符。 */
export function attentionAttrs(result: AttentionResult): {
  "data-attention"?: AttentionLevel;
  title?: string;
} {
  if (result.level === "none") return {};
  return {
    "data-attention": result.level,
    title: `需要关注：${result.reasons.join(" · ")}`,
  };
}

/** 解析成 0..max 的整数；非数值、负数一律回落到 fallback。 */
function clampInt(raw: unknown, max: number, fallback: number): number {
  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(max, Math.round(parsed));
}

export function normalizeAttentionThresholds(
  value: Partial<Record<keyof AttentionThresholds, unknown>> | null | undefined,
): AttentionThresholds {
  const pick = (key: keyof AttentionThresholds, max: number) =>
    clampInt(value?.[key], max, DEFAULT_ATTENTION_THRESHOLDS[key]);

  return {
    cpuPct: pick("cpuPct", 100),
    memoryPct: pick("memoryPct", 100),
    diskPct: pick("diskPct", 100),
    lossPct: pick("lossPct", 100),
    trafficRemainPct: pick("trafficRemainPct", 100),
    expireDays: pick("expireDays", 365),
  };
}
