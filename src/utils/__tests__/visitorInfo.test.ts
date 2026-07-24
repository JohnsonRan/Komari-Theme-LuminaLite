import { describe, expect, it } from "vitest";
import {
  shortenIp,
  VISITOR_INFO_PROVIDERS,
  type VisitorInfo,
} from "@/utils/visitorInfo";

const [ipwhois, ipapi, ipsb] = VISITOR_INFO_PROVIDERS;

const EXPECTED: VisitorInfo = {
  ip: "203.0.113.7",
  country: "日本",
  countryCode: "JP",
  org: "Example Telecom",
};

describe("VISITOR_INFO_PROVIDERS", () => {
  it("normalizes ipwho.is, taking the org from the connection block", () => {
    expect(
      ipwhois.normalize({
        ip: " 203.0.113.7 ",
        country: "日本",
        country_code: "jp",
        connection: { isp: "Backup ISP", org: "Example Telecom" },
      }),
    ).toEqual(EXPECTED);
  });

  it("normalizes ipapi.co", () => {
    expect(
      ipapi.normalize({
        ip: "203.0.113.7",
        country_name: "日本",
        country_code: "JP",
        org: "Example Telecom",
      }),
    ).toEqual(EXPECTED);
  });

  it("normalizes ip.sb, falling back through its org field names", () => {
    expect(
      ipsb.normalize({
        ip: "203.0.113.7",
        country: "日本",
        country_code: "JP",
        asn_organization: "Example Telecom",
      }),
    ).toEqual(EXPECTED);
  });

  it("treats each provider's own error shape as a failure", () => {
    expect(ipwhois.normalize({ success: false, ip: "203.0.113.7" })).toBeNull();
    expect(ipapi.normalize({ error: true, ip: "203.0.113.7" })).toBeNull();
  });

  it("rejects a payload with no IP — that is the one field we cannot do without", () => {
    for (const provider of VISITOR_INFO_PROVIDERS) {
      expect(provider.normalize({ country: "日本" })).toBeNull();
      expect(provider.normalize(null)).toBeNull();
    }
  });

  it("keeps partial data rather than discarding the whole answer", () => {
    expect(ipapi.normalize({ ip: "203.0.113.7" })).toEqual({
      ip: "203.0.113.7",
      country: "",
      countryCode: "",
      org: "",
    });
  });
});

describe("shortenIp", () => {
  it("leaves IPv4 and short IPv6 untouched", () => {
    expect(shortenIp("203.0.113.7")).toBe("203.0.113.7");
    expect(shortenIp("2001:db8::11")).toBe("2001:db8::11");
  });

  it("elides the middle of a long IPv6, keeping head and tail", () => {
    expect(shortenIp("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe(
      "2001:0db8:85a3:…:7334",
    );
  });
});
