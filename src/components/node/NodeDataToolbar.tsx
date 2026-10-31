import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ListFilter,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "@/components/ui/icons";
import type { NodeInfo, NodeMetrics } from "@/types/komari";
import type { HomeNodeSummary } from "@/services/wsStore";
import { useListColumns } from "@/hooks/useListColumns";
import { useNodeFilter } from "@/hooks/useNodeFilter";
import type { HomeSortControlState } from "@/hooks/useHomeSort";
import { useViewMode } from "@/hooks/useViewMode";
import {
  ALL_NODE_FIELD_IDS,
  getNodeFieldDefinition,
  LIST_COLUMN_PRESETS,
  NODE_FIELD_CATEGORIES,
  NODE_FIELD_CATEGORY_LABELS,
  NODE_FIELD_DEFINITIONS,
  type NodeFieldCategory,
  type NodeFieldId,
} from "@/utils/nodeFields";
import {
  collectFieldEnumOptions,
  FILTER_OPERATORS_BY_TYPE,
  formatFilterRuleLabel,
  isRuleEffective,
  type NodeFilterOperator,
  type NodeFilterRule,
  type NodeStatusFilter,
} from "@/utils/nodeFilter";
import { HOME_SORT_FIELD_LABELS } from "@/utils/homeSort";
import { HomeSortControl } from "./HomeSortControl";

interface QuickFilterPreset {
  label: string;
  field: NodeFieldId;
  operator: NodeFilterOperator;
  value?: string;
}

const QUICK_FILTER_PRESETS: readonly QuickFilterPreset[] = [
  { label: "高 CPU (≥80%)", field: "cpu", operator: "gte", value: "80" },
  { label: "高内存 (≥80%)", field: "memory", operator: "gte", value: "80" },
  { label: "高磁盘 (≥80%)", field: "disk", operator: "gte", value: "80" },
  { label: "即将到期 (≤7天)", field: "expired_at", operator: "lte", value: "7" },
  { label: "存在丢包 (>0%)", field: "ping_loss", operator: "gt", value: "0" },
  { label: "含独立 GPU", field: "gpu_name", operator: "not_empty" },
  { label: "支持 IPv6", field: "ipv6", operator: "not_empty" },
];

interface FilterRuleRowProps {
  rule: NodeFilterRule;
  nodes: HomeNodeSummary[];
  metaByUuid: ReadonlyMap<string, NodeInfo>;
  metricsByUuid: ReadonlyMap<string, NodeMetrics>;
  nameByUuid: ReadonlyMap<string, string>;
  onUpdate: (id: string, patch: Partial<Omit<NodeFilterRule, "id">>) => void;
  onRemove: (id: string) => void;
}

