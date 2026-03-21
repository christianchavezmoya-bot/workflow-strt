/**
 * BOM-to-Project Module — public entry point
 * Only import from here in the app shell (routes.tsx, Sidebar.tsx).
 * Do NOT import module internals from outside this module.
 */
export { BOM_MODULE_ENABLED } from "./featureFlag";
export { BomProjectProvider } from "./store/BomProjectContext";
export { default as BomDashboard } from "./pages/BomDashboard";
export { default as BomUploadPage } from "./pages/BomUploadPage";
export { default as BomMappingPage } from "./pages/BomMappingPage";
export { default as BomClassificationPage } from "./pages/BomClassificationPage";
export { default as BomCommitPage } from "./pages/BomCommitPage";
