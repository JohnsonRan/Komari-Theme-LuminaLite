import { useCallback, useState } from "react";
import { parseListColumns, type ListColumnId } from "@/utils/listColumns";

// 访客自选的列表列。与站长默认一致时清掉本地值，站长以后改默认仍能生效。
const STORAGE_KEY = "komaritheme:list-columns";

function readStored(): ListColumnId[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseListColumns(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function sameColumns(a: readonly ListColumnId[], b: readonly ListColumnId[]) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export interface ListColumnsState {
  columns: ListColumnId[];
  defaults: ListColumnId[];
  setColumns: (next: ListColumnId[]) => void;
}

export function useListColumns(defaults: ListColumnId[]): ListColumnsState {
  const [stored, setStored] = useState(readStored);

  const setColumns = useCallback(
    (next: ListColumnId[]) => {
      const custom = sameColumns(next, defaults) ? null : next;
      try {
        if (custom) localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
        else localStorage.removeItem(STORAGE_KEY);
      } catch {
        // 存不进就只保留内存态。
      }
      setStored(custom);
    },
    [defaults],
  );

  return { columns: stored ?? defaults, defaults, setColumns };
}
