import { TodayMetricPage } from "@/components/today/TodayMetricPage";
import { trafficTodayConfig } from "@/components/today/todayConfigs";

export function Traffic() {
  return <TodayMetricPage config={trafficTodayConfig} />;
}
