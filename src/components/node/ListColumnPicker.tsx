import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ChevronUp, RotateCcw, SlidersHorizontal } from "@/components/ui/icons";
import type { ListColumnsState } from "@/hooks/useListColumns";
import { LIST_COLUMN_MAP, LIST_COLUMNS, type ListColumnId } from "@/utils/listColumns";

// 列表视图的「列」菜单：勾选显示哪些列，已选列可上下移动调整顺序。
export function ListColumnPicker({ state }: { state: ListColumnsState }) {
  const { columns, defaults, setColumns } = state;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const isDefault =
    columns.length === defaults.length && columns.every((id, index) => id === defaults[index]);
  const hidden = LIST_COLUMNS.filter((column) => !columns.includes(column.id));

  // 勾选/移动后该行会换位置(甚至重新挂载)，焦点会丢；下一帧把焦点放回同一行的同一个控件。
  const refocus = (...selectors: string[]) =>
    requestAnimationFrame(() => {
      for (const selector of selectors) {
        const element = rootRef.current?.querySelector<HTMLElement>(`${selector}:not(:disabled)`);
        if (element) return element.focus();
      }
    });

  const toggle = (id: ListColumnId) => {
    setColumns(columns.includes(id) ? columns.filter((item) => item !== id) : [...columns, id]);
    refocus(`input[data-column-id="${id}"]`);
  };

  const move = (index: number, delta: -1 | 1) => {
    const next = [...columns];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setColumns(next);
    // 到顶/底后该方向按钮被禁用，焦点落到同一行的另一个方向。
    const id = columns[index];
    refocus(`[data-move-id="${id}"][data-delta="${delta}"]`, `[data-move-id="${id}"]`);
  };

  return (
    <div
      className="home-sort list-column-picker"
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="home-sort-trigger"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="选择列表显示的列"
        onClick={() => setOpen((value) => !value)}
      >
        <SlidersHorizontal size={14} />
        <span className="home-sort-trigger-label">列</span>
      </button>
      {open && (
        <div
          id={panelId}
          className="home-sort-panel list-column-panel motion-overlay-enter"
          role="group"
          aria-label="列表显示的列"
        >
          <div className="list-column-head">
            <span>「节点」列固定在最前</span>
            <button type="button" disabled={isDefault} onClick={() => setColumns([...defaults])}>
              <RotateCcw size={12} />
              恢复默认
            </button>
          </div>
          <ul className="list-column-items">
            {columns.map((id, index) => {
              const label = LIST_COLUMN_MAP.get(id)!.label;
              return (
                <li key={id} className="list-column-item">
                  <label>
                    <input type="checkbox" data-column-id={id} checked onChange={() => toggle(id)} />
                    <span>{label}</span>
                  </label>
                  <button
                    type="button"
                    data-move-id={id}
                    data-delta="-1"
                    aria-label={`上移「${label}」`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    data-move-id={id}
                    data-delta="1"
                    aria-label={`下移「${label}」`}
                    disabled={index === columns.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ChevronDown size={14} />
                  </button>
                </li>
              );
            })}
            {hidden.map((column) => (
              <li key={column.id} className="list-column-item">
                <label>
                  <input
                    type="checkbox"
                    data-column-id={column.id}
                    checked={false}
                    onChange={() => toggle(column.id)}
                  />
                  <span>{column.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
