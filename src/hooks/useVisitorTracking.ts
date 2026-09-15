import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const DEBOUNCE_MS = 300;

/**
 * 页面切换时向后端上报访客事件（fire-and-forget）。
 * 是否记录由服务端 visitor_audit_enabled 控制，与监控历史记录无关。
 * 不采集任何用户标识，仅上报 path + event（referrer 放入 detail）。
 */
export function useVisitorTracking() {
  const { pathname } = useLocation();
  const timerRef = useRef<number | null>(null);
  const prevPathRef = useRef<string>("");

  useEffect(() => {
    // 已上报过的路径不重复发送；防抖取消时不提前标记（含 StrictMode 重放）。
    if (pathname === prevPathRef.current) return;

    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      prevPathRef.current = pathname;
      void import("@/services/api")
        .then(({ recordVisitorEvent }) => {
          recordVisitorEvent({
            event: "pageview",
            path: pathname,
            detail: document.referrer ? { referrer: document.referrer } : undefined,
          });
        })
        .catch(() => undefined);
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [pathname]);
}
