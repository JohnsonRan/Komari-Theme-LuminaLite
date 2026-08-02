import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Grid3x3,
  LayoutGrid,
  List,
  Rows3,
  Settings,
  SlidersHorizontal,
  MorphIcon,
  iconData,
} from "@/components/ui/icons";
import { Link } from "react-router-dom";
import { usePreferences } from "@/hooks/usePreferences";
import { MotionSettingsProvider } from "@/components/ui/MotionSettings";
import { useViewMode } from "@/hooks/useViewMode";
import { useNodeStoreStatus } from "@/hooks/useNode";
import { useAuth } from "@/hooks/useAuth";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import type { NodeViewMode } from "@/utils/themeSettings";
import { clsx } from "clsx";

// 悬浮球切换按钮展示"下一档"的图标/文案(点击后会切到的视图),而不是当前视图——
// 与 ThemeManage 里 NODE_VIEW_MODE_OPTIONS 的图标语义保持一致。
const VIEW_MODE_META: Record<NodeViewMode, { icon: typeof LayoutGrid; label: string }> = {
  large: { icon: LayoutGrid, label: "大视图" },
  compact: { icon: Rows3, label: "小视图" },
  mini: { icon: Grid3x3, label: "迷你视图" },
  list: { icon: List, label: "列表视图" },
};

const APPEARANCE_CYCLE = ["light", "system", "dark"] as const;

const APPEARANCE_META = {
  light: { icon: iconData.Sun, label: "浅色" },
  system: { icon: iconData.Monitor, label: "跟随系统" },
  dark: { icon: iconData.Moon, label: "深色" },
} as const;

export function FloatingControls({
  onExpandedChange,
}: {
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const { appearance, setAppearance } = usePreferences();
  const { mode, nextMode, toggleMode } = useViewMode();
  const { data: me } = useAuth();
  const themeSettings = useThemeSettings();
  const { failureStreak } = useNodeStoreStatus();
  const [collapsed, setCollapsed] = useState(true);
  const settingsReady = themeSettings.isReady;
  const showAdmin = settingsReady && themeSettings.enableAdminButton;
  // 主题管理入口仅对登录管理员开放（配色已移至主题设置页内）。
  const loggedIn = Boolean(me?.logged_in);
  const showThemeManage = loggedIn;
  const showSyncWarning = failureStreak >= 2;
  const hiddenTabIndex = collapsed ? -1 : undefined;
  const appearanceIndex = APPEARANCE_CYCLE.indexOf(appearance);
  const nextAppearance = APPEARANCE_CYCLE[(appearanceIndex + 1) % APPEARANCE_CYCLE.length];
  const appearanceMeta = APPEARANCE_META[appearance];
  const viewIconData = iconData[
    nextMode === "large"
      ? "LayoutGrid"
      : nextMode === "compact"
        ? "Rows3"
        : nextMode === "mini"
          ? "Grid3x3"
          : "List"
  ];
  // 只要不在最宽松的大卡默认态,就视为"已切换"，按钮保持高亮。
  const isReducedView = mode !== "large";
  useEffect(() => {
    onExpandedChange?.(false);
    return () => onExpandedChange?.(false);
  }, [onExpandedChange]);

  const toggleControls = () => {
    const nextCollapsed = !collapsed;
    setCollapsed(nextCollapsed);
    onExpandedChange?.(!nextCollapsed);
  };

  return (
    <MotionSettingsProvider
      iconAnimations={themeSettings.enableIconAnimations}
      dataAnimations={themeSettings.enableDataAnimations}
    >
    <div
      className={clsx(
        "floating-controls",
        collapsed && "is-collapsed",
        showSyncWarning && "has-warning",
      )}
    >
      <div className="floating-controls-inner">
        <div className="floating-controls-row">
          <div className="floating-controls-actions" aria-hidden={collapsed}>
            {settingsReady && (
              <>
                  <button
                    type="button"
                    onClick={() => setAppearance(nextAppearance)}
                    aria-label={`当前${appearanceMeta.label}，切换到${APPEARANCE_META[nextAppearance].label}`}
                    title={`外观：${appearanceMeta.label}；点击切换到${APPEARANCE_META[nextAppearance].label}`}
                    tabIndex={hiddenTabIndex}
                    className={clsx(
                      "control-button grid h-9 w-9 place-items-center",
                      appearance !== "system" && "control-toggle is-active",
                    )}
                  >
                    <MorphIcon icon={appearanceMeta.icon} size={16} spring="snappy" />
                  </button>
                <button
                  type="button"
                  onClick={toggleMode}
                  aria-label="切换卡片视图"
                  aria-pressed={isReducedView}
                  title={`临时切换到${VIEW_MODE_META[nextMode].label}`}
                  tabIndex={hiddenTabIndex}
                  className={clsx(
                    "control-button grid h-9 w-9 place-items-center",
                    isReducedView && "control-toggle is-active",
                  )}
                >
                  <MorphIcon icon={viewIconData} size={16} spring="bouncy" />
                </button>
              </>
            )}
            {showThemeManage && (
              <Link
                to="/?view=theme-manage"
                aria-label="主题设置"
                title="主题设置"
                tabIndex={hiddenTabIndex}
                className="control-button grid h-9 w-9 place-items-center"
              >
                <SlidersHorizontal size={16} />
              </Link>
            )}
            {showAdmin && (
              <a
                href="/admin"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={me?.logged_in ? "在新标签页打开管理" : "在新标签页打开后台登录"}
                title={me?.logged_in ? "管理" : "后台登录"}
                tabIndex={hiddenTabIndex}
                className="control-button grid h-9 w-9 place-items-center"
              >
                <Settings size={16} />
              </a>
            )}
          </div>
          <button
            type="button"
            className="control-button floating-controls-trigger grid h-9 w-9 place-items-center"
            aria-label={
              showSyncWarning
                ? collapsed
                  ? "展开快捷按钮，整站实时通道异常"
                  : "收起快捷按钮，整站实时通道异常"
                : collapsed
                  ? "展开快捷按钮"
                  : "收起快捷按钮"
            }
            aria-expanded={!collapsed}
            onClick={toggleControls}
            title={
              showSyncWarning
                ? "整站实时通道异常，当前为缓存数据"
                : collapsed
                  ? "展开快捷按钮"
                  : "收起快捷按钮"
            }
          >
            <MorphIcon
              icon={collapsed ? iconData.ChevronLeft : iconData.ChevronRight}
              size={16}
              spring="snappy"
            />
            {showSyncWarning && collapsed && (
              <span className="floating-controls-warning-dot" aria-hidden />
            )}
          </button>
        </div>
        {showSyncWarning && !collapsed && (
          <div
            role="status"
            aria-live="polite"
            className="floating-controls-sync-warning pointer-events-none flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--status-offline)_32%,transparent)] bg-[color-mix(in_srgb,var(--surface-a)_90%,transparent)] px-3 py-1 text-[11px] font-medium text-[var(--status-offline)] shadow-[0_10px_25px_-18px_rgba(0,0,0,0.8)]"
          >
            <AlertTriangle size={12} aria-hidden />
            <span>整站实时通道异常，显示最近缓存（非单节点离线）</span>
          </div>
        )}
      </div>
    </div>
    </MotionSettingsProvider>
  );
}
