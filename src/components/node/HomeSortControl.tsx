import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MorphIcon, Search, X, iconData } from "@/components/ui/icons";
import {
  HOME_SORT_FIELDS,
  HOME_SORT_FIELD_LABELS,
  type HomeSortDirection,
  type HomeSortField,
} from "@/utils/homeSort";
import type { HomeSortControlState } from "@/hooks/useHomeSort";

// 单个图标同时表达排序与方向。
function SortIcon({ direction, size = 14 }: { direction: HomeSortDirection; size?: number }) {
  return (
    <MorphIcon
      icon={direction === "asc" ? iconData.ArrowUpNarrowWide : iconData.ArrowDownWideNarrow}
      size={size}
      spring="snappy"
    />
  );
}

// 选择当前维度会翻转方向，选择其他维度会采用该维度的自然方向。
export function HomeSortControl({ state }: { state: HomeSortControlState }) {
  const { field, direction, setField, toggleDirection } = state;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const panelId = useId();

  const visibleFields = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return HOME_SORT_FIELDS;
    return HOME_SORT_FIELDS.filter(
      (option) =>
        HOME_SORT_FIELD_LABELS[option].toLowerCase().includes(q) ||
        option.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const activeIndex = visibleFields.indexOf(field);
    const targetIndex = activeIndex >= 0 ? activeIndex : 0;
    const timer = requestAnimationFrame(() => {
      itemRefs.current[targetIndex]?.focus();
    });

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      cancelAnimationFrame(timer);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, field, visibleFields]);

  const closeAndFocusTrigger = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleSelect = (next: HomeSortField) => {
    if (next === field) toggleDirection();
    else setField(next);
    closeAndFocusTrigger();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndFocusTrigger();
    }
  };

  const handleItemKeyDown = (event: React.KeyboardEvent, index: number) => {
    const total = visibleFields.length || 1;
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndFocusTrigger();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = (index + 1) % total;
      itemRefs.current[nextIndex]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const prevIndex = (index - 1 + total) % total;
      itemRefs.current[prevIndex]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      itemRefs.current[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      itemRefs.current[total - 1]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div className="home-sort" ref={rootRef} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className="home-sort-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`排序方式，当前${HOME_SORT_FIELD_LABELS[field]}${direction === "asc" ? "升序" : "降序"}`}
        title={`排序：${HOME_SORT_FIELD_LABELS[field]}（${direction === "asc" ? "升序" : "降序"}）`}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={handleTriggerKeyDown}
      >
        <SortIcon direction={direction} />
        <span className="home-sort-trigger-label">{HOME_SORT_FIELD_LABELS[field]}</span>
      </button>
      {open && (
        <div
          id={panelId}
          className="home-sort-panel motion-overlay-enter"
          role="menu"
          aria-label="排序方式"
          aria-orientation="vertical"
        >
          <div className="home-sort-search-wrap">
            <Search size={12} className="home-sort-search-icon" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索排序字段 (64项)..."
              className="home-sort-search-input"
              aria-label="搜索排序字段"
            />
            {query && (
              <button
                type="button"
                className="home-sort-search-clear"
                onClick={() => setQuery("")}
                aria-label="清空搜索"
              >
                <X size={11} />
              </button>
            )}
          </div>
          <div className="home-sort-list">
            {visibleFields.map((option, index) => {
              const active = option === field;
              return (
                <button
                  key={option}
                  ref={(el) => {
                    itemRefs.current[index] = el;
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  data-active={active ? "true" : "false"}
                  tabIndex={active ? 0 : -1}
                  className="home-sort-item"
                  onClick={() => handleSelect(option)}
                  onKeyDown={(e) => handleItemKeyDown(e, index)}
                >
                  <span className="home-sort-item-label">{HOME_SORT_FIELD_LABELS[option]}</span>
                  {active && <SortIcon direction={direction} size={15} />}
                </button>
              );
            })}
            {visibleFields.length === 0 && (
              <div className="home-sort-empty">无匹配排序字段</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
