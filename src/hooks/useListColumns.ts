import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import {
  DEFAULT_LIST_COLUMNS,
  isNodeFieldId,
  LIST_COLUMN_PRESETS,
  type ListColumnPresetId,
  type NodeFieldId,
} from "@/utils/nodeFields";

const STORAGE_KEY = "komaritheme:list-columns";

function readStoredColumns(): NodeFieldId[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const valid = Array.from(
      new Set(parsed.filter((item): item is NodeFieldId => isNodeFieldId(item))),
    );
    return valid.length > 0 ? valid : null;
  } catch {
    return null;
  }
}

function writeStoredColumns(columns: NodeFieldId[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
  } catch {
    // 忽略隐私模式或配额异常
  }
}

function clearStoredColumns() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 忽略异常
  }
}

function sameColumns(left: readonly NodeFieldId[] | null, right: readonly NodeFieldId[] | null) {
  if (left === right) return true;
  if (!left || !right) return false;
  if (left.length !== right.length) return false;
  return left.every((col, index) => col === right[index]);
}

const listeners = new Set<() => void>();
let snapshot: NodeFieldId[] | null = null;
let initialized = false;

function getSnapshot(): NodeFieldId[] | null {
  if (!initialized) {
    initialized = true;
    snapshot = readStoredColumns();
  }
  return snapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange(next: NodeFieldId[] | null) {
  snapshot = next;
  initialized = true;
  listeners.forEach((listener) => listener());
}

export interface ListColumnsControlState {
  columns: NodeFieldId[];
  isCustomized: boolean;
  setColumns: (next: NodeFieldId[]) => void;
  toggleColumn: (field: NodeFieldId) => void;
  moveColumn: (field: NodeFieldId, delta: -1 | 1) => void;
  reorderColumns: (fromIndex: number, toIndex: number) => void;
  applyPreset: (presetId: ListColumnPresetId) => void;
  resetColumns: () => void;
}

export function useListColumns(): ListColumnsControlState {
  const themeSettings = useThemeSettings();
  const defaultColumns = themeSettings.listDefaultColumns ?? DEFAULT_LIST_COLUMNS;
  const override = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const columns = override ?? defaultColumns;
  const isCustomized = override !== null && !sameColumns(override, defaultColumns);

  const setColumns = useCallback(
    (next: NodeFieldId[]) => {
      const normalized = Array.from(new Set(next.filter((id) => isNodeFieldId(id))));
      if (normalized.length === 0) return;
      if (sameColumns(normalized, defaultColumns)) {
        clearStoredColumns();
        emitChange(null);
      } else {
        writeStoredColumns(normalized);
        emitChange(normalized);
      }
    },
    [defaultColumns],
  );

  const toggleColumn = useCallback(
    (field: NodeFieldId) => {
      const exists = columns.includes(field);
      if (exists) {
        if (columns.length <= 1) return; // 至少保留 1 列
        setColumns(columns.filter((col) => col !== field));
      } else {
        setColumns([...columns, field]);
      }
    },
    [columns, setColumns],
  );

  const moveColumn = useCallback(
    (field: NodeFieldId, delta: -1 | 1) => {
      const idx = columns.indexOf(field);
      if (idx === -1) return;
      const targetIdx = idx + delta;
      if (targetIdx < 0 || targetIdx >= columns.length) return;
      const next = [...columns];
      const [item] = next.splice(idx, 1);
      next.splice(targetIdx, 0, item);
      setColumns(next);
    },
    [columns, setColumns],
  );

  const reorderColumns = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= columns.length ||
        toIndex >= columns.length
      ) {
        return;
      }
      const next = [...columns];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      setColumns(next);
    },
    [columns, setColumns],
  );

  const applyPreset = useCallback(
    (presetId: ListColumnPresetId) => {
      if (presetId === "default") {
        clearStoredColumns();
        emitChange(null);
        return;
      }
      const preset = LIST_COLUMN_PRESETS.find((p) => p.id === presetId);
      if (preset) {
        setColumns([...preset.columns]);
      }
    },
    [setColumns],
  );

  const resetColumns = useCallback(() => {
    clearStoredColumns();
    emitChange(null);
  }, []);

  return useMemo(
    () => ({
      columns,
      isCustomized,
      setColumns,
      toggleColumn,
      moveColumn,
      reorderColumns,
      applyPreset,
      resetColumns,
    }),
    [
      columns,
      isCustomized,
      setColumns,
      toggleColumn,
      moveColumn,
      reorderColumns,
      applyPreset,
      resetColumns,
    ],
  );
}
