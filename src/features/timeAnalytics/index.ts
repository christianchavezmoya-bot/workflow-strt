/**
 * Public surface of the timeAnalytics feature.
 */

import "./chartSetup";
import "./styles.css";
import TimeAnalyticsPage from "./pages/TimeAnalyticsPage";
export default TimeAnalyticsPage;

export { default as TimeAnalyticsPage } from "./pages/TimeAnalyticsPage";
export { TIME_ANALYTICS_VIEWS } from "./pages/TimeAnalyticsPage";
export type { TimeAnalyticsViewId } from "./pages/TimeAnalyticsPage";

export { useTimeAnalyticsData } from "./hooks/useTimeAnalyticsData";
export type { UseTimeAnalyticsDataOptions, UseTimeAnalyticsDataResult } from "./hooks/useTimeAnalyticsData";

export { ApiTimeAnalyticsService } from "./services/timeAnalyticsService";
export type { TimeAnalyticsService } from "./services/timeAnalyticsService";

export * from "./types";
