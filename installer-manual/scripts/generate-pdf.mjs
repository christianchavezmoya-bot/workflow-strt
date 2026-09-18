#!/usr/bin/env node
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const htmlPath = path.join(ROOT, "index.html");
const pdfPath = path.join(ROOT, "Strata-NGo-Installer-Field-Guide.pdf");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" },
  });
  await browser.close();
  console.log("Wrote", pdfPath);
}

main().catch((e) => { console.error(e); process.exit(1); });
