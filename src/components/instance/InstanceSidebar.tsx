import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { clsx } from "clsx";
import { useAuth } from "@/hooks/useAuth";
import { useAllNodeMeta, useHomeNodeSummaries } from "@/hooks/useNode";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { collectMatchingNodeUuids } from "@/utils/nodeIdentity";

// 详情页分栏布局的左侧服务器列表。与首页保持同一套可见性规则
// （隐藏节点过滤 + 未登录不看 hidden 节点），点击切换实例。
export function InstanceSidebar({ currentUuid }: { currentUuid: string }) {
  const allMeta = useAllNodeMeta();
  const summaries = useHomeNodeSummaries();
  const { hiddenNodes } = useThemeSettings();
  const { data: me } = useAuth();
  const navigate = useNavigate();

  const onlineByUuid = useMemo(
    () => new Map(summaries.map((node) => [node.uuid, node.online] as const)),
    [summaries],
  );

  const hiddenUuids = useMemo(
    () => collectMatchingNodeUuids(allMeta, hiddenNodes),
    [allMeta, hiddenNodes],
  );

  const nodes = useMemo(
    () =>
      allMeta
        .filter(
          (node) => !hiddenUuids.has(node.uuid) && (me?.logged_in === true || !node.hidden),
        )
        .map((node) => ({
          uuid: node.uuid,
          name: node.name?.trim() || node.uuid,
          weight: node.weight,
          online: onlineByUuid.get(node.uuid) ?? null,
        }))
        .sort(
          (left, right) =>
            left.weight - right.weight || left.name.localeCompare(right.name, "zh-Hans-CN"),
        ),
    [allMeta, hiddenUuids, me?.logged_in, onlineByUuid],
  );

  if (nodes.length <= 1) return null;

  return (
    <nav className="instance-sidebar" aria-label="服务器列表">
      <div className="instance-sidebar-title">服务器</div>
      <div className="instance-sidebar-list">
        {nodes.map((node) => {
          const isActive = node.uuid === currentUuid;
          const status =
            node.online === true ? "online" : node.online === false ? "offline" : "unknown";
          return (
            <button
              key={node.uuid}
              type="button"
              className={clsx("instance-sidebar-item", isActive && "is-active")}
              aria-current={isActive ? "page" : undefined}
              onClick={() => {
                if (!isActive) navigate(`/instance/${encodeURIComponent(node.uuid)}`);
              }}
            >
              <span className="instance-switcher-dot" data-status={status} aria-hidden />
              <span className="instance-sidebar-name">{node.name}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
