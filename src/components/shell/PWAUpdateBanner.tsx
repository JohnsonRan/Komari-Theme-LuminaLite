import { usePWAUpdate } from "@/hooks/usePWAUpdate";
import { RefreshCw } from "lucide-react";

export function PWAUpdateBanner() {
  const { needRefresh, doUpdate } = usePWAUpdate();

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2.5 shadow-lg backdrop-blur-md">
        <span className="text-sm text-indigo-300">新版本可用</span>
        <button
          type="button"
          onClick={doUpdate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1 text-sm font-medium text-white transition hover:bg-indigo-400"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          更新
        </button>
      </div>
    </div>
  );
}
