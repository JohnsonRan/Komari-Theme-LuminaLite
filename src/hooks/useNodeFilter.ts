import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  EMPTY_NODE_FILTER_STATE,
  getDefaultOperatorForField,
  isFilterActive,
  isRuleEffective,
  type NodeFilterRule,
  type NodeFilterState,
  type NodeStatusFilter,
} from "@/utils/nodeFilter";
import { isNodeFieldId, type NodeFieldId } from "@/utils/nodeFields";

const STORAGE_KEY = "komaritheme:node-filter";

let ruleCounter = 0;
function createRuleId(): string {
  ruleCounter += 1;
  return `rule-${Date.now()}-${ruleCounter}`;
}

function sanitizeFilterState(raw: unknown): NodeFilterState {
  if (!raw || typeof raw !== "object") return EMPTY_NODE_FILTER_STATE;
  const obj = raw as Partial<NodeFilterState>;
  const keyword = typeof obj.keyword === "string" ? obj.keyword : "";
  const status: NodeStatusFilter =
    obj.status === "online" || obj.status === "offline" ? obj.status : "all";
  const rules: NodeFilterRule[] = Array.isArray(obj.rules)
    ? obj.rules
        .filter(
          (r): r is NodeFilterRule =>
            Boolean(r) &&
            typeof r === "object" &&
            typeof r.id === "string" &&
            isNodeFieldId(r.field) &&
            typeof r.operator === "string",
        )
        .map((r) => ({
          id: r.id,
          field: r.field,
          operator: r.operator,
          value: typeof r.value === "string" ? r.value : "",
          value2: typeof r.value2 === "string" ? r.value2 : "",
          values: Array.isArray(r.values)
            ? r.values.filter((v): v is string => typeof v === "string")
            : [],
        }))
    : [];
  return { keyword, status, rules };
}

function readStoredFilter(): NodeFilterState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_NODE_FILTER_STATE;
    return sanitizeFilterState(JSON.parse(raw));
  } catch {
    return EMPTY_NODE_FILTER_STATE;
  }
}

