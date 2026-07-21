/**
 * 订阅 MediaQueryList 的 `change` 事件并返回取消订阅函数。Safari < 14 没在 MediaQueryList 上
 * 实现 addEventListener,故回退到已废弃的 addListener/removeListener。
 */
export function subscribeMediaQuery(mq: MediaQueryList, handler: () => void): () => void {
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }
  mq.addListener(handler);
  return () => mq.removeListener(handler);
}
