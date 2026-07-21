import { getExpireDaysRemaining, LONG_TERM_EXPIRE_DAYS } from "@/utils/format";

const INT_PRICE_FORMATTER = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const DECIMAL_PRICE_FORMATTER = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatPriceNumber(value: number) {
  return (Number.isInteger(value) ? INT_PRICE_FORMATTER : DECIMAL_PRICE_FORMATTER).format(value);
}

function isLongTermExpire(value: string | number | null | undefined) {
  if (value == null) return false;
  const days = getExpireDaysRemaining(value);
  return days != null && days > LONG_TERM_EXPIRE_DAYS;
}

type BillingCycleKind = "month" | "quarter" | "halfYear" | "year" | "lifetime";

/**
 * 把自由文本的账单周期关键词(须预先 lowercase/trim)归类成标准周期,识别不出时返回 null。
 * 续费价格的标签格式化共用它,让这套正则只存在一处。
 */
export function classifyBillingCycleWord(normalized: string): BillingCycleKind | null {
  if (/^(monthly|month|mo|月|每月)$/.test(normalized)) return "month";
  if (/^(quarterly|quarter|季|季度|每季)$/.test(normalized)) return "quarter";
  if (/^(semiannual|semi-annually|halfyear|half-year|半年)$/.test(normalized)) return "halfYear";
  if (/^(annual|annually|yearly|year|yr|年|每年)$/.test(normalized)) return "year";
  if (/^(lifetime|once|one-time|永久|一次性)$/.test(normalized)) return "lifetime";
  return null;
}

export function formatBillingCycle(value: string | number | null | undefined) {
  const raw = String(value ?? "").trim();
  const numeric = Number(raw);
  // 仅当源是真实的非空数字时才当成天数。`Number("")` 是 0(有限值),以前会让未设置的周期渲染成 "0天"。
  if (raw !== "" && Number.isFinite(numeric)) {
    if (numeric === -1) return "永久";
    if (numeric === 30) return "月";
    if (numeric === 90) return "季";
    if (numeric === 180) return "半年";
    if (numeric === 365 || numeric === 360) return "年";
    if (numeric > 0 && numeric % 365 === 0) return `${numeric / 365}年`;
    if (numeric > 0) return `${numeric}天`;
    // numeric <= 0(如 0)落到下面的标签兜底分支。
  }

  switch (classifyBillingCycleWord(raw.toLowerCase())) {
    case "month":
      return "月";
    case "quarter":
      return "季";
    case "halfYear":
      return "半年";
    case "lifetime":
      return "永久";
    case "year":
    default:
      return "年";
  }
}

export function formatRenewalPrice({
  price,
  currency,
  billing_cycle,
  expired_at,
}: {
  price: number;
  currency: string;
  billing_cycle?: string | number | null;
  expired_at?: string | number | null;
}) {
  if (!Number.isFinite(price)) return null;
  if (price === -1) return "免费";
  if (price === 0) return isLongTermExpire(expired_at) ? "免费" : null;
  if (price < 0) return null;

  const symbol = currency?.trim() || "¥";
  const cycle = formatBillingCycle(billing_cycle);
  return `${symbol}${formatPriceNumber(price)}/${cycle}`;
}
