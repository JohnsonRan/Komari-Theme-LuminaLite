import { useEffect, useId, useRef, useState } from "react";
import { MorphIcon, iconData } from "@/components/ui/icons";
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const activeIndex = HOME_SORT_FIELDS.indexOf(field);
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
  }, [open, field]);

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
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndFocusTrigger();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = (index + 1) % HOME_SORT_FIELDS.length;
      itemRefs.current[nextIndex]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const prevIndex = (index - 1 + HOME_SORT_FIELDS.length) % HOME_SORT_FIELDS.length;
      itemRefs.current[prevIndex]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      itemRefs.current[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      itemRefs.current[HOME_SORT_FIELDS.length - 1]?.focus();
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
          {HOME_SORT_FIELDS.map((option, index) => {
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
        </div>
      )}
    </div>
  );
}
