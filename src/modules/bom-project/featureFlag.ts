/**
 * BOM-to-Project Module — feature flag
 * Set VITE_ENABLE_BOM_MODULE=true in .env to activate the entire module.
 * When false: routes hidden, sidebar item hidden, API calls never made.
 */
export const BOM_MODULE_ENABLED =
  import.meta.env.VITE_ENABLE_BOM_MODULE === "true";
