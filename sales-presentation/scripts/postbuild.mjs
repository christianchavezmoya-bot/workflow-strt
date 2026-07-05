/**
 * Patch dist/index.html for file:// compatibility.
 * Browsers block ES module scripts on file:// even when the bundle is IIFE.
 */
import { readFileSync, writeFileSync, copyFileSync, chmodSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dist = join(root, "dist");
const htmlPath = join(dist, "index.html");

let html = readFileSync(htmlPath, "utf8");

html = html
  .replace(/<script type="module" crossorigin src="/g, '<script defer src="')
  .replace(/<script type="module" src="/g, '<script defer src="')
  .replace(/<link rel="stylesheet" crossorigin href="/g, '<link rel="stylesheet" href="');

// Fallback background so the page is never blank white while loading
html = html.replace(
  "<body>",
  '<body style="margin:0;background:#060d18;color:#eef4fb;font-family:system-ui,sans-serif">'
);

writeFileSync(htmlPath, html);

// Copy offline launchers into dist for the downloadable ZIP
for (const name of ["Start-Presentation.bat", "Start-Presentation.sh", "README.txt"]) {
  const src = join(root, "dist-ready", name);
  if (existsSync(src)) copyFileSync(src, join(dist, name));
}
try {
  chmodSync(join(dist, "Start-Presentation.sh"), 0o755);
} catch {
  /* windows */
}

console.log("postbuild: index.html patched for file:// and offline launchers copied");