function writeStoredFilter(state: NodeFilterState) {
  try {
    if (
      state.keyword === "" &&
      state.status === "all" &&
      state.rules.length === 0
    ) {
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    // 忽略异常
  }
}

const listeners = new Set<() => void>();
let snapshot: NodeFilterState = EMPTY_NODE_FILTER_STATE;
let initialized = false;

function getSnapshot(): NodeFilterState {
  if (!initialized) {
    initialized = true;
    snapshot = readStoredFilter();
  }
  return snapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange(next: NodeFilterState) {
  snapshot = next;
  initialized = true;
  writeStoredFilter(next);
  listeners.forEach((listener) => listener());
}

export interface FilterFieldRequest {
  field: NodeFieldId;
  seq: number;
}

let focusRequestSnapshot: FilterFieldRequest | null = null;
const focusListeners = new Set<() => void>();

function getFocusRequestSnapshot(): FilterFieldRequest | null {
  return focusRequestSnapshot;
}

function subscribeFocusRequest(listener: () => void) {
  focusListeners.add(listener);
  return () => focusListeners.delete(listener);
}

export interface NodeFilterControlState {
  filter: NodeFilterState;
  isActive: boolean;
  activeRuleCount: number;
  focusFieldRequest: FilterFieldRequest | null;
  setKeyword: (keyword: string) => void;
  setStatus: (status: NodeStatusFilter) => void;
  addRule: (partial?: Partial<Omit<NodeFilterRule, "id">>) => string;
  updateRule: (id: string, patch: Partial<Omit<NodeFilterRule, "id">>) => void;
  removeRule: (id: string) => void;
  clearRules: () => void;
  clearFilter: () => void;
  requestFilterForField: (field: NodeFieldId) => void;
  clearFocusFieldRequest: () => void;
}

export function useNodeFilter(): NodeFilterControlState {
  const filter = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const focusFieldRequest = useSyncExternalStore(
    subscribeFocusRequest,
    getFocusRequestSnapshot,
    getFocusRequestSnapshot,
  );

  const setKeyword = useCallback((keyword: string) => {
    const cur = getSnapshot();
    if (cur.keyword === keyword) return;
    emitChange({ ...cur, keyword });
  }, []);

  const setStatus = useCallback((status: NodeStatusFilter) => {
    const cur = getSnapshot();
    if (cur.status === status) return;
    emitChange({ ...cur, status });
  }, []);

  const addRule = useCallback((partial?: Partial<Omit<NodeFilterRule, "id">>): string => {
    const cur = getSnapshot();
    const field: NodeFieldId = partial?.field && isNodeFieldId(partial.field) ? partial.field : "cpu";
    const id = createRuleId();
    const nextRule: NodeFilterRule = {
      id,
      field,
      operator: partial?.operator ?? getDefaultOperatorForField(field),
      value: partial?.value ?? "",
      value2: partial?.value2 ?? "",
      values: partial?.values ?? [],
    };
    emitChange({ ...cur, rules: [...cur.rules, nextRule] });
    return id;
  }, []);

  const updateRule = useCallback(
    (id: string, patch: Partial<Omit<NodeFilterRule, "id">>) => {
      const cur = getSnapshot();
      const nextRules = cur.rules.map((rule) => {
        if (rule.id !== id) return rule;
        const fieldChanged = patch.field && patch.field !== rule.field;
        const nextField = patch.field ?? rule.field;
        return {
          ...rule,
          ...patch,
          field: nextField,
          operator:
            patch.operator ??
            (fieldChanged ? getDefaultOperatorForField(nextField) : rule.operator),
          value: fieldChanged && patch.value === undefined ? "" : (patch.value ?? rule.value),
          value2: fieldChanged && patch.value2 === undefined ? "" : (patch.value2 ?? rule.value2),
          values: fieldChanged && patch.values === undefined ? [] : (patch.values ?? rule.values),
        };
      });
      emitChange({ ...cur, rules: nextRules });
    },
    [],
  );

  const removeRule = useCallback((id: string) => {
    const cur = getSnapshot();
    emitChange({ ...cur, rules: cur.rules.filter((rule) => rule.id !== id) });
  }, []);

  const clearRules = useCallback(() => {
    const cur = getSnapshot();
    if (cur.rules.length === 0) return;
    emitChange({ ...cur, rules: [] });
  }, []);

  const clearFilter = useCallback(() => {
    emitChange(EMPTY_NODE_FILTER_STATE);
  }, []);

  const requestFilterForField = useCallback((field: NodeFieldId) => {
    const cur = getSnapshot();
    const hasFieldRule = cur.rules.some((r) => r.field === field);
    if (!hasFieldRule) {
      const id = createRuleId();
      const nextRule: NodeFilterRule = {
        id,
        field,
        operator: getDefaultOperatorForField(field),
        value: "",
        value2: "",
        values: [],
      };
      emitChange({ ...cur, rules: [...cur.rules, nextRule] });
    }
    focusRequestSnapshot = { field, seq: (focusRequestSnapshot?.seq ?? 0) + 1 };
    focusListeners.forEach((listener) => listener());
  }, []);

  const clearFocusFieldRequest = useCallback(() => {
    if (!focusRequestSnapshot) return;
    focusRequestSnapshot = null;
    focusListeners.forEach((listener) => listener());
  }, []);

  const isActive = useMemo(() => isFilterActive(filter), [filter]);
  const activeRuleCount = useMemo(
    () => filter.rules.filter(isRuleEffective).length,
    [filter.rules],
  );

  return useMemo(
    () => ({
      filter,
      isActive,
      activeRuleCount,
      focusFieldRequest,
      setKeyword,
      setStatus,
      addRule,
      updateRule,
      removeRule,
      clearRules,
      clearFilter,
      requestFilterForField,
      clearFocusFieldRequest,
    }),
    [
      filter,
      isActive,
      activeRuleCount,
      focusFieldRequest,
      setKeyword,
      setStatus,
      addRule,
      updateRule,
      removeRule,
      clearRules,
      clearFilter,
      requestFilterForField,
      clearFocusFieldRequest,
    ],
  );
}
