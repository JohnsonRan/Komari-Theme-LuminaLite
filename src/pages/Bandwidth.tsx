import { TodayMetricPage } from "@/components/today/TodayMetricPage";
import { bandwidthTodayConfig } from "@/components/today/todayConfigs";

export function Bandwidth() {
  return <TodayMetricPage config={bandwidthTodayConfig} />;
}
