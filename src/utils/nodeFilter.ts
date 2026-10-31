import type { NodeInfo, NodeMetrics } from "@/types/komari";
import type { HomeNodeSummary } from "@/services/wsStore";
import {
  buildNodeSearchIndex,
  extractNodeFieldFilterValue,
  getNodeFieldDefinition,
  isNodeFieldId,
  type NodeFieldFilterType,
  type NodeFieldId,
  type NodeFieldValueContext,
} from "@/utils/nodeFields";

export type NodeStatusFilter = "all" | "online" | "offline";

export type NodeFilterOperator =
  // 数值比较
  | "gte"
  | "lte"
  | "gt"
  | "lt"
  | "eq"
  | "between"
  // 文本与枚举
  | "contains"
  | "not_contains"
  | "in"
  | "not_in"
  | "not_empty"
  | "empty"
  // 布尔
  | "is_true"
  | "is_false";

export interface NodeFilterRule {
  id: string;
  field: NodeFieldId;
  operator: NodeFilterOperator;
  /** 单值输入（文本或数字字符串） */
  value?: string;
  /** 区间上限（between 专用） */
  value2?: string;
  /** 多选枚举值列表（in / not_in 专用） */
  values?: string[];
}

export interface NodeFilterState {
  keyword: string;
  status: NodeStatusFilter;
  rules: NodeFilterRule[];
}

export const EMPTY_NODE_FILTER_STATE: NodeFilterState = {
  keyword: "",
  status: "all",
  rules: [],
};

export interface OperatorOption {
  value: NodeFilterOperator;
  label: string;
  shortLabel: string;
}

export const FILTER_OPERATORS_BY_TYPE: Record<NodeFieldFilterType, readonly OperatorOption[]> = {
  number: [
    { value: "gte", label: "大于等于 (≥)", shortLabel: "≥" },
    { value: "lte", label: "小于等于 (≤)", shortLabel: "≤" },
    { value: "gt", label: "大于 (>)", shortLabel: ">" },
    { value: "lt", label: "小于 (<)", shortLabel: "<" },
    { value: "eq", label: "等于 (=)", shortLabel: "=" },
    { value: "between", label: "区间 (A ~ B)", shortLabel: "~" },
  ],
  enum: [
    { value: "in", label: "包含任一所选", shortLabel: "∈" },
    { value: "not_in", label: "排除所选", shortLabel: "∉" },
    { value: "contains", label: "包含文本", shortLabel: "含" },
    { value: "not_empty", label: "不为空", shortLabel: "非空" },
    { value: "empty", label: "为空", shortLabel: "为空" },
  ],
  text: [
    { value: "contains", label: "包含", shortLabel: "含" },
    { value: "not_contains", label: "不包含", shortLabel: "不含" },
    { value: "eq", label: "等于", shortLabel: "=" },
    { value: "not_empty", label: "不为空", shortLabel: "非空" },
    { value: "empty", label: "为空", shortLabel: "为空" },
  ],
  boolean: [
    { value: "is_true", label: "为「是」", shortLabel: "是" },
    { value: "is_false", label: "为「否」", shortLabel: "否" },
  ],
};

export function getDefaultOperatorForField(field: NodeFieldId): NodeFilterOperator {
  const def = getNodeFieldDefinition(field);
  return FILTER_OPERATORS_BY_TYPE[def.filterType][0].value;
}

export function isFilterActive(state: NodeFilterState): boolean {
  if (state.keyword.trim().length > 0) return true;
  if (state.status !== "all") return true;
  return state.rules.some(isRuleEffective);
}

export function isRuleEffective(rule: NodeFilterRule): boolean {
  if (!isNodeFieldId(rule.field)) return false;
  switch (rule.operator) {
    case "not_empty":
    case "empty":
    case "is_true":
    case "is_false":
      return true;
    case "in":
    case "not_in":
      return Array.isArray(rule.values) && rule.values.length > 0;
    case "between": {
      const n1 = Number.parseFloat(String(rule.value ?? ""));
      const n2 = Number.parseFloat(String(rule.value2 ?? ""));
      return Number.isFinite(n1) || Number.isFinite(n2);
    }
    case "gte":
    case "lte":
    case "gt":
    case "lt":
      return Number.isFinite(Number.parseFloat(String(rule.value ?? "")));
    case "eq":
    case "contains":
    case "not_contains":
      return String(rule.value ?? "").trim().length > 0;
  }
}

