import { useEffect, useState } from "react";
import { Globe, X } from "lucide-react";
import { Flag } from "@/components/ui/Flag";
import { useVisitorInfo } from "@/hooks/useVisitorInfo";
import { shortenIp } from "@/utils/visitorInfo";

// 常驻悬浮会遮挡节点卡底部操作区，展示几秒后自动收起；也可手动关掉。
const AUTO_DISMISS_MS = 8000;

/**
 * 底部居中的访客信息条：你的 IP / 归属地 / 运营商。
 *
 * 只在拿到结果后才出现 —— 原型里是先挂一个「获取中…」再改字，那样页面刚打开就有一条
 * 占位横条闪一下，三家接口都失败时还会永久停在「未获取到」。这里改成解析成功才渲染，
 * 失败则整条不出现：访客本来也不需要知道站点查过他的 IP 但没查到。
 */
export function VisitorInfoPill() {
  const { data } = useVisitorInfo();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!data) return;
    const handle = window.setTimeout(() => setDismissed(true), AUTO_DISMISS_MS);
    return () => window.clearTimeout(handle);
  }, [data]);

  if (!data || dismissed) return null;

  const parts = [data.country, data.org].filter(Boolean);

  return (
    <div className="visitor-pill" role="status">
      {data.countryCode ? (
        <Flag region={data.countryCode} size={13} />
      ) : (
        <Globe size={13} strokeWidth={2} className="visitor-pill-icon" />
      )}
      <span className="visitor-pill-label">本机 IP</span>
      {/* 完整地址与缩写各渲染一份，由 CSS 按视口选，避免依赖 JS 测宽度。
          缩写那份对读屏隐藏，否则整条会被念两遍 IP。 */}
      <span className="visitor-pill-ip tabular is-full" title={data.ip}>
        {data.ip}
      </span>
      <span className="visitor-pill-ip tabular is-short" title={data.ip} aria-hidden>
        {shortenIp(data.ip)}
      </span>
      {parts.length > 0 && (
        <>
          <span className="visitor-pill-divider" aria-hidden />
          <span className="visitor-pill-meta" title={parts.join(" · ")}>
            {parts.join(" · ")}
          </span>
        </>
      )}
      <button
        type="button"
        className="visitor-pill-close"
        aria-label="关闭本机信息条"
        onClick={() => setDismissed(true)}
      >
        <X size={12} strokeWidth={2.4} />
      </button>
    </div>
  );
}
