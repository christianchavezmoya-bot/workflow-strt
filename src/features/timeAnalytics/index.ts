/**
 * Public surface of the timeAnalytics feature.
 *
 *   import TimeAnalyticsPage from "@/features/timeAnalytics";
 *   import { ApiTimeAnalyticsService, MockTimeAnalyticsService }
 *     from "@/features/timeAnalytics";
 *   import type { TimeAnalyticsSnapshot }
 *     from "@/features/timeAnalytics";
 *
 * The default export is the page component for ergonomic routing.
 */

import "./chartSetup";
import "./styles.css";
import TimeAnalyticsPage from "./pages/TimeAnalyticsPage";
export default TimeAnalyticsPage;

export { default as TimeAnalyticsPage } from "./pages/TimeAnalyticsPage";
export { TIME_ANALYTICS_VIEWS } from "./pages/TimeAnalyticsPage";
export type { TimeAnalyticsViewId } from "./pages/TimeAnalyticsPage";

export { useTimeAnalyticsData, defaultTimeAnalyticsFetchMode } from "./hooks/useTimeAnalyticsData";
export type { UseTimeAnalyticsDataOptions, UseTimeAnalyticsDataResult, FetchMode } from "./hooks/useTimeAnalyticsData";

export {
  ApiTimeAnalyticsService,
  MockTimeAnalyticsService,
} from "./services/timeAnalyticsService";
export type { TimeAnalyticsService } from "./services/timeAnalyticsService";

export * from "./types";
