import type { GpuReport } from "@/types/komari";

/** 描述实际采集设备，不用静态枚举补型号，也不按同名设备去重。 */
export function getReportedGpuLabel(gpu: GpuReport | undefined): string | undefined {
  const count = gpu?.count ?? gpu?.devices?.length ?? 0;
  if (count <= 0) return undefined;
  if (count === 1) return gpu?.devices?.[0]?.name.trim() || "1 张 GPU";
  return `${count} 张 GPU 汇总`;
}
