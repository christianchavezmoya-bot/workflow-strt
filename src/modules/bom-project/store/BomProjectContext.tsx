/**
 * BomProjectContext.tsx
 * Self-contained state for the BOM module. Uses React Context + useReducer
 * so it has zero impact on the main Redux store.
 */
import { createContext, useContext, useReducer, type ReactNode } from "react";
import type { BomImportRun } from "../types/importRun";
import type { ParsedWorkbook, RawWorkbookRow, MappingProfile, ColumnMappingEntry } from "../types/sourceWorkbook";
import type { CanonicalBomRow } from "../types/canonicalBom";
import type { ClassificationResult, RuleProfile } from "../types/classification";
import type { DraftProject } from "../types/projectDraft";
import type { ValidationResult } from "../types/validation";
import type { ComparisonState } from "./comparisonState";

// ── State shape ──────────────────────────────────────────────────────────────

export interface BomProjectState {
  // Run list
  runs: BomImportRun[];
  runsLoading: boolean;

  // Active import session
  activeRunId: string | null;
  activeRun: BomImportRun | null;

  // Workbook
  parsedWorkbook: ParsedWorkbook | null;
  rawRows: RawWorkbookRow[];

  // Mapping
  activeMappings: ColumnMappingEntry[];
  mappingProfiles: MappingProfile[];

  // Normalized
  normalizedRows: CanonicalBomRow[];

  // Classification
  classifications: ClassificationResult[];
  ruleProfiles: RuleProfile[];

  // Draft
  draftProject: DraftProject | null;

  // Validation
  validationResult: ValidationResult | null;

  // Comparison UI state
  comparison: ComparisonState;

  // General
  loading: boolean;
  error: string | null;
}

// ── Actions ──────────────────────────────────────────────────────────────────

export type BomAction =
  | { type: "SET_RUNS"; payload: BomImportRun[] }
  | { type: "SET_RUNS_LOADING"; payload: boolean }
  | { type: "SET_ACTIVE_RUN"; payload: BomImportRun | null }
  | { type: "SET_PARSED_WORKBOOK"; payload: ParsedWorkbook | null }
  | { type: "SET_RAW_ROWS"; payload: RawWorkbookRow[] }
  | { type: "SET_MAPPINGS"; payload: ColumnMappingEntry[] }
  | { type: "SET_MAPPING_PROFILES"; payload: MappingProfile[] }
  | { type: "SET_NORMALIZED_ROWS"; payload: CanonicalBomRow[] }
  | { type: "UPDATE_NORMALIZED_ROW"; payload: Partial<CanonicalBomRow> & { sourceRowId: string } }
  | { type: "SET_CLASSIFICATIONS"; payload: ClassificationResult[] }
  | { type: "OVERRIDE_CLASSIFICATION"; payload: ClassificationResult }
  | { type: "SET_RULE_PROFILES"; payload: RuleProfile[] }
  | { type: "SET_DRAFT"; payload: DraftProject | null }
  | { type: "SET_VALIDATION"; payload: ValidationResult | null }
  | { type: "SET_COMPARISON"; payload: Partial<ComparisonState> }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "RESET" };

// ── Initial state ────────────────────────────────────────────────────────────

const initialComparison: ComparisonState = {
  activeCenterTab: "overview",
  showConnections: true,
  showUnmatchedOnly: false,
  showWarningsOnly: false,
  filters: { itemTypes: [], statuses: [] },
};

const initialState: BomProjectState = {
  runs: [],
  runsLoading: false,
  activeRunId: null,
  activeRun: null,
  parsedWorkbook: null,
  rawRows: [],
  activeMappings: [],
  mappingProfiles: [],
  normalizedRows: [],
  classifications: [],
  ruleProfiles: [],
  draftProject: null,
  validationResult: null,
  comparison: initialComparison,
  loading: false,
  error: null,
};

// ── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state: BomProjectState, action: BomAction): BomProjectState {
  switch (action.type) {
    case "SET_RUNS":           return { ...state, runs: action.payload };
    case "SET_RUNS_LOADING":   return { ...state, runsLoading: action.payload };
    case "SET_ACTIVE_RUN":     return { ...state, activeRun: action.payload, activeRunId: action.payload?.id ?? null };
    case "SET_PARSED_WORKBOOK": return { ...state, parsedWorkbook: action.payload };
    case "SET_RAW_ROWS":       return { ...state, rawRows: action.payload };
    case "SET_MAPPINGS":       return { ...state, activeMappings: action.payload };
    case "SET_MAPPING_PROFILES": return { ...state, mappingProfiles: action.payload };
    case "SET_NORMALIZED_ROWS": return { ...state, normalizedRows: action.payload };
    case "UPDATE_NORMALIZED_ROW":
      return {
        ...state,
        normalizedRows: state.normalizedRows.map((r) =>
          r.sourceRowId === action.payload.sourceRowId ? { ...r, ...action.payload } : r
        ),
      };
    case "SET_CLASSIFICATIONS": return { ...state, classifications: action.payload };
    case "OVERRIDE_CLASSIFICATION":
      return {
        ...state,
        classifications: state.classifications.map((c) =>
          c.sourceRowId === action.payload.sourceRowId
            ? { ...action.payload, isManualOverride: true }
            : c
        ),
      };
    case "SET_RULE_PROFILES":  return { ...state, ruleProfiles: action.payload };
    case "SET_DRAFT":          return { ...state, draftProject: action.payload };
    case "SET_VALIDATION":     return { ...state, validationResult: action.payload };
    case "SET_COMPARISON":     return { ...state, comparison: { ...state.comparison, ...action.payload } };
    case "SET_LOADING":        return { ...state, loading: action.payload };
    case "SET_ERROR":          return { ...state, error: action.payload };
    case "RESET":              return initialState;
    default:                   return state;
  }
}

// ── Context ──────────────────────────────────────────────────────────────────

interface BomProjectContextValue {
  state: BomProjectState;
  dispatch: React.Dispatch<BomAction>;
}

const BomProjectContext = createContext<BomProjectContextValue | null>(null);

export function BomProjectProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <BomProjectContext.Provider value={{ state, dispatch }}>
      {children}
    </BomProjectContext.Provider>
  );
}

export function useBomProject(): BomProjectContextValue {
  const ctx = useContext(BomProjectContext);
  if (!ctx) throw new Error("useBomProject must be used inside BomProjectProvider");
  return ctx;
}
