/** Column metadata for asset list PDF/print — kept separate so UI can import without jsPDF. */

export interface PrintRow {
  assetTag:     string;
  assetName:    string;
  serialNumber: string;
  assetModel:   string;
  manufacturer: string;
  location:     string;
  assignedTech: string;
  status:       string;
  project:      string;
  siteName:     string;
  notes:        string;
  configType:   string;
  wfStatus:     string;
  sigStatus:    string;
  _techId:      string;
  _statusRaw:   string;
  _projectId:   string;
}

export interface PrintColumnDef {
  id:    keyof PrintRow;
  label: string;
  weight?: number;
}

export const ALL_PRINT_COLUMNS: PrintColumnDef[] = [
  { id: "assetTag",     label: "Asset Tag",        weight: 6 },
  { id: "assetName",    label: "Asset Name",        weight: 8 },
  { id: "serialNumber", label: "Serial #",          weight: 7 },
  { id: "assetModel",   label: "Asset Model",       weight: 7 },
  { id: "manufacturer", label: "Manufacturer",      weight: 7 },
  { id: "location",     label: "Location",          weight: 7 },
  { id: "assignedTech", label: "Assigned Tech",     weight: 8 },
  { id: "status",       label: "Status",            weight: 6 },
  { id: "project",      label: "Project",           weight: 10 },
  { id: "siteName",     label: "Site",              weight: 7 },
  { id: "configType",   label: "Config Type",       weight: 7 },
  { id: "wfStatus",     label: "Workflow Status",   weight: 8 },
  { id: "sigStatus",    label: "Signature Status",  weight: 8 },
  { id: "notes",        label: "Notes",             weight: 10 },
];

export type GroupByKey = "none" | "technician" | "status" | "project";
