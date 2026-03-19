export type CenterTab =
  | "overview"
  | "assets"
  | "components"
  | "features"
  | "dependencies"
  | "inventory"
  | "capture"
  | "workflow"
  | "issues";

export interface ComparisonState {
  selectedSourceRowId?: string;
  selectedGeneratedNodeId?: string;
  selectedRuleId?: string;
  activeCenterTab: CenterTab;
  showConnections: boolean;
  showUnmatchedOnly: boolean;
  showWarningsOnly: boolean;
  filters: {
    itemTypes: string[];
    statuses: string[];
  };
}