export function filterNeedsLiveMetrics(state: NodeFilterState): boolean {
  for (const rule of state.rules) {
    if (!isRuleEffective(rule)) continue;
    if (getNodeFieldDefinition(rule.field).needsLiveMetrics) return true;
  }
  return false;
}

export function evaluateFilterRule(rule: NodeFilterRule, ctx: NodeFieldValueContext): boolean {
  if (!isRuleEffective(rule)) return true;
  const raw = extractNodeFieldFilterValue(rule.field, ctx);

  switch (rule.operator) {
    case "is_true":
      return raw === true;
    case "is_false":
      return raw === false;

    case "empty": {
      if (raw == null) return true;
      if (Array.isArray(raw)) return raw.length === 0;
      const str = String(raw).trim();
      return str === "" || str === "未分组" || str === "未设置" || str === "未知" || str === "未上报";
    }
    case "not_empty": {
      if (raw == null) return false;
      if (Array.isArray(raw)) return raw.length > 0;
      const str = String(raw).trim();
      return str !== "" && str !== "未分组" && str !== "未设置" && str !== "未知" && str !== "未上报";
    }

    case "in":
    case "not_in": {
      const targets = new Set((rule.values ?? []).map((v) => v.trim().toLowerCase()).filter(Boolean));
      if (targets.size === 0) return true;
      const items = Array.isArray(raw)
        ? raw.map((v) => String(v).trim().toLowerCase())
        : raw != null
          ? [String(raw).trim().toLowerCase()]
          : [];
      const matched = items.some((item) => targets.has(item));
      return rule.operator === "in" ? matched : !matched;
    }

    case "contains":
    case "not_contains": {
      const needle = String(rule.value ?? "").trim().toLowerCase();
      if (!needle) return true;
      const hay = Array.isArray(raw)
        ? raw.join(" ").toLowerCase()
        : raw != null
          ? String(raw).toLowerCase()
          : "";
      const matched = hay.includes(needle);
      return rule.operator === "contains" ? matched : !matched;
    }

    case "eq": {
      const def = getNodeFieldDefinition(rule.field);
      if (def.filterType === "number") {
        const target = Number.parseFloat(String(rule.value ?? ""));
        if (!Number.isFinite(target)) return true;
        if (typeof raw !== "number" || !Number.isFinite(raw)) return false;
        return Math.abs(raw - target) < 1e-6;
      }
      const targetStr = String(rule.value ?? "").trim().toLowerCase();
      if (!targetStr) return true;
      if (Array.isArray(raw)) {
        return raw.some((item) => String(item).trim().toLowerCase() === targetStr);
      }
      return String(raw ?? "").trim().toLowerCase() === targetStr;
    }

    case "gte":
    case "lte":
    case "gt":
    case "lt": {
      const target = Number.parseFloat(String(rule.value ?? ""));
      if (!Number.isFinite(target)) return true;
      if (typeof raw !== "number" || !Number.isFinite(raw)) return false;
      if (rule.operator === "gte") return raw >= target;
      if (rule.operator === "lte") return raw <= target;
      if (rule.operator === "gt") return raw > target;
      return raw < target;
    }

    case "between": {
      if (typeof raw !== "number" || !Number.isFinite(raw)) return false;
      const min = Number.parseFloat(String(rule.value ?? ""));
      const max = Number.parseFloat(String(rule.value2 ?? ""));
      const hasMin = Number.isFinite(min);
      const hasMax = Number.isFinite(max);
      if (!hasMin && !hasMax) return true;
      if (hasMin && hasMax) {
        const lo = Math.min(min, max);
        const hi = Math.max(min, max);
        return raw >= lo && raw <= hi;
      }
      if (hasMin) return raw >= min;
      return raw <= max;
    }
  }
}

