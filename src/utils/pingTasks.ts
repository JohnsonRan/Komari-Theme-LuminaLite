import type { PingTask } from "@/types/komari";

// 首页卡片最多展示 3 个 Ping 任务（“三网延迟”）。后端配置更多任务时，按
// weight → id 的稳定顺序取前 3 个，避免卡片被任意数量的标签撑高。
export const MAX_HOMEPAGE_PING_TASKS = 3;

function taskOrder(left: PingTask, right: PingTask) {
  const leftWeight = Number.isFinite(left.weight) ? left.weight : 0;
  const rightWeight = Number.isFinite(right.weight) ? right.weight : 0;
  return leftWeight - rightWeight || left.id - right.id;
}

/**
 * 直接从 Komari 后台公开的 Ping 任务生成节点 → 任务列表。
 * 只有出现在 task.clients 中的节点会进入结果；同一节点最多取前三个任务。
 */
export function resolvePublicPingTaskIds(tasks: PingTask[]): Map<string, number[]> {
  const taskIdsByClient = new Map<string, number[]>();
  const sortedTasks = [...tasks]
    .filter((task) => Number.isSafeInteger(task.id) && task.id > 0)
    .sort(taskOrder);

  for (const task of sortedTasks) {
    const clients = new Set(
      task.clients
        .map((client) => (typeof client === "string" ? client.trim() : ""))
        .filter(Boolean),
    );
    for (const client of clients) {
      const current = taskIdsByClient.get(client);
      if (!current) {
        taskIdsByClient.set(client, [task.id]);
      } else if (
        current.length < MAX_HOMEPAGE_PING_TASKS &&
        !current.includes(task.id)
      ) {
        current.push(task.id);
      }
    }
  }

  return taskIdsByClient;
}
