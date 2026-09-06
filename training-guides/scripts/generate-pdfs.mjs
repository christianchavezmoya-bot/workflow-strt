#!/usr/bin/env node
/**
 * Generate print-ready PDFs from training guide HTML pages.
 * Uses Playwright from the repo root (npm install at repo root required).
 *
 * Usage (from repo root):
 *   node training-guides/scripts/generate-pdfs.mjs
 */
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PDF_DIR = path.join(ROOT, "pdf");

const GUIDES = [
  { html: "guides/01-customers-and-sites.html", pdf: "01-customers-and-sites.pdf" },
  { html: "guides/02-catalog-setup.html", pdf: "02-catalog-setup.pdf" },
  { html: "guides/03-projects.html", pdf: "03-projects.pdf" },
  { html: "guides/04-workflows-builder.html", pdf: "04-workflows-builder.pdf" },
  { html: "index.html", pdf: "00-training-guides-index.pdf" },
];

async function main() {
  fs.mkdirSync(PDF_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  for (const { html, pdf } of GUIDES) {
    const filePath = path.join(ROOT, html);
    if (!fs.existsSync(filePath)) {
      console.warn(`Skip (missing): ${html}`);
      continue;
    }
    const url = `file://${filePath}`;
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    // Force read-only / all steps visible for print stylesheet
    await page.emulateMedia({ media: "print" });
    await page.pdf({
      path: path.join(PDF_DIR, pdf),
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
    });
    await page.close();
    console.log(`Wrote ${pdf}`);
  }

  await browser.close();
  console.log(`\nDone — PDFs in ${PDF_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
