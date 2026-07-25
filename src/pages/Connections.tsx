import { TodayMetricPage } from "@/components/today/TodayMetricPage";
import { connectionsTodayConfig } from "@/components/today/todayConfigs";

export function Connections() {
  return <TodayMetricPage config={connectionsTodayConfig} />;
}