function FilterRuleRow({
  rule,
  nodes,
  metaByUuid,
  metricsByUuid,
  nameByUuid,
  onUpdate,
  onRemove,
}: FilterRuleRowProps) {
  const def = getNodeFieldDefinition(rule.field);
  const operators = FILTER_OPERATORS_BY_TYPE[def.filterType];
  const needsNoValue =
    rule.operator === "empty" ||
    rule.operator === "not_empty" ||
    rule.operator === "is_true" ||
    rule.operator === "is_false";
  const isMultiEnum =
    def.filterType === "enum" && (rule.operator === "in" || rule.operator === "not_in");
  const isBetween = rule.operator === "between";

  const enumOptions = useMemo(() => {
    if (!isMultiEnum) return [];
    return collectFieldEnumOptions(rule.field, nodes, {
      metaByUuid,
      metricsByUuid,
      nameByUuid,
    });
  }, [isMultiEnum, rule.field, nodes, metaByUuid, metricsByUuid, nameByUuid]);

  const selectedValues = rule.values ?? [];

  const toggleEnumValue = (val: string) => {
    const exists = selectedValues.includes(val);
    const next = exists
      ? selectedValues.filter((item) => item !== val)
      : [...selectedValues, val];
    onUpdate(rule.id, { values: next });
  };

  return (
    <div className="node-filter-rule">
      <div className="node-filter-rule-main">
        <select
          className="node-toolbar-select node-filter-field-select"
          value={rule.field}
          aria-label="筛选字段"
          onChange={(e) => onUpdate(rule.id, { field: e.target.value as NodeFieldId })}
        >
          {NODE_FIELD_CATEGORIES.map((category) => (
            <optgroup key={category} label={NODE_FIELD_CATEGORY_LABELS[category]}>
              {NODE_FIELD_DEFINITIONS.filter((item) => item.category === category).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} ({item.shortLabel})
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <select
          className="node-toolbar-select node-filter-op-select"
          value={rule.operator}
          aria-label="筛选条件"
          onChange={(e) =>
            onUpdate(rule.id, { operator: e.target.value as NodeFilterOperator })
          }
        >
          {operators.map((op) => (
            <option key={op.value} value={op.value}>
              {op.label}
            </option>
          ))}
        </select>

        {!needsNoValue && !isMultiEnum && (
          <div className="node-filter-value-group">
            <input
              type={def.filterType === "number" ? "number" : "text"}
              step="any"
              className="node-toolbar-input node-filter-value-input"
              placeholder={isBetween ? "最小值" : `输入${def.shortLabel}...`}
              aria-label={`${def.label}筛选值`}
              value={rule.value ?? ""}
              onChange={(e) => onUpdate(rule.id, { value: e.target.value })}
            />
            {isBetween && (
              <>
                <span className="node-filter-between-sep">~</span>
                <input
                  type="number"
                  step="any"
                  className="node-toolbar-input node-filter-value-input"
                  placeholder="最大值"
                  aria-label={`${def.label}最大值`}
                  value={rule.value2 ?? ""}
                  onChange={(e) => onUpdate(rule.id, { value2: e.target.value })}
                />
              </>
            )}
            {def.unit && <span className="node-filter-unit">{def.unit}</span>}
          </div>
        )}

        <button
          type="button"
          className="node-filter-rule-remove"
          onClick={() => onRemove(rule.id)}
          aria-label="删除此筛选规则"
          title="删除规则"
        >
          <X size={13} />
        </button>
      </div>

      {isMultiEnum && (
        <div className="node-filter-enum-options">
          {enumOptions.length > 0 ? (
            enumOptions.map(({ value, count }) => {
              const checked = selectedValues.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  className="node-filter-enum-chip"
                  data-active={checked ? "true" : "false"}
                  aria-pressed={checked}
                  onClick={() => toggleEnumValue(value)}
                >
                  {checked && <Check size={11} />}
                  <span>{value}</span>
                  <small>{count}</small>
                </button>
              );
            })
          ) : (
            <span className="node-filter-enum-empty">当前节点暂无可选枚举值</span>
          )}
        </div>
      )}
    </div>
  );
}

export interface NodeDataToolbarProps {
  allNodes: HomeNodeSummary[];
  matchedCount: number;
  totalCount: number;
  metaByUuid: ReadonlyMap<string, NodeInfo>;
  metricsByUuid: ReadonlyMap<string, NodeMetrics>;
  nameByUuid: ReadonlyMap<string, string>;
  sortState: HomeSortControlState;
  showSortInToolbar: boolean;
}

export function NodeDataToolbar({
  allNodes,
  matchedCount,
  totalCount,
  metaByUuid,
  metricsByUuid,
  nameByUuid,
  sortState,
  showSortInToolbar,
}: NodeDataToolbarProps) {
  const { mode, setMode, device } = useViewMode();
  const isMobile = device === "mobile";
  const filterState = useNodeFilter();
  const columnState = useListColumns();
  const [activePanel, setActivePanel] = useState<"filter" | "columns" | null>(null);
  const [columnSearch, setColumnSearch] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const filterPanelId = useId();
  const columnPanelId = useId();

  const {
    filter,
    isActive: isFilterActive,
    activeRuleCount,
    focusFieldRequest,
    setKeyword,
    setStatus,
    addRule,
    updateRule,
    removeRule,
    clearRules,
    clearFilter,
    clearFocusFieldRequest,
  } = filterState;

  const {
    columns,
    isCustomized: isColumnsCustomized,
    setColumns,
    toggleColumn,
    moveColumn,
    reorderColumns,
    applyPreset,
    resetColumns,
  } = columnState;

  // 响应来自列表表头的某列快速筛选请求
  useEffect(() => {
    if (!focusFieldRequest) return;
    setActivePanel("filter");
    clearFocusFieldRequest();
  }, [focusFieldRequest, clearFocusFieldRequest]);

  // 点击外部或按 Escape 关闭浮层
  useEffect(() => {
    if (!activePanel) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!toolbarRef.current?.contains(event.target as Node)) {
        setActivePanel(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActivePanel(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [activePanel]);

  const filteredFieldDefinitions = useMemo(() => {
    const q = columnSearch.trim().toLowerCase();
    if (!q) return NODE_FIELD_DEFINITIONS;
    return NODE_FIELD_DEFINITIONS.filter(
      (def) =>
        def.label.toLowerCase().includes(q) ||
        def.shortLabel.toLowerCase().includes(q) ||
        def.id.toLowerCase().includes(q) ||
        def.description.toLowerCase().includes(q),
    );
  }, [columnSearch]);

  const activeEffectiveRules = useMemo(
    () => filter.rules.filter(isRuleEffective),
    [filter.rules],
  );

  const toggleCategoryColumns = (category: NodeFieldCategory) => {
    const categoryIds = NODE_FIELD_DEFINITIONS.filter((d) => d.category === category).map(
      (d) => d.id,
    );
    const allSelected = categoryIds.every((id) => columns.includes(id));
    if (allSelected) {
      const remaining = columns.filter((id) => !categoryIds.includes(id));
      setColumns(remaining.length > 0 ? remaining : ["node"]);
    } else {
      setColumns(Array.from(new Set([...columns, ...categoryIds])));
    }
  };

  const applyQuickPreset = (preset: QuickFilterPreset) => {
    addRule({
      field: preset.field,
      operator: preset.operator,
      value: preset.value ?? "",
    });
  };

  const statusOptions: { value: NodeStatusFilter; label: string }[] = [
    { value: "all", label: "全部" },
    { value: "online", label: "在线" },
    { value: "offline", label: "离线" },
  ];

  return (
    <section
      className="node-data-toolbar-wrap"
      ref={toolbarRef}
      aria-label="节点搜索、筛选、排序与字段定制工具栏"
    >
      <div className="node-data-toolbar">
        {/* 全字段关键字搜索 */}
        <div className="node-toolbar-search">
          <Search size={14} className="node-toolbar-search-icon" />
          <input
            type="search"
            value={filter.keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索节点名称、系统、CPU/GPU、IP、地区、标签、备注..."
            className="node-toolbar-search-input"
            aria-label="搜索节点任意字段"
          />
          {filter.keyword && (
            <button
              type="button"
              className="node-toolbar-search-clear"
              onClick={() => setKeyword("")}
              aria-label="清空搜索关键字"
              title="清空搜索"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* 在线状态快速筛选 */}
        <div className="node-toolbar-status-pills" role="group" aria-label="在线状态筛选">
          {statusOptions.map((opt) => {
            const active = filter.status === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                className="node-toolbar-status-pill"
                data-active={active ? "true" : "false"}
                aria-pressed={active}
                onClick={() => setStatus(opt.value)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="node-toolbar-actions">
          {/* 高级多字段筛选器按钮 */}
          <button
            type="button"
            className="node-toolbar-btn"
            data-active={activePanel === "filter" || activeRuleCount > 0 ? "true" : "false"}
            aria-expanded={activePanel === "filter"}
            aria-controls={activePanel === "filter" ? filterPanelId : undefined}
            onClick={() => {
              setActivePanel((cur) => {
                const next = cur === "filter" ? null : "filter";
                if (next === "filter" && filter.rules.length === 0) {
                  addRule({ field: "cpu", operator: "gte", value: "" });
                }
                return next;
              });
            }}
          >
            <ListFilter size={14} />
            <span>筛选</span>
            {activeRuleCount > 0 && (
              <span className="node-toolbar-badge">{activeRuleCount}</span>
            )}
          </button>

          {/* 列表显示字段定制按钮（桌面端或列表视图常驻） */}
          {!isMobile && (
            <button
              type="button"
              className="node-toolbar-btn"
              data-active={activePanel === "columns" || isColumnsCustomized ? "true" : "false"}
              aria-expanded={activePanel === "columns"}
              aria-controls={activePanel === "columns" ? columnPanelId : undefined}
              onClick={() =>
                setActivePanel((cur) => (cur === "columns" ? null : "columns"))
              }
              title={`自主勾选与调整列表显示的字段列（共 ${ALL_NODE_FIELD_IDS.length} 个采集字段）`}
            >
              <SlidersHorizontal size={14} />
              <span>字段</span>
              <span className="node-toolbar-badge is-subtle">
                {columns.length}/{ALL_NODE_FIELD_IDS.length}
              </span>
            </button>
          )}

          {/* 全字段排序下拉 */}
          {showSortInToolbar && <HomeSortControl state={sortState} />}
        </div>
      </div>

      {/* 已生效筛选与排序状态条 */}
      {(isFilterActive || sortState.field !== "default") && (
        <div className="node-toolbar-active-bar" role="status" aria-live="polite">
          <span className="node-toolbar-match-count tabular">
            显示 <strong>{matchedCount}</strong> / {totalCount} 台节点
          </span>

          <div className="node-toolbar-active-chips">
            {filter.keyword.trim() && (
              <button
                type="button"
                className="node-toolbar-active-chip"
                onClick={() => setKeyword("")}
                title="点击移除关键字筛选"
              >
                <span>搜索: &ldquo;{filter.keyword.trim()}&rdquo;</span>
                <X size={11} />
              </button>
            )}

            {filter.status !== "all" && (
              <button
                type="button"
                className="node-toolbar-active-chip"
                onClick={() => setStatus("all")}
                title="点击恢复全部状态"
              >
                <span>状态: {filter.status === "online" ? "仅在线" : "仅离线"}</span>
                <X size={11} />
              </button>
            )}

            {activeEffectiveRules.map((rule) => (
              <button
                key={rule.id}
                type="button"
                className="node-toolbar-active-chip"
                onClick={() => removeRule(rule.id)}
                title="点击移除此筛选条件"
              >
                <span>{formatFilterRuleLabel(rule)}</span>
                <X size={11} />
              </button>
            ))}

            {sortState.field !== "default" && (
              <button
                type="button"
                className="node-toolbar-active-chip is-sort"
                onClick={() => sortState.setField("default")}
                title="点击恢复默认权重排序"
              >
                <span>
                  排序: {HOME_SORT_FIELD_LABELS[sortState.field]}{" "}
                  {sortState.direction === "asc" ? "↑" : "↓"}
                </span>
                <X size={11} />
              </button>
            )}
          </div>

          {isFilterActive && (
            <button
              type="button"
              className="node-toolbar-reset-link"
              onClick={clearFilter}
            >
              <RotateCcw size={12} />
              <span>清空筛选</span>
            </button>
          )}
        </div>
      )}

      {/* 面板 1：全字段多条件筛选构建器 */}
      {activePanel === "filter" && (
        <div
          id={filterPanelId}
          className="node-toolbar-drawer motion-overlay-enter"
          role="region"
          aria-label="全字段条件筛选器"
        >
          <div className="node-toolbar-drawer-head">
            <div>
              <h3 className="node-toolbar-drawer-title">
                多维度字段筛选（支持全部 {ALL_NODE_FIELD_IDS.length} 项采集字段）
              </h3>
              <p className="node-toolbar-drawer-subtitle">
                所有规则叠加生效（AND），枚举字段支持直接点选当前节点已有值。
              </p>
            </div>
            <div className="node-toolbar-drawer-actions">
              <button
                type="button"
                className="node-toolbar-text-btn"
                onClick={() => addRule({ field: "cpu", operator: "gte", value: "" })}
              >
                + 添加条件
              </button>
              {filter.rules.length > 0 && (
                <button
                  type="button"
                  className="node-toolbar-text-btn is-danger"
                  onClick={clearRules}
                >
                  清空条件
                </button>
              )}
              <button
                type="button"
                className="node-toolbar-icon-close"
                onClick={() => setActivePanel(null)}
                aria-label="关闭筛选面板"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* 快捷筛选预设 */}
          <div className="node-filter-presets">
            <span className="node-filter-presets-label">快捷条件：</span>
            {QUICK_FILTER_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="node-filter-preset-chip"
                onClick={() => applyQuickPreset(preset)}
              >
                + {preset.label}
              </button>
            ))}
          </div>

          <div className="node-filter-rules-list">
            {filter.rules.length === 0 ? (
              <div className="node-filter-empty">
                尚未添加字段筛选规则，点击上方「+ 添加条件」或快捷条件即可按任意字段过滤节点。
              </div>
            ) : (
              filter.rules.map((rule) => (
                <FilterRuleRow
                  key={rule.id}
                  rule={rule}
                  nodes={allNodes}
                  metaByUuid={metaByUuid}
                  metricsByUuid={metricsByUuid}
                  nameByUuid={nameByUuid}
                  onUpdate={updateRule}
                  onRemove={removeRule}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* 面板 2：列表显示字段与顺序定制器 */}
      {activePanel === "columns" && (
        <div
          id={columnPanelId}
          className="node-toolbar-drawer motion-overlay-enter"
          role="region"
          aria-label="列表显示字段定制器"
        >
          <div className="node-toolbar-drawer-head">
            <div>
              <h3 className="node-toolbar-drawer-title">
                自定义列表显示字段（已选 {columns.length} / {ALL_NODE_FIELD_IDS.length} 项）
              </h3>
              <p className="node-toolbar-drawer-subtitle">
                可自由勾选任意采集字段、套用预设模板，或拖拽/点击箭头调整列顺序；配置自动保存在本地浏览器。
              </p>
            </div>
            <div className="node-toolbar-drawer-actions">
              {mode !== "list" && (
                <button
                  type="button"
                  className="node-toolbar-primary-btn"
                  onClick={() => setMode("list")}
                >
                  切换到列表视图查看
                </button>
              )}
              {isColumnsCustomized && (
                <button
                  type="button"
                  className="node-toolbar-text-btn"
                  onClick={resetColumns}
                >
                  <RotateCcw size={12} />
                  恢复默认列
                </button>
              )}
              <button
                type="button"
                className="node-toolbar-icon-close"
                onClick={() => setActivePanel(null)}
                aria-label="关闭字段定制面板"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* 预设列模板 */}
          <div className="node-columns-presets">
            <span className="node-filter-presets-label">预设视图方案：</span>
            {LIST_COLUMN_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="node-filter-preset-chip"
                onClick={() => applyPreset(preset.id)}
                title={preset.description}
              >
                {preset.label} ({preset.columns.length})
              </button>
            ))}
          </div>

          {/* 当前激活列顺序（支持拖拽与左右微调） */}
          <div className="node-columns-active-section">
            <div className="node-columns-section-title">
              当前显示列顺序（拖拽胶囊或点击左右箭头调整顺序，点击表头可直接按该列排序）
            </div>
            <div className="node-columns-active-strip">
              {columns.map((colId, idx) => {
                const def = getNodeFieldDefinition(colId);
                return (
                  <div
                    key={colId}
                    className="node-column-order-chip"
                    draggable
                    onDragStart={() => setDragIndex(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragIndex !== null && dragIndex !== idx) {
                        reorderColumns(dragIndex, idx);
                      }
                      setDragIndex(null);
                    }}
                    onDragEnd={() => setDragIndex(null)}
                  >
                    <span className="node-column-order-index">{idx + 1}</span>
                    <span className="node-column-order-label" title={def.description}>
                      {def.shortLabel}
                    </span>
                    <div className="node-column-order-controls">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveColumn(colId, -1)}
                        aria-label={`${def.label}左移`}
                        title="左移"
                      >
                        <ChevronLeft size={11} />
                      </button>
                      <button
                        type="button"
                        disabled={idx === columns.length - 1}
                        onClick={() => moveColumn(colId, 1)}
                        aria-label={`${def.label}右移`}
                        title="右移"
                      >
                        <ArrowLeft size={11} style={{ transform: "rotate(180deg)" }} />
                      </button>
                      <button
                        type="button"
                        disabled={columns.length <= 1}
                        onClick={() => toggleColumn(colId)}
                        aria-label={`移除${def.label}列`}
                        title="隐藏此列"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 搜索字段 */}
          <div className="node-columns-search-row">
            <Search size={13} className="node-toolbar-search-icon" />
            <input
              type="search"
              value={columnSearch}
              onChange={(e) => setColumnSearch(e.target.value)}
              placeholder="搜索 64 个字段名称、简称、ID 或说明..."
              className="node-toolbar-search-input"
              aria-label="搜索可显示字段"
            />
            {columnSearch && (
              <button
                type="button"
                className="node-toolbar-search-clear"
                onClick={() => setColumnSearch("")}
                aria-label="清空字段搜索"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* 按分类展示全部 64 个字段复选框 */}
          <div className="node-columns-categories">
            {NODE_FIELD_CATEGORIES.map((category) => {
              const items = filteredFieldDefinitions.filter((d) => d.category === category);
              if (items.length === 0) return null;
              const selectedInCat = items.filter((d) => columns.includes(d.id)).length;
              return (
                <div key={category} className="node-columns-category-group">
                  <div className="node-columns-category-head">
                    <span className="node-columns-category-title">
                      {NODE_FIELD_CATEGORY_LABELS[category]}
                      <small>
                        ({selectedInCat}/{items.length})
                      </small>
                    </span>
                    <button
                      type="button"
                      className="node-toolbar-text-btn"
                      onClick={() => toggleCategoryColumns(category)}
                    >
                      {selectedInCat === items.length ? "取消本组" : "全选本组"}
                    </button>
                  </div>
                  <div className="node-columns-grid">
                    {items.map((def) => {
                      const checked = columns.includes(def.id);
                      return (
                        <button
                          key={def.id}
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          data-active={checked ? "true" : "false"}
                          className="node-column-field-card"
                          onClick={() => toggleColumn(def.id)}
                          title={`${def.label} (${def.id})：${def.description}`}
                        >
                          <span className="node-column-field-check">
                            {checked && <Check size={11} />}
                          </span>
                          <span className="node-column-field-texts">
                            <span className="node-column-field-name">
                              {def.label}
                              {def.shortLabel !== def.label && (
                                <small>{def.shortLabel}</small>
                              )}
                            </span>
                            <span className="node-column-field-desc">{def.description}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
