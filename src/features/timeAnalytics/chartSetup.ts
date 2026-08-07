/**
 * Single Chart.js entry for Time Analytics.
 *
 * Vite can load multiple chart.js copies across lazy chunks; registering
 * controllers in one file and importing Chart elsewhere leaves other copies
 * unregistered. chart.js/auto registers all built-ins on one singleton.
 */
import { Chart, registerables } from "chart.js";

Chart.register(...registerables);

export { Chart };
export type { ChartConfiguration, ChartItem } from "chart.js";
