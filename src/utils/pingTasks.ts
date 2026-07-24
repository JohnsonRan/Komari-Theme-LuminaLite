export type HomepagePingTaskBindings = Record<string, string[]>;

// 单个节点最多可绑定的首页 Ping 任务数（“三网延迟”这类场景）。超出的绑定在归一化阶段
// 就被丢掉，所以存储层的脏数据不会让首页多拉请求、多画一列。
export const MAX_HOMEPAGE_PING_TASKS = 3;

function parseTaskId(taskId: string) {
  if (!/^\d+$/.test(taskId)) return null;
  const parsed = Number(taskId);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function normalizeHomepagePingTaskBindings(
  value: unknown,
): HomepagePingTaskBindings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalized: HomepagePingTaskBindings = {};
  for (const [taskId, clients] of Object.entries(value)) {
    const numericTaskId = parseTaskId(taskId);
    if (numericTaskId == null || !Array.isArray(clients)) continue;

    const uniqueClients = Array.from(
      new Set(
        clients
          .map((client) => (typeof client === "string" ? client.trim() : ""))
          .filter(Boolean),
      ),
    );
    if (uniqueClients.length === 0) {
      continue;
    }

    const normalizedTaskId = String(numericTaskId);
    normalized[normalizedTaskId] = Array.from(
      new Set([...(normalized[normalizedTaskId] ?? []), ...uniqueClients]),
    );
  }

  return normalized;
}

// client uuid → 该节点绑定的任务 id 列表，按 task id 升序、最多 MAX_HOMEPAGE_PING_TASKS 个。
// 顺序即首页卡片的展示顺序，第一个是“主任务”（数值/丢包/实时数据默认取它）。
export function resolveHomepagePingTaskIds(
  bindings: HomepagePingTaskBindings,
): Map<string, number[]> {
  const taskIdsByClient = new Map<string, number[]>();
  const entries = Object.entries(normalizeHomepagePingTaskBindings(bindings)).sort(
    ([left], [right]) => Number(left) - Number(right),
  );

  for (const [taskId, clients] of entries) {
    const numericTaskId = parseTaskId(taskId);
    if (numericTaskId == null) continue;
    for (const client of clients) {
      const current = taskIdsByClient.get(client);
      if (!current) {
        taskIdsByClient.set(client, [numericTaskId]);
      } else if (
        current.length < MAX_HOMEPAGE_PING_TASKS &&
        !current.includes(numericTaskId)
      ) {
        current.push(numericTaskId);
      }
    }
  }

  return taskIdsByClient;
}

// 只取主任务的窄化视图：实时通道解析、模拟延迟回退等只关心“归属哪个任务”的调用方用它。
export function invertHomepagePingTaskBindings(
  bindings: HomepagePingTaskBindings,
): Map<string, number> {
  const selectedTaskByClient = new Map<string, number>();
  for (const [client, taskIds] of resolveHomepagePingTaskIds(bindings)) {
    if (taskIds.length > 0) selectedTaskByClient.set(client, taskIds[0]);
  }
  return selectedTaskByClient;
}