export interface FilterNodesOptions {
  metaByUuid?: ReadonlyMap<string, NodeInfo>;
  metricsByUuid?: ReadonlyMap<string, NodeMetrics>;
  nameByUuid?: ReadonlyMap<string, string>;
  now?: number;
}

export function filterHomeNodes(
  nodes: HomeNodeSummary[],
  filter: NodeFilterState,
  options: FilterNodesOptions = {},
): HomeNodeSummary[] {
  if (!isFilterActive(filter)) return nodes;

  const tokens = filter.keyword
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const activeRules = filter.rules.filter(isRuleEffective);
  const now = options.now ?? Date.now();

  return nodes.filter((summary) => {
    if (filter.status === "online" && summary.online !== true) return false;
    if (filter.status === "offline" && summary.online !== false) return false;

    const meta = options.metaByUuid?.get(summary.uuid);
    const metrics = options.metricsByUuid?.get(summary.uuid);
    const displayName = options.nameByUuid?.get(summary.uuid) ?? meta?.name?.trim() ?? summary.uuid;
    const ctx: NodeFieldValueContext = { summary, meta, metrics, displayName, now };

    if (tokens.length > 0) {
      const searchIndex = buildNodeSearchIndex(ctx);
      for (const token of tokens) {
        if (!searchIndex.includes(token)) return false;
      }
    }

    for (const rule of activeRules) {
      if (!evaluateFilterRule(rule, ctx)) return false;
    }

    return true;
  });
}

export interface EnumOptionItem {
  value: string;
  count: number;
}

/**
 * 统计指定枚举字段在当前节点列表中的全部可选值及数量，按数量降序排列。
 */
export function collectFieldEnumOptions(
  field: NodeFieldId,
  nodes: HomeNodeSummary[],
  options: FilterNodesOptions = {},
): EnumOptionItem[] {
  const counts = new Map<string, number>();
  const now = options.now ?? Date.now();

  for (const summary of nodes) {
    const meta = options.metaByUuid?.get(summary.uuid);
    const metrics = options.metricsByUuid?.get(summary.uuid);
    const displayName = options.nameByUuid?.get(summary.uuid) ?? meta?.name?.trim() ?? summary.uuid;
    const raw = extractNodeFieldFilterValue(field, {
      summary,
      meta,
      metrics,
      displayName,
      now,
    });
    const values = Array.isArray(raw)
      ? raw.map((v) => String(v).trim()).filter(Boolean)
      : raw != null && String(raw).trim() !== ""
        ? [String(raw).trim()]
        : [];
    for (const val of values) {
      counts.set(val, (counts.get(val) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "zh-CN"));
}

/**
 * 生成筛选规则的可读摘要（用于已生效筛选胶囊展示）。
 */
export function formatFilterRuleLabel(rule: NodeFilterRule): string {
  const def = getNodeFieldDefinition(rule.field);
  const unit = def.unit ? ` ${def.unit}` : "";

  switch (rule.operator) {
    case "is_true":
      return `${def.shortLabel}: 是`;
    case "is_false":
      return `${def.shortLabel}: 否`;
    case "empty":
      return `${def.shortLabel}: 为空`;
    case "not_empty":
      return `${def.shortLabel}: 非空`;
    case "in":
      return `${def.shortLabel}: ${(rule.values ?? []).join(" / ")}`;
    case "not_in":
      return `${def.shortLabel} ≠ ${(rule.values ?? []).join(" / ")}`;
    case "between":
      return `${def.shortLabel}: ${rule.value || "0"} ~ ${rule.value2 || "∞"}${unit}`;
    case "gte":
      return `${def.shortLabel} ≥ ${rule.value}${unit}`;
    case "lte":
      return `${def.shortLabel} ≤ ${rule.value}${unit}`;
    case "gt":
      return `${def.shortLabel} > ${rule.value}${unit}`;
    case "lt":
      return `${def.shortLabel} < ${rule.value}${unit}`;
    case "eq":
      return `${def.shortLabel} = ${rule.value}${unit}`;
    case "contains":
      return `${def.shortLabel} 含 "${rule.value}"`;
    case "not_contains":
      return `${def.shortLabel} 不含 "${rule.value}"`;
  }
}
