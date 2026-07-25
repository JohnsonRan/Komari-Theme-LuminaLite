import { AlertTriangle } from "lucide-react";
import type { AttentionResult } from "@/utils/nodeAttention";

/**
 * 「需要关注」的可见原因条。四种视图共用：原因命中时渲染一条胶囊,
 * 把原来只藏在 title tooltip 里的 reasons 直接摆出来 —— 置顶是为了让人一眼看到问题,
 * 还要 hover 才知道「为什么被顶上来」就白顶了。
 *
 * 胶囊纵向压进卡片既有 gap 里、横向拉出卡片 padding 贴到边缘,不额外占高 ——
 * 详见 node-card.css 里 .attention-reasons 的注释。
 */
export function AttentionReasons({ attention }: { attention: AttentionResult }) {
  if (attention.level === "none") return null;
  return (
    <p className="attention-reasons" aria-label={`需要关注：${attention.reasons.join("，")}`}>
      <AlertTriangle size={11} strokeWidth={2.2} aria-hidden />
      <span>{attention.reasons.join(" · ")}</span>
    </p>
  );
}
