// 访客自身的 IP / 归属地 / 运营商。
//
// 这些信息只能由访客的浏览器直接问第三方 —— 后端看到的是它自己那侧的连接，
// 拿不到访客视角的运营商归属。因此这里必然是跨站请求，站长在设置里开启即意味着
// 接受「访客 IP 会被这几家接口看到」（它们本来就要看到 IP 才能回答）。

export interface VisitorInfo {
  ip: string;
  /** 归属国家/地区名称，接口未给出时为空串。 */
  country: string;
  /** ISO 3166-1 alpha-2 国家码，用于渲染国旗；接口未给出时为空串。 */
  countryCode: string;
  /** 运营商 / ASN 组织名，接口未给出时为空串。 */
  org: string;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 取第一个非空字符串 —— 各家接口把运营商放在不同字段里。 */
function firstText(...values: unknown[]): string {
  for (const value of values) {
    const trimmed = text(value);
    if (trimmed) return trimmed;
  }
  return "";
}

function build(
  ip: unknown,
  country: unknown,
  countryCode: unknown,
  org: unknown,
): VisitorInfo | null {
  const resolved = text(ip);
  if (!resolved) return null;
  return {
    ip: resolved,
    country: text(country),
    countryCode: text(countryCode).toUpperCase(),
    org: text(org),
  };
}

export interface VisitorInfoProvider {
  url: string;
  normalize: (payload: unknown) => VisitorInfo | null;
}

/**
 * 依次回退的免费接口。任一返回可用结果即停止，全部失败则不展示信息条
 * —— 与其显示「未获取到」，不如什么都不显示。
 */
export const VISITOR_INFO_PROVIDERS: VisitorInfoProvider[] = [
  {
    url: "https://ipwho.is/",
    normalize: (payload) => {
      const data = payload as Record<string, unknown> | null;
      if (!data || data.success === false) return null;
      const connection = (data.connection ?? {}) as Record<string, unknown>;
      return build(
        data.ip,
        data.country,
        data.country_code,
        firstText(connection.org, connection.isp, connection.domain),
      );
    },
  },
  {
    url: "https://ipapi.co/json/",
    normalize: (payload) => {
      const data = payload as Record<string, unknown> | null;
      if (!data || data.error === true) return null;
      return build(data.ip, data.country_name, data.country_code, data.org);
    },
  },
  {
    url: "https://api.ip.sb/geoip",
    normalize: (payload) => {
      const data = payload as Record<string, unknown> | null;
      if (!data) return null;
      return build(
        data.ip,
        data.country,
        data.country_code,
        firstText(data.organization, data.isp, data.asn_organization),
      );
    },
  },
];

/**
 * 窄屏用的 IPv6 缩写：保头保尾、中间省略。
 * IPv4 和短 IPv6 原样返回 —— 它们本来就放得下，截断只会让人看不出是哪台。
 */
export function shortenIp(ip: string): string {
  if (!ip.includes(":") || ip.length <= 24) return ip;
  const groups = ip.split(":");
  if (groups.length < 5) return ip;
  return `${groups[0]}:${groups[1]}:${groups[2]}:…:${groups[groups.length - 1]}`;
}
