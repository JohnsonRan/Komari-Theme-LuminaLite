import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PublicConfigSchema } from "@/types/komari";

// https://github.com/komari-monitor/komari-document/blob/main/dev/compatibility.md
const retired = /\brecord_enabled\b|\brecord_preserve_time\b|\bping_record_preserve_time\b|\/api\/(?:records|clients|recent|mjpeg_live)(?=[/?:'"`\s]|$)|common:getRecords/;

describe("Komari compatibility retirement", () => {
  it("does not use retired fields or endpoints in runtime code, including mocks", () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const hits: string[] = [];
    for (const file of readdirSync(root, { recursive: true })) {
      if (typeof file !== "string" || file.includes("__tests__") || !/\.tsx?$/.test(file)) continue;
      readFileSync(join(root, file), "utf8").split("\n").forEach((line, index) => {
        if (retired.test(line)) hits.push(`${file}:${index + 1}: ${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it("accepts public config with only current retention metadata", () => {
    const config = PublicConfigSchema.parse({ metric_retention_days: 90 });
    expect(config.metric_retention_days).toBe(90);
    expect(Object.keys(config).some((key) => retired.test(key))).toBe(false);
  });
});
